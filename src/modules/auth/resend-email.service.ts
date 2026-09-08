import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface StaffInvitationEmail {
  to: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
  invitationId: string;
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
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': `staff-invitation/${message.invitationId}`,
      },
      body: JSON.stringify({
        from: `CHRGE Operations <${from}>`,
        to: [message.to],
        subject: 'Your CHRGE staff invitation',
        text: [
          `You have been invited to CHRGE Operations as ${message.role}.`,
          '',
          `Complete your secure staff enrollment: ${message.inviteUrl}`,
          '',
          `This single-use invitation expires ${expires} WAT. If you were not expecting it, ignore this email and contact CHRGE.`,
        ].join('\n'),
        html: `<!doctype html><html><body style="margin:0;background:#f4f7f4;color:#17211b;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:36px 20px"><div style="background:#10251b;color:#fff;border-radius:16px;padding:28px"><p style="margin:0 0 10px;color:#50d394;font-size:12px;font-weight:700;letter-spacing:.08em">CHRGE OPERATIONS</p><h1 style="margin:0 0 16px;font-size:28px">Complete your staff enrollment</h1><p style="margin:0 0 24px;line-height:1.6">You have been invited as <strong>${message.role}</strong>. Create your password and connect an authenticator before your account becomes active.</p><a href="${message.inviteUrl}" style="display:inline-block;background:#50d394;color:#10251b;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:9px">Accept secure invitation</a><p style="margin:24px 0 0;color:#b8cec2;font-size:12px;line-height:1.6">This single-use link expires ${expires} WAT. If you were not expecting this email, ignore it and contact CHRGE.</p></div></div></body></html>`,
        headers: { 'X-Entity-Ref-ID': message.invitationId },
        tags: [{ name: 'purpose', value: 'staff_invitation' }],
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
}
