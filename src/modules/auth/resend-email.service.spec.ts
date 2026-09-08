import { ConfigService } from '@nestjs/config';
import { ResendEmailService } from './resend-email.service';

describe('ResendEmailService', () => {
  const values: Record<string, string> = {
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM_EMAIL: 'operations@gochrge.com',
  };
  const config = { get: (name: string) => values[name] } as ConfigService;
  const payload = {
    to: 'staff@example.com',
    role: 'Administrator',
    inviteUrl: 'https://admin.example.com/staff/invite/secret-token',
    expiresAt: new Date('2026-09-09T08:00:00Z'),
    invitationId: 'invite-id',
  };

  afterEach(() => jest.restoreAllMocks());

  it('sends an idempotent transactional invitation', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'message-id' }), { status: 200 }));
    const result = await new ResendEmailService(config).sendStaffInvitation(payload);
    expect(result).toEqual({ messageId: 'message-id' });
    const [, options] = fetchMock.mock.calls[0];
    const request = JSON.parse(options?.body as string) as Record<string, unknown>;
    expect(options?.headers).toMatchObject({
      authorization: 'Bearer re_test_key',
      'idempotency-key': 'staff-invitation/invite-id',
    });
    expect(request).toMatchObject({
      to: [payload.to],
      subject: 'Your CHRGE staff invitation',
      tags: [{ name: 'purpose', value: 'staff_invitation' }],
    });
  });

  it('fails closed when credentials are absent', async () => {
    const emptyConfig = { get: () => undefined } as unknown as ConfigService;
    await expect(new ResendEmailService(emptyConfig).sendStaffInvitation(payload)).rejects.toThrow(
      'Transactional email is not configured',
    );
  });
});
