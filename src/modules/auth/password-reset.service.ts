import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { ResendEmailService } from './resend-email.service';
import { ConfirmPasswordResetDto, RequestPasswordResetDto } from './dto/password-reset.dto';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly genericMessage = 'If an account exists for that email, a reset code has been sent.';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: ResendEmailService,
  ) {}

  private hash(userId: string, code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(`${userId}:${code}`)
      .digest('hex');
  }

  async request(dto: RequestPasswordResetDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, email: true, firstName: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return { message: this.genericMessage };

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const challenge = await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetChallenge.deleteMany({ where: { userId: user.id, consumedAt: null } });
      return tx.passwordResetChallenge.create({
        data: { userId: user.id, codeHash: this.hash(user.id, code), expiresAt },
      });
    });

    try {
      await this.email.sendPasswordResetCode({
        to: user.email,
        firstName: user.firstName,
        code,
        expiresAt,
        challengeId: challenge.id,
      });
    } catch (error) {
      await this.prisma.passwordResetChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
      this.logger.error(`Password reset email delivery failed for challenge ${challenge.id}`);
    }
    return { message: this.genericMessage };
  }

  async confirm(dto: ConfirmPasswordResetDto): Promise<{ message: string }> {
    const invalid = new UnauthorizedException('The reset code is invalid or has expired. Request a new code.');
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw invalid;

    const challenge = await this.prisma.passwordResetChallenge.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= 5) throw invalid;

    await this.prisma.passwordResetChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    const expected = Buffer.from(challenge.codeHash, 'hex');
    const received = Buffer.from(this.hash(user.id, dto.code), 'hex');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw invalid;

    const passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null }, data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw invalid;
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
    });
    return { message: 'Password reset successfully. Sign in with your new password.' };
  }
}
