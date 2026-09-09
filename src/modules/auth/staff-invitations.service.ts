import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditContext, AuditService } from '../audit/audit.service';
import { AcceptStaffInvitationDto, CreateStaffInvitationDto } from './dto/staff-invitation.dto';
import {
  decryptStaffMfaSecret,
  encryptStaffMfaSecret,
  generateRecoveryCodes,
  generateStaffMfaSecret,
  staffOtpAuthUri,
  verifyStaffTotp,
} from './staff-mfa';
import { ResendEmailService } from './resend-email.service';

const INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class StaffInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly email: ResendEmailService,
  ) {}

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async validInvitation(token: string) {
    if (token.length < 32) throw new GoneException('This staff invitation is invalid or expired');
    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { tokenHash: this.tokenHash(token) },
      include: { staffRole: { select: { id: true, name: true } } },
    });
    if (
      !invitation ||
      invitation.revokedAt ||
      invitation.acceptedAt ||
      invitation.expiresAt <= new Date()
    ) {
      throw new GoneException('This staff invitation is invalid or expired');
    }
    return invitation;
  }

  list() {
    return this.prisma.staffInvitation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        staffRole: { select: { id: true, name: true } },
      },
    });
  }

  async create(dto: CreateStaffInvitationDto, context: AuditContext) {
    const email = dto.email.toLowerCase();
    if (!this.email.isConfigured() && this.config.get<string>('CHRGE_ENV') !== 'staging') {
      throw new ServiceUnavailableException('Transactional email is not configured');
    }
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException('That email already belongs to an account');
    }
    const role = await this.prisma.staffRole.findUnique({ where: { id: dto.role } });
    if (!role) throw new NotFoundException('Staff role is not configured');

    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const invitation = await this.prisma.$transaction(async (tx) => {
      await tx.staffInvitation.updateMany({
        where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      const created = await tx.staffInvitation.create({
        data: {
          email,
          staffRoleId: dto.role,
          invitedBy: context.actorId!,
          tokenHash: this.tokenHash(token),
          expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
        },
      });
      await this.audit.create(
        context,
        {
          action: 'staff.invitation_created',
          targetType: 'staff_invitation',
          targetId: created.id,
          sensitivity: 'SENSITIVE',
          afterSummary: { email, role: dto.role, expiresAt: created.expiresAt.toISOString() },
        },
        tx,
      );
      return created;
    });
    if (this.email.isConfigured()) {
      const adminPortalUrl = this.config.getOrThrow<string>('ADMIN_PORTAL_URL');
      const inviteUrl = new URL(`/staff/invite/${token}`, adminPortalUrl).toString();
      try {
        const delivery = await this.email.sendStaffInvitation({
          to: email,
          role: role.name,
          inviteUrl,
          expiresAt: invitation.expiresAt,
          invitationId: invitation.id,
        });
        await this.audit.create(context, {
          action: 'staff.invitation_emailed',
          targetType: 'staff_invitation',
          targetId: invitation.id,
          sensitivity: 'SENSITIVE',
          metadata: { provider: 'resend', messageId: delivery.messageId },
        });
        return {
          id: invitation.id,
          email,
          role: dto.role,
          expiresAt: invitation.expiresAt,
          delivery: 'EMAIL' as const,
        };
      } catch {
        await this.prisma.$transaction(async (tx) => {
          await tx.staffInvitation.update({
            where: { id: invitation.id },
            data: { revokedAt: new Date() },
          });
          await this.audit.create(
            context,
            {
              action: 'staff.invitation_delivery_failed',
              targetType: 'staff_invitation',
              targetId: invitation.id,
              sensitivity: 'SENSITIVE',
              metadata: { provider: 'resend' },
            },
            tx,
          );
        });
        throw new BadGatewayException('Invitation email could not be delivered. Please try again.');
      }
    }

    return {
      id: invitation.id,
      email,
      role: dto.role,
      expiresAt: invitation.expiresAt,
      delivery: 'MANUAL_STAGING_FALLBACK' as const,
      invitePath: `/staff/invite/${token}`,
    };
  }

  async revoke(id: string, context: AuditContext) {
    const invitation = await this.prisma.staffInvitation.findUnique({ where: { id } });
    if (!invitation) throw new NotFoundException('Staff invitation not found');
    if (!invitation.acceptedAt && !invitation.revokedAt) {
      await this.prisma.$transaction(async (tx) => {
        await tx.staffInvitation.update({ where: { id }, data: { revokedAt: new Date() } });
        await this.audit.create(
          context,
          {
            action: 'staff.invitation_revoked',
            targetType: 'staff_invitation',
            targetId: id,
            sensitivity: 'SENSITIVE',
          },
          tx,
        );
      });
    }
    return { revoked: true };
  }

  async disableAccount(userId: string, context: AuditContext) {
    if (context.actorId === userId) {
      throw new ForbiddenException('You cannot disable your own staff account');
    }
    const profile = await this.prisma.staffProfile.findUnique({
      where: { userId },
      include: { role: { select: { id: true, name: true, isTopLevel: true } } },
    });
    if (!profile) throw new NotFoundException('Staff account not found');
    if (profile.role.isTopLevel) {
      throw new ForbiddenException('The super administrator account cannot be disabled here');
    }
    if (profile.status === 'DISABLED') return { disabled: true };

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({
        where: { userId },
        data: {
          status: 'DISABLED',
          disabledAt: now,
          mfaSecretEncrypted: null,
          mfaEnabledAt: null,
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId, audience: 'chrge-admin', revokedAt: null },
        data: { revokedAt: now },
      });
      await this.audit.create(
        context,
        {
          action: 'staff.account_disabled',
          targetType: 'staff_profile',
          targetId: userId,
          sensitivity: 'RESTRICTED',
          beforeSummary: { status: profile.status, role: profile.role.id },
          afterSummary: { status: 'DISABLED', sessionsRevoked: true, mfaSecretCleared: true },
        },
        tx,
      );
    });
    return { disabled: true };
  }

  async deleteStagingAccount(userId: string, context: AuditContext) {
    if (this.config.get<string>('CHRGE_ENV') !== 'staging') {
      throw new ForbiddenException('Permanent staff deletion is available only in staging');
    }
    if (context.actorId === userId) {
      throw new ForbiddenException('You cannot delete your own staff account');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { staffProfile: { include: { role: true } } },
    });
    if (!user?.staffProfile) throw new NotFoundException('Staff account not found');
    if (user.staffProfile.role.isTopLevel) {
      throw new ForbiddenException('The super administrator account cannot be deleted here');
    }
    if (user.staffProfile.status !== 'DISABLED') {
      throw new ConflictException('Disable this staff account before permanently deleting it');
    }
    const authoredInvitations = await this.prisma.staffInvitation.count({
      where: { invitedBy: userId },
    });
    if (authoredInvitations > 0) {
      throw new ConflictException(
        'This staff account has invitation history and cannot be deleted',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.audit.create(
        context,
        {
          action: 'staff.test_account_deleted',
          targetType: 'staff_profile',
          targetId: userId,
          sensitivity: 'RESTRICTED',
          beforeSummary: {
            status: user.staffProfile!.status,
            role: user.staffProfile!.role.id,
          },
          afterSummary: { deleted: true, invitationHistoryRemoved: true },
        },
        tx,
      );
      await tx.staffInvitation.deleteMany({ where: { email: user.email } });
      await tx.user.delete({ where: { id: userId } });
    });
    return { deleted: true };
  }

  async inspect(token: string) {
    const invitation = await this.validInvitation(token);
    return {
      email: invitation.email,
      role: invitation.staffRole.name,
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(token: string, dto: AcceptStaffInvitationDto, context: AuditContext) {
    const invitation = await this.validInvitation(token);
    const existing = await this.prisma.user.findUnique({
      where: { email: invitation.email },
      include: { staffProfile: true },
    });
    if (existing && (!existing.staffProfile || existing.staffProfile.status !== 'INVITED')) {
      throw new ConflictException('This invitation can no longer be accepted');
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    let secret: string;
    if (existing?.staffProfile?.mfaSecretEncrypted) {
      secret = decryptStaffMfaSecret(this.config, existing.staffProfile.mfaSecretEncrypted);
    } else {
      secret = generateStaffMfaSecret();
      const encrypted = encryptStaffMfaSecret(this.config, secret);
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: invitation.email,
            passwordHash,
            firstName: dto.firstName?.trim() || null,
            lastName: dto.lastName?.trim() || null,
            provider: 'EMAIL',
            emailVerified: true,
            role: 'ADMIN',
            accountType: 'STAFF',
          },
        });
        await tx.staffProfile.create({
          data: {
            userId: user.id,
            staffRoleId: invitation.staffRoleId,
            status: 'INVITED',
            invitedAt: invitation.createdAt,
            mfaSecretEncrypted: encrypted,
          },
        });
        await this.audit.create(
          { ...context, actorId: user.id, actorRole: 'ADMIN' },
          {
            action: 'staff.invitation_password_created',
            targetType: 'staff_profile',
            targetId: user.id,
            sensitivity: 'RESTRICTED',
            afterSummary: { role: invitation.staffRoleId, mfaPending: true },
          },
          tx,
        );
      });
    }
    return {
      email: invitation.email,
      role: invitation.staffRole.name,
      manualKey: secret,
      otpauthUri: staffOtpAuthUri(invitation.email, secret),
    };
  }

  async verify(token: string, code: string, context: AuditContext) {
    const invitation = await this.validInvitation(token);
    const user = await this.prisma.user.findUnique({
      where: { email: invitation.email },
      include: { staffProfile: true },
    });
    if (!user?.staffProfile?.mfaSecretEncrypted || user.staffProfile.status !== 'INVITED') {
      throw new UnauthorizedException('Complete password setup before verifying an authenticator');
    }
    const secret = decryptStaffMfaSecret(this.config, user.staffProfile.mfaSecretEncrypted);
    if (!verifyStaffTotp(secret, code)) {
      await this.audit.create(
        { ...context, actorId: user.id, actorRole: 'ADMIN' },
        {
          action: 'staff.enrollment_mfa_denied',
          targetType: 'staff_profile',
          targetId: user.id,
          sensitivity: 'SENSITIVE',
        },
      );
      throw new UnauthorizedException('The authenticator code was not accepted');
    }
    const recovery = generateRecoveryCodes(this.config);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({
        where: { userId: user.id },
        data: {
          status: 'ACTIVE',
          activatedAt: now,
          mfaEnabledAt: now,
          recoveryCodesHash: recovery.hashes,
        },
      });
      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: now },
      });
      await this.audit.create(
        { ...context, actorId: user.id, actorRole: 'ADMIN' },
        {
          action: 'staff.invitation_accepted',
          targetType: 'staff_profile',
          targetId: user.id,
          sensitivity: 'RESTRICTED',
          afterSummary: { role: invitation.staffRoleId, status: 'ACTIVE', mfaEnabled: true },
        },
        tx,
      );
    });
    return { activated: true, recoveryCodes: recovery.plain };
  }
}
