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

export interface CngStationSnapshot {
  name: string;
  address: string;
  city: string;
  state: string;
  availability: string;
  queueLength: number | null;
  pressureBar: number | null;
  updatedAt: Date | null;
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

  async sendCngTeamStatusUpdate(message: {
    to: string;
    reportId: string;
    reporter: string;
    station: CngStationSnapshot;
  }): Promise<{ messageId: string }> {
    const station = message.station;
    const status = station.availability === 'AVAILABLE' ? 'Gas available' : 'Gas unavailable';
    return this.sendCngEmail({
      to: message.to,
      subject: `${status}: ${station.name}`,
      idempotencyKey: `cng-team-status/${message.reportId}`,
      purpose: 'cng_team_status',
      title: `${status} at ${this.escape(station.name)}`,
      intro: `${this.escape(message.reporter)} published a station update.`,
      rows: [
        ['Station', station.name], ['Location', `${station.address}, ${station.city}, ${station.state}`],
        ['Availability', status], ['Estimated queue', `${station.queueLength ?? 0} vehicles`],
        ['Pump pressure', `${station.pressureBar ?? 0} bar`],
      ],
    });
  }

  async sendFavoriteStationAvailable(message: {
    to: string;
    reportId: string;
    station: CngStationSnapshot;
  }): Promise<{ messageId: string }> {
    return this.sendCngEmail({
      to: message.to,
      subject: `Gas is now available at ${message.station.name}`,
      idempotencyKey: `cng-favorite-available/${message.reportId}/${message.to.toLowerCase()}`,
      purpose: 'favorite_station_available',
      title: `Gas is available at ${this.escape(message.station.name)}`,
      intro: 'A station you saved has reported that CNG is available now.',
      rows: [
        ['Location', `${message.station.address}, ${message.station.city}, ${message.station.state}`],
        ['Estimated queue', `${message.station.queueLength ?? 0} vehicles`],
        ['Pump pressure', `${message.station.pressureBar ?? 0} bar`],
      ],
    });
  }

  async sendCngNetworkDigest(message: {
    to: string;
    digestKey: string;
    asOfLabel: string;
    stations: CngStationSnapshot[];
  }): Promise<{ messageId: string }> {
    const stationRows = message.stations.map((station) => `<tr><td style="padding:10px;border-bottom:1px solid #dfe7e1"><strong>${this.escape(station.name)}</strong><br><span style="color:#65736b;font-size:12px">${this.escape(station.city)}, ${this.escape(station.state)}</span></td><td style="padding:10px;border-bottom:1px solid #dfe7e1">${station.availability === 'AVAILABLE' ? 'Available' : station.availability === 'UNAVAILABLE' ? 'Not available' : 'Unknown'}</td><td style="padding:10px;border-bottom:1px solid #dfe7e1">${station.queueLength ?? '—'}</td><td style="padding:10px;border-bottom:1px solid #dfe7e1">${station.pressureBar ?? '—'}${station.pressureBar == null ? '' : ' bar'}</td></tr>`).join('');
    return this.sendCngEmail({
      to: message.to,
      subject: `CHRGE CNG availability update — ${message.asOfLabel}`,
      idempotencyKey: `cng-network-digest/${message.digestKey}/${message.to.toLowerCase()}`,
      purpose: 'cng_network_digest',
      title: `CNG availability as of ${this.escape(message.asOfLabel)}`,
      intro: 'Here is the latest station availability, estimated queue length, and pump pressure reported to CHRGE.',
      customHtml: `<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f3f7f4;text-align:left"><th style="padding:10px">Station</th><th style="padding:10px">Gas</th><th style="padding:10px">Queue</th><th style="padding:10px">Pressure</th></tr></thead><tbody>${stationRows || '<tr><td colspan="4" style="padding:16px">No CNG stations are currently available.</td></tr>'}</tbody></table>`,
      rows: [],
    });
  }

  private async sendCngEmail(message: {
    to: string;
    subject: string;
    idempotencyKey: string;
    purpose: string;
    title: string;
    intro: string;
    rows: [string, string][];
    customHtml?: string;
  }): Promise<{ messageId: string }> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from = this.config.get<string>('RESEND_FROM_EMAIL')?.trim();
    if (!apiKey || !from) throw new ServiceUnavailableException('Transactional email is not configured');
    const environment = this.config.get<string>('CHRGE_ENV')?.trim().toLowerCase() || 'development';
    const isStaging = environment === 'staging';
    const rows = message.rows.map(([label, value]) => `<tr><td style="padding:8px 0;color:#65736b">${this.escape(label)}</td><td style="padding:8px 0;text-align:right;font-weight:700">${this.escape(value)}</td></tr>`).join('');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': message.idempotencyKey },
      body: JSON.stringify({
        from: `${isStaging ? 'CHRGE Staging' : 'CHRGE'} <${from}>`, to: [message.to],
        subject: `${isStaging ? '[STAGING] ' : ''}${message.subject}`,
        text: `${message.title}\n\n${message.intro}\n\n${message.rows.map(([label, value]) => `${label}: ${value}`).join('\n')}`,
        html: `<!doctype html><html><body style="margin:0;background:#f4f7f4;color:#17211b;font-family:Arial,sans-serif"><div style="max-width:680px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #dfe7e1;border-radius:16px;padding:28px"><p style="color:#087a50;font-size:12px;font-weight:800;letter-spacing:.08em">CHRGE${isStaging ? ' · STAGING' : ''}</p><h1 style="font-size:25px">${message.title}</h1><p style="color:#526159;line-height:1.6">${message.intro}</p>${message.customHtml ?? `<table style="width:100%;border-collapse:collapse">${rows}</table>`}</div></div></body></html>`,
        tags: [{ name: 'purpose', value: message.purpose }, { name: 'environment', value: environment }],
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!response?.ok) throw new ServiceUnavailableException('Could not send the CNG notification email');
    const result = (await response.json().catch(() => null)) as { id?: string } | null;
    if (!result?.id) throw new ServiceUnavailableException('Email provider returned an invalid response');
    return { messageId: result.id };
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
  }
}
