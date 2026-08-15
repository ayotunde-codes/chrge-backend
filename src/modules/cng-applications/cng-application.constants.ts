export enum CngGender {
  Male = 'male',
  Female = 'female',
  PreferNotToSay = 'prefer_not_to_say',
}

export enum CngMaritalStatus {
  Single = 'single',
  Married = 'married',
  Divorced = 'divorced',
  Widowed = 'widowed',
}

export enum CngEmploymentStatus {
  Employed = 'employed',
  SelfEmployed = 'self_employed',
  BusinessOwner = 'business_owner',
  RideHailingDriver = 'driver_ridehail',
  Contractor = 'contractor',
  Other = 'other',
}

export enum CngEmploymentSector {
  Government = 'government',
  Private = 'private',
  SelfEmployed = 'self_employed',
  NotApplicable = 'not_applicable',
}

export enum CngFuelSystem {
  Carburetor = 'carburetor',
  Injector = 'injector',
}

export enum CngEngineType {
  FourCylinder = '4_cylinder',
  SixCylinder = '6_cylinder',
  EightCylinder = '8_cylinder',
}

export enum CngFinancingPlan {
  Full = 'full',
  Gold = 'gold',
  Silver = 'silver',
  Bronze = 'bronze',
}

export const CNG_PACKAGE_IDS = ['A', 'B', 'C'] as const;

export const CNG_PACKAGES: Record<
  (typeof CNG_PACKAGE_IDS)[number],
  { name: string; tank: string; priceNgn: number }
> = {
  A: { name: 'Package A', tank: '9 Litre Tank', priceNgn: 85000 },
  B: { name: 'Package B', tank: '12 Litre Tank', priceNgn: 110000 },
  C: { name: 'Package C', tank: '15 Litre Tank', priceNgn: 140000 },
};

export const CNG_FINANCING_PLANS: Record<
  CngFinancingPlan,
  { name: string; depositPct: number; tenure: number | null; interestRate: number }
> = {
  [CngFinancingPlan.Full]: {
    name: 'Full Payment',
    depositPct: 100,
    tenure: null,
    interestRate: 0,
  },
  [CngFinancingPlan.Gold]: {
    name: 'Gold Plan',
    depositPct: 50,
    tenure: 6,
    interestRate: 0.1,
  },
  [CngFinancingPlan.Silver]: {
    name: 'Silver Plan',
    depositPct: 20,
    tenure: 10,
    interestRate: 0.15,
  },
  [CngFinancingPlan.Bronze]: {
    name: 'Bronze Plan',
    depositPct: 10,
    tenure: 12,
    interestRate: 0.2,
  },
};

export const CNG_INCOME_RANGES = [
  'Below ₦50,000',
  '₦50,000 – ₦100,000',
  '₦100,000 – ₦200,000',
  '₦200,000 – ₦400,000',
  '₦400,000 – ₦800,000',
  'Above ₦800,000',
] as const;

export const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const;

export const NIGERIAN_PHONE_REGEX = /^(?:\+234|0)(?:70|80|81|90|91)\d{8}$/;

export type CngDocumentConfig = {
  label: string;
  required: boolean;
  maxSizeBytes: number;
  allowedMimeTypes: readonly string[];
};

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'] as const;

export const CNG_DOCUMENTS = {
  govt_id: {
    label: 'Government-issued ID',
    required: true,
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
  },
  proof_address: {
    label: 'Proof of Address',
    required: true,
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
  },
  drivers_license: {
    label: "Driver's License",
    required: true,
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
  },
  passport_photo: {
    label: 'Passport Photograph',
    required: true,
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: IMAGE_MIME_TYPES,
  },
  proof_income: {
    label: 'Proof of Income',
    required: true,
    maxSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
  },
  bank_statement: {
    label: 'Six-month Bank Statement',
    required: true,
    maxSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
  },
  vehicle_reg: {
    label: 'Vehicle Registration',
    required: true,
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
  },
  insurance: {
    label: 'Insurance Certificate',
    required: true,
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
  },
  vehicle_front: {
    label: 'Vehicle Front Image',
    required: true,
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: IMAGE_MIME_TYPES,
  },
  vehicle_back: {
    label: 'Vehicle Back Image',
    required: true,
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: IMAGE_MIME_TYPES,
  },
  vehicle_side: {
    label: 'Vehicle Side Image',
    required: true,
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: IMAGE_MIME_TYPES,
  },
  company_id: {
    label: 'Company ID',
    required: false,
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
  },
  employment_letter: {
    label: 'Employment Letter',
    required: false,
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
  },
  confirmation_letter: {
    label: 'Confirmation Letter',
    required: false,
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
  },
} satisfies Record<string, CngDocumentConfig>;

export type CngDocumentType = keyof typeof CNG_DOCUMENTS;

export const REQUIRED_CNG_DOCUMENT_TYPES = Object.entries(CNG_DOCUMENTS)
  .filter(([, config]) => config.required)
  .map(([type]) => type as CngDocumentType);

export function isCngDocumentType(value: string): value is CngDocumentType {
  return Object.prototype.hasOwnProperty.call(CNG_DOCUMENTS, value);
}

export function normalizeNigerianPhone(phone: string): string {
  const compact = phone.replace(/[\s()-]/g, '');
  return compact.startsWith('0') ? `+234${compact.slice(1)}` : compact;
}
