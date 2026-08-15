import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CngApplicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CngApplicationsService } from './cng-applications.service';
import { SensitiveDataService } from './sensitive-data.service';
import { OtpDeliveryService } from './otp-delivery.service';
import {
  CngEmploymentSector,
  CngEmploymentStatus,
  CngEngineType,
  CngFinancingPlan,
  CngFuelSystem,
  CngGender,
  CngMaritalStatus,
  REQUIRED_CNG_DOCUMENT_TYPES,
} from './cng-application.constants';

type ApplicationWithDocuments = Prisma.CngApplicationGetPayload<{
  include: { documents: true };
}>;

describe('CngApplicationsService', () => {
  const mockPrisma = {
    cngApplication: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    cngPhoneVerification: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cngApplicationDocument: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const mockConfig = {
    get: jest.fn(),
  };
  const mockSensitive = {
    encrypt: jest.fn((value: string) => `encrypted:${value}`),
    hash: jest.fn((value: string) => `hash:${value}`),
    hashAccessToken: jest.fn(() => 'access-token-hash'),
    matchesHash: jest.fn(),
  };
  const mockOtpDelivery = {
    send: jest.fn(),
  };

  let service: CngApplicationsService;
  let application: ApplicationWithDocuments;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CngApplicationsService(
      mockPrisma as unknown as PrismaService,
      mockConfig as unknown as ConfigService,
      mockSensitive as unknown as SensitiveDataService,
      mockOtpDelivery as unknown as OtpDeliveryService,
    );
    application = makeApplication();
  });

  it('creates an anonymous draft and returns its access token only at creation', async () => {
    mockPrisma.cngApplication.create.mockResolvedValue(application);

    const result = await service.createApplication();

    expect(mockPrisma.cngApplication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accessTokenHash: 'access-token-hash',
        userId: undefined,
      }),
      include: { documents: true },
    });
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result).not.toHaveProperty('accessTokenHash');
  });

  it('encrypts identity numbers and stores only their masked suffixes in the response', async () => {
    mockPrisma.cngApplication.findUnique.mockResolvedValue(application);
    const updated = {
      ...application,
      personalCompletedAt: new Date(),
      phone: '+2348012345678',
      bvnLast4: '8901',
      ninLast4: '8901',
    };
    mockPrisma.cngApplication.update.mockResolvedValue(updated);

    const result = await service.savePersonalDetails(application.id, {
      firstName: 'Emeka',
      lastName: 'Okafor',
      gender: CngGender.Male,
      dateOfBirth: '1990-01-15',
      maritalStatus: CngMaritalStatus.Married,
      email: 'emeka@example.com',
      phone: '08012345678',
      bvn: '12345678901',
      nin: '12345678901',
      currentlyEmployed: true,
      employmentStatus: CngEmploymentStatus.Employed,
      employmentSector: CngEmploymentSector.Private,
      employerName: 'Example Limited',
      occupationJobTitle: 'Operations Manager',
      monthlyIncome: '₦200,000 – ₦400,000',
      employmentStartDate: '2020-01-01',
      employmentConfirmationDate: '2020-07-01',
      address: '14 Herbert Macaulay Way, Yaba',
      state: 'Lagos',
      lga: 'Yaba',
      nextOfKinName: 'Chidi Okafor',
      nextOfKinPhone: '08023456789',
      nextOfKinRelationship: 'Sibling',
    });

    expect(mockPrisma.cngApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bvnEncrypted: 'encrypted:12345678901',
          bvnHash: 'hash:12345678901',
          bvnLast4: '8901',
          ninEncrypted: 'encrypted:12345678901',
          ninHash: 'hash:12345678901',
          ninLast4: '8901',
        }),
      }),
    );
    expect(result.personal).toEqual(
      expect.objectContaining({ bvnMasked: '*******8901', ninMasked: '*******8901' }),
    );
  });

  it('rejects an employment confirmation date before the start date', async () => {
    mockPrisma.cngApplication.findUnique.mockResolvedValue(application);

    await expect(
      service.savePersonalDetails(application.id, {
        firstName: 'Emeka',
        lastName: 'Okafor',
        gender: CngGender.Male,
        dateOfBirth: '1990-01-15',
        maritalStatus: CngMaritalStatus.Married,
        email: 'emeka@example.com',
        phone: '08012345678',
        bvn: '12345678901',
        nin: '12345678901',
        currentlyEmployed: true,
        employmentStatus: CngEmploymentStatus.Employed,
        employmentSector: CngEmploymentSector.Private,
        occupationJobTitle: 'Manager',
        monthlyIncome: '₦200,000 – ₦400,000',
        employmentStartDate: '2021-01-01',
        employmentConfirmationDate: '2020-01-01',
        address: '14 Herbert Macaulay Way, Yaba',
        state: 'Lagos',
        lga: 'Yaba',
        nextOfKinName: 'Chidi Okafor',
        nextOfKinPhone: '08023456789',
        nextOfKinRelationship: 'Sibling',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a phone challenge without storing the plain code', async () => {
    mockPrisma.cngApplication.findUnique.mockResolvedValue(application);
    mockPrisma.cngPhoneVerification.findFirst.mockResolvedValue(null);
    mockOtpDelivery.send.mockResolvedValue({ developmentCode: '123456' });
    mockPrisma.$transaction.mockResolvedValue([]);

    const result = await service.requestPhoneVerification(application.id, {
      phone: '08012345678',
    });

    expect(mockPrisma.cngPhoneVerification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: application.id,
        phone: '+2348012345678',
        codeHash: expect.stringContaining('hash:'),
      }),
    });
    expect(result.developmentCode).toBe('123456');
  });

  it('calculates and snapshots financing values on the server', async () => {
    mockPrisma.cngApplication.findUnique.mockResolvedValue(application);
    mockPrisma.cngApplication.update.mockResolvedValue({
      ...application,
      packageId: 'B',
      financingPlanId: CngFinancingPlan.Gold,
      preferredLoanTenor: 6,
      packagePriceNgn: 110000,
      depositAmountNgn: 55000,
      financedAmountNgn: 55000,
      interestAmountNgn: 11000,
      monthlyPaymentNgn: 11000,
      totalCostNgn: 121000,
      privacyConsentAt: new Date(),
      privacyPolicyVersion: '1.0',
      financingCompletedAt: new Date(),
    });

    await service.saveFinancingDetails(application.id, {
      packageId: 'B',
      financingPlanId: CngFinancingPlan.Gold,
      preferredLoanTenor: 6,
      privacyConsent: true,
    });

    expect(mockPrisma.cngApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          packagePriceNgn: 110000,
          depositAmountNgn: 55000,
          financedAmountNgn: 55000,
          interestAmountNgn: 11000,
          monthlyPaymentNgn: 11000,
          totalCostNgn: 121000,
        }),
      }),
    );
  });

  it('reports every missing submission requirement', async () => {
    mockPrisma.cngApplication.findUnique.mockResolvedValue(application);

    await expect(service.submitApplication(application.id)).rejects.toMatchObject({
      response: {
        message: 'Application is incomplete',
        errors: expect.arrayContaining([
          'personal_details',
          'phone_verification',
          'vehicle_details',
          'financing_and_consent',
          'document:govt_id',
        ]),
      },
    });
  });

  it('submits a fully completed application', async () => {
    const completed = {
      ...application,
      personalCompletedAt: new Date(),
      phoneVerifiedAt: new Date(),
      vehicleCompletedAt: new Date(),
      financingCompletedAt: new Date(),
      privacyConsentAt: new Date(),
      documents: REQUIRED_CNG_DOCUMENT_TYPES.map((type, index) => ({
        id: `document-${index}`,
        applicationId: application.id,
        type,
        originalName: `${type}.pdf`,
        storageKey: `${application.id}/${type}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 100,
        checksumSha256: 'checksum',
        uploadedAt: new Date(),
      })),
    } as ApplicationWithDocuments;
    mockPrisma.cngApplication.findUnique.mockResolvedValue(completed);
    mockPrisma.cngApplication.update.mockResolvedValue({
      ...completed,
      status: CngApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
    });

    const result = await service.submitApplication(application.id);

    expect(result.status).toBe(CngApplicationStatus.SUBMITTED);
  });

  it('prevents editing after submission', async () => {
    mockPrisma.cngApplication.findUnique.mockResolvedValue({
      ...application,
      status: CngApplicationStatus.SUBMITTED,
    });

    await expect(
      service.saveVehicleDetails(application.id, {
        vehicleBrand: 'Toyota',
        vehicleModel: 'Camry',
        vehicleYear: 2018,
        manufacturingDate: '2018-06',
        vehicleColor: 'Silver',
        fuelSystem: CngFuelSystem.Injector,
        engineType: CngEngineType.FourCylinder,
        licensePlate: 'ABC123XY',
        chassisNumber: '1HGBH41JXMN109186',
        engineNumber: '2AZFE1234567',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns PII-minimized summaries from the administrative list', async () => {
    mockPrisma.cngApplication.findMany.mockResolvedValue([
      {
        ...application,
        firstName: 'Emeka',
        lastName: 'Okafor',
        email: 'emeka@example.com',
        phone: '+2348012345678',
        bvnLast4: '8901',
        ninLast4: '8901',
      },
    ]);
    mockPrisma.cngApplication.count.mockResolvedValue(1);

    const result = (await service.listForAdmin({ page: 1, limit: 20 })) as {
      applications: Record<string, unknown>[];
    };

    expect(result.applications[0]).toEqual(
      expect.objectContaining({
        applicant: expect.objectContaining({ email: 'emeka@example.com' }),
      }),
    );
    expect(result.applications[0]).not.toHaveProperty('personal');
    expect(result.applications[0]).not.toHaveProperty('documents');
    expect(JSON.stringify(result.applications[0])).not.toContain('8901');
  });
});

function makeApplication(): ApplicationWithDocuments {
  const now = new Date('2026-08-15T00:00:00.000Z');
  return {
    id: '4ca36a47-793c-4e20-8ceb-199a99de9c80',
    reference: 'CNG-2026-A1B2C3D4',
    accessTokenHash: 'access-token-hash',
    userId: null,
    status: CngApplicationStatus.DRAFT,
    firstName: null,
    middleName: null,
    lastName: null,
    gender: null,
    dateOfBirth: null,
    maritalStatus: null,
    email: null,
    phone: null,
    phoneVerifiedAt: null,
    bvnEncrypted: null,
    bvnHash: null,
    bvnLast4: null,
    ninEncrypted: null,
    ninHash: null,
    ninLast4: null,
    currentlyEmployed: null,
    employmentStatus: null,
    employmentSector: null,
    employerName: null,
    occupationJobTitle: null,
    monthlyIncome: null,
    employmentStartDate: null,
    employmentConfirmationDate: null,
    address: null,
    state: null,
    lga: null,
    nextOfKinName: null,
    nextOfKinPhone: null,
    nextOfKinRelationship: null,
    personalCompletedAt: null,
    vehicleBrand: null,
    vehicleModel: null,
    vehicleYear: null,
    manufacturingDate: null,
    vehicleColor: null,
    mileage: null,
    fuelSystem: null,
    engineType: null,
    licensePlate: null,
    chassisNumber: null,
    engineNumber: null,
    vehicleCompletedAt: null,
    packageId: null,
    financingPlanId: null,
    preferredLoanTenor: null,
    packagePriceNgn: null,
    depositAmountNgn: null,
    financedAmountNgn: null,
    interestAmountNgn: null,
    monthlyPaymentNgn: null,
    totalCostNgn: null,
    privacyConsentAt: null,
    privacyPolicyVersion: null,
    financingCompletedAt: null,
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    rejectionReason: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    documents: [],
  };
}
