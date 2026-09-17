import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface StaffInvitationEmail {
  to: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
  invitationId: string;
}

interface PasswordResetEmail {
  to: string;
  firstName?: string | null;
  code: string;
  expiresAt: Date;
  challengeId: string;
}

@Injectable()
export class ResendEmailService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('RESEND_API_KEY')?.trim() &&
      this.config.get<string>('RESEND_FROM_EMAIL')?.trim(),
    );
  }

  async sendStaffInvitation(message: StaffInvitationEmail): Promise<{ messageId: string }> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from = this.config.get<string>('RESEND_FROM_EMAIL')?.trim();
    if (!apiKey || !from) {
      throw new ServiceUnavailableException('Transactional email is not configured');
    }

    const expires = new Intl.DateTimeFormat('en-NG', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Lagos',
    }).format(message.expiresAt);
    const environment = this.config.get<string>('CHRGE_ENV')?.trim().toLowerCase() || 'development';
    const isStaging = environment === 'staging';
    const environmentBanner = isStaging
      ? '<p style="margin:0 0 16px;background:#f5b700;color:#17211b;border-radius:8px;padding:9px 12px;font-size:12px;font-weight:800;letter-spacing:.08em">STAGING ENVIRONMENT</p>'
      : '';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': `staff-invitation/${message.invitationId}`,
      },
      body: JSON.stringify({
        from: `${isStaging ? 'CHRGE Staging' : 'CHRGE Team'} <${from}>`,
        to: [message.to],
        subject: `${isStaging ? '[STAGING] ' : ''}Your CHRGE staff invitation`,
        text: [
          ...(isStaging ? ['STAGING ENVIRONMENT — do not use for production activity.', ''] : []),
          `You have been invited to CHRGE Operations as ${message.role}.`,
          '',
          `Complete your secure staff enrollment: ${message.inviteUrl}`,
          '',
          `This single-use invitation expires ${expires} WAT. If you were not expecting it, ignore this email and contact CHRGE.`,
        ].join('\n'),
        html: `<!doctype html><html><body style="margin:0;background:#f4f7f4;color:#17211b;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:36px 20px"><div style="background:#10251b;color:#fff;border-radius:16px;padding:28px">${environmentBanner}<p style="margin:0 0 10px;color:#50d394;font-size:12px;font-weight:700;letter-spacing:.08em">CHRGE OPERATIONS</p><h1 style="margin:0 0 16px;font-size:28px">Complete your staff enrollment</h1><p style="margin:0 0 24px;line-height:1.6">You have been invited as <strong>${message.role}</strong>. Create your password and connect an authenticator before your account becomes active.</p><a href="${message.inviteUrl}" style="display:inline-block;background:#50d394;color:#10251b;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:9px">Accept secure invitation</a><p style="margin:24px 0 0;color:#b8cec2;font-size:12px;line-height:1.6">This single-use link expires ${expires} WAT. If you were not expecting this email, ignore it and contact CHRGE.</p></div></div></body></html>`,
        headers: { 'X-Entity-Ref-ID': message.invitationId },
        tags: [
          { name: 'purpose', value: 'staff_invitation' },
          { name: 'environment', value: environment },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);

    if (!response?.ok) {
      throw new ServiceUnavailableException('Resend did not accept the invitation email');
    }
    const result = (await response.json().catch(() => null)) as { id?: string } | null;
    if (!result?.id) {
      throw new ServiceUnavailableException('Resend returned an invalid delivery response');
    }
    return { messageId: result.id };
  }

  async sendPasswordResetCode(message: PasswordResetEmail): Promise<{ messageId: string }> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from = this.config.get<string>('RESEND_FROM_EMAIL')?.trim();
    if (!apiKey || !from) throw new ServiceUnavailableException('Transactional email is not configured');

    const environment = this.config.get<string>('CHRGE_ENV')?.trim().toLowerCase() || 'development';
    const isStaging = environment === 'staging';
    const greeting = message.firstName ? `Hi ${message.firstName},` : 'Hello,';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': `password-reset/${message.challengeId}`,
      },
      body: JSON.stringify({
        from: `${isStaging ? 'CHRGE Staging' : 'CHRGE Team'} <${from}>`,
        to: [message.to],
        subject: `${isStaging ? '[STAGING] ' : ''}Your CHRGE password reset code`,
        text: `${greeting}\n\nYour CHRGE password reset code is ${message.code}. It expires in 10 minutes.\n\nIf you did not request this, you can safely ignore this email.`,
        html: `<!doctype html><html><body style="margin:0;background:#f4f7f4;color:#17211b;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:36px 20px"><div style="background:#fff;border:1px solid #dce6df;border-radius:16px;padding:30px"><p style="margin:0 0 10px;color:#087a50;font-size:12px;font-weight:800;letter-spacing:.08em">CHRGE${isStaging ? ' · STAGING' : ''}</p><h1 style="margin:0 0 16px;font-size:26px">Reset your password</h1><p style="line-height:1.6">${greeting} use this one-time code to reset your CHRGE password:</p><p style="margin:24px 0;font-size:36px;font-weight:800;letter-spacing:.18em;color:#087a50">${message.code}</p><p style="color:#65736b;font-size:13px;line-height:1.6">The code expires in 10 minutes. If you did not request a password reset, ignore this email.</p></div></div></body></html>`,
        tags: [
          { name: 'purpose', value: 'password_reset' },
          { name: 'environment', value: environment },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!response?.ok) throw new ServiceUnavailableException('Could not send the password reset email');
    const result = (await response.json().catch(() => null)) as { id?: string } | null;
    if (!result?.id) throw new ServiceUnavailableException('Email provider returned an invalid response');
    return { messageId: result.id };
  }
}
