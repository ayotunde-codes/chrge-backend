import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TokenService } from './token.service';
import { StaffLoginDto, StaffMfaDto, StaffStepUpDto } from './dto/staff-auth.dto';
import { decryptStaffMfaSecret, staffRecoveryCodeHash, verifyStaffTotp } from './staff-mfa';

interface Meta {
  userAgent?: string;
  ip?: string;
  challengeBinding?: string;
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
      .update(`${meta.challengeBinding ?? meta.ip ?? ''}|${meta.userAgent ?? ''}`)
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
    const totpValid =
      /^\d{6}$/.test(dto.code) &&
      verifyStaffTotp(decryptStaffMfaSecret(this.config, staff.mfaSecretEncrypted), dto.code);
    const recoveryHashes = Array.isArray(staff.recoveryCodesHash)
      ? staff.recoveryCodesHash.filter((value): value is string => typeof value === 'string')
      : [];
    const recoveryHash = staffRecoveryCodeHash(this.config, dto.code);
    const recoveryIndex = recoveryHashes.indexOf(recoveryHash);
    if (!totpValid && recoveryIndex < 0) {
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
    if (recoveryIndex >= 0) {
      await this.prisma.staffProfile.update({
        where: { userId: challenge.userId },
        data: { recoveryCodesHash: recoveryHashes.filter((_, index) => index !== recoveryIndex) },
      });
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
        afterSummary: {
          role: staff.role.id,
          mfa: true,
          verificationMethod: recoveryIndex >= 0 ? 'recovery_code' : 'totp',
        },
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

  async createStepUp(userId: string, role: string, dto: StaffStepUpDto, meta: Meta) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new UnauthorizedException('Administrator role required');
    }
    const staff = await this.prisma.staffProfile.findUnique({ where: { userId } });
    if (!staff?.mfaSecretEncrypted || staff.status !== 'ACTIVE') {
      throw new UnauthorizedException('Active MFA enrollment required');
    }
    const valid = verifyStaffTotp(
      decryptStaffMfaSecret(this.config, staff.mfaSecretEncrypted),
      dto.code,
    );
    if (!valid) throw new UnauthorizedException('Invalid authenticator code');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    await this.prisma.staffStepUpToken.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        action: dto.action,
        resourceId: dto.resourceId,
        expiresAt,
      },
    });
    await this.audit.create(
      { actorId: userId, requestId: meta.requestId, ipAddress: meta.ip, userAgent: meta.userAgent },
      {
        action: 'staff.step_up_succeeded',
        targetType: 'cng_application',
        targetId: dto.resourceId,
        reason: dto.reason,
        sensitivity: 'RESTRICTED' as never,
        metadata: { authorizedAction: dto.action },
      },
    );
    return { token, expiresAt, action: dto.action, resourceId: dto.resourceId };
  }

  async consumeStepUp(
    token: string,
    userId: string,
    action: StaffStepUpDto['action'],
    resourceId: string,
  ): Promise<void> {
    const result = await this.prisma.staffStepUpToken.updateMany({
      where: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        userId,
        action,
        resourceId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (result.count !== 1) throw new UnauthorizedException('Invalid or expired step-up token');
  }
  sessions(userId: string) {
    return this.tokens.listAdminSessions(userId);
  }
  async logout(userId: string, refreshToken: string, meta: Meta) {
    await this.tokens.revokeAdminRefreshToken(userId, refreshToken);
    await this.audit.create(
      { actorId: userId, requestId: meta.requestId, ipAddress: meta.ip, userAgent: meta.userAgent },
      {
        action: 'staff.logout',
        targetType: 'staff_session',
        sensitivity: 'SENSITIVE' as never,
      },
    );
    return { message: 'Logged out successfully' };
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
}
