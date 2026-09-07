import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDecipheriv, createHash, createHmac, timingSafeEqual } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TokenService } from './token.service';
import { StaffLoginDto, StaffMfaDto } from './dto/staff-auth.dto';

interface Meta {
  userAgent?: string;
  ip?: string;
  requestId: string;
}
@Injectable()
export class StaffAuthService {
  private readonly dummyPasswordHash =
    '$argon2id$v=19$m=65536,t=3,p=4$9rTiBGllFYNCwmmO9vhTqA$TlzUNYJtV10yq7sDoKbsQ2CX6oPcM/SW57cWwKepM6E';
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}
  private binding(meta: Meta) {
    return createHash('sha256')
      .update(`${meta.ip ?? ''}|${meta.userAgent ?? ''}`)
      .digest('hex');
  }

  async login(dto: StaffLoginDto, meta: Meta) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { staffProfile: { include: { role: true } } },
    });
    const valid = await argon2.verify(user?.passwordHash ?? this.dummyPasswordHash, dto.password);
    if (
      !user ||
      !valid ||
      user.deletedAt ||
      user.accountType !== 'STAFF' ||
      !user.emailVerified ||
      user.staffProfile?.status !== 'ACTIVE' ||
      !user.staffProfile.mfaEnabledAt ||
      !user.staffProfile.mfaSecretEncrypted
    ) {
      await this.audit.create(
        {
          actorId: user?.id,
          actorRole: user?.role,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
        { action: 'staff.login_denied', targetType: 'staff_session', sensitivity: 'SENSITIVE' },
      );
      throw new UnauthorizedException('Invalid staff credentials');
    }
    await this.prisma.staffAuthChallenge.deleteMany({
      where: { userId: user.id, consumedAt: null },
    });
    const challenge = await this.prisma.staffAuthChallenge.create({
      data: {
        userId: user.id,
        bindingHash: this.binding(meta),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    return { mfaRequired: true, challengeId: challenge.id, expiresIn: 300 };
  }

  async verify(dto: StaffMfaDto, meta: Meta) {
    const challenge = await this.prisma.staffAuthChallenge.findUnique({
      where: { id: dto.challengeId },
      include: { user: { include: { staffProfile: { include: { role: true } } } } },
    });
    const staff = challenge?.user.staffProfile;
    if (
      !challenge ||
      !staff ||
      challenge.consumedAt ||
      challenge.expiresAt < new Date() ||
      challenge.attempts >= 5 ||
      challenge.bindingHash !== this.binding(meta) ||
      staff.status !== 'ACTIVE' ||
      !staff.mfaSecretEncrypted
    )
      throw new UnauthorizedException('Invalid or expired verification challenge');
    await this.prisma.staffAuthChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    if (!this.verifyTotp(this.decrypt(staff.mfaSecretEncrypted), dto.code)) {
      await this.audit.create(
        {
          actorId: challenge.userId,
          actorRole: challenge.user.role,
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
        { action: 'staff.mfa_denied', targetType: 'staff_session', sensitivity: 'SENSITIVE' },
      );
      throw new UnauthorizedException('Invalid or expired verification challenge');
    }
    await this.prisma.staffAuthChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    const pair = await this.tokens.generateAdminTokens(challenge.user, staff.role.id, {
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.audit.create(
      {
        actorId: challenge.userId,
        actorRole: challenge.user.role,
        requestId: meta.requestId,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
      {
        action: 'staff.login_succeeded',
        targetType: 'staff_session',
        sensitivity: 'SENSITIVE',
        afterSummary: { role: staff.role.id, mfa: true },
      },
    );
    return {
      ...pair,
      mfaVerified: true,
      user: { id: challenge.user.id, email: challenge.user.email, role: staff.role.id },
    };
  }

  async refresh(refreshToken: string, meta: Meta) {
    const result = await this.tokens.rotateAdminRefreshToken(refreshToken, meta);
    await this.audit.create(
      {
        actorId: result.user.id,
        actorRole: result.user.role,
        requestId: meta.requestId,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
      {
        action: 'staff.session_rotated',
        targetType: 'staff_session',
        sensitivity: 'SENSITIVE' as never,
      },
    );
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      mfaVerified: true,
      user: { id: result.user.id, email: result.user.email, role: result.staffRole },
    };
  }
  sessions(userId: string) {
    return this.tokens.listAdminSessions(userId);
  }
  async revoke(userId: string, sessionId: string | undefined, meta: Meta) {
    await this.tokens.revokeAdminSession(userId, sessionId);
    await this.audit.create(
      { actorId: userId, requestId: meta.requestId, ipAddress: meta.ip, userAgent: meta.userAgent },
      {
        action: sessionId ? 'staff.session_revoked' : 'staff.sessions_revoked_all',
        targetType: 'staff_session',
        targetId: sessionId,
        sensitivity: 'SENSITIVE' as never,
      },
    );
    return { message: sessionId ? 'Session revoked' : 'All staff sessions revoked' };
  }

  private decrypt(value: string): string {
    const key = Buffer.from(this.config.getOrThrow<string>('ADMIN_MFA_ENCRYPTION_KEY'), 'base64');
    if (key.length !== 32) throw new Error('ADMIN_MFA_ENCRYPTION_KEY must decode to 32 bytes');
    const [ivText, tagText, cipherText] = value.split('.');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(cipherText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
  private verifyTotp(base32: string, code: string): boolean {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of base32.replace(/=|\s/g, '').toUpperCase()) {
      const i = alphabet.indexOf(char);
      if (i < 0) return false;
      bits += i.toString(2).padStart(5, '0');
    }
    const secret = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
    const supplied = Buffer.from(code.padStart(6, '0'));
    return [-1, 0, 1].some((offset) => {
      const counter = Math.floor(Date.now() / 30000) + offset;
      const b = Buffer.alloc(8);
      b.writeBigUInt64BE(BigInt(counter));
      const h = createHmac('sha1', secret).update(b).digest();
      const p = h[h.length - 1] & 15;
      const n = (((h[p] & 127) << 24) | (h[p + 1] << 16) | (h[p + 2] << 8) | h[p + 3]) % 1_000_000;
      const expected = Buffer.from(String(n).padStart(6, '0'));
      return supplied.length === expected.length && timingSafeEqual(supplied, expected);
    });
  }
}
