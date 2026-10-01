import { BadRequestException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { CngApplicationOperationsService } from './cng-application-operations.service';

describe('CngApplicationOperationsService', () => {
  const prisma = {} as never;
  const storage = {} as never;
  const sensitive = { decrypt: jest.fn(() => '12345678901') } as never;
  const audit = {} as never;
  const email = {} as never;
  const config = {} as never;
  const staffAuth = {} as never;
  const service = new CngApplicationOperationsService(
    prisma,
    storage,
    sensitive,
    audit,
    email,
    config,
    staffAuth,
  );

  it('creates strong, non-customer-derived passwords for each export', () => {
    const generate = (
      service as unknown as { generatePdfPassword: () => string }
    ).generatePdfPassword.bind(service);
    const first = generate();
    const second = generate();
    expect(first).toMatch(/^CHRGE-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(second).not.toBe(first);
  });

  it('builds a readable summary PDF that includes the application sections', async () => {
    const build = (
      service as unknown as { buildApplicationPdf: (application: unknown) => Promise<Buffer> }
    ).buildApplicationPdf.bind(service);
    const bytes = await build({
      reference: 'CNG-2026-TEST',
      status: 'UNDER_REVIEW',
      bvnEncrypted: 'encrypted-bvn',
      ninEncrypted: 'encrypted-nin',
      firstName: 'Ada',
      lastName: 'Okafor',
      email: 'ada@example.com',
      phone: '+2348000000000',
      documents: [],
      installments: [],
      reviewNotes: [{ note: 'Verified income', createdAt: new Date() }],
      additionalInformationRequests: [],
    });
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(0);
  });

  it('requires at least one response type when requesting information', async () => {
    await expect(
      service.requestInformation(
        'app-id',
        { question: 'Please clarify this item', allowText: false, allowDocuments: false },
        'admin-id',
        { requestId: 'request-id' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
