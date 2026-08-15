import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CngApplicationStatus } from '@prisma/client';
import {
  CNG_INCOME_RANGES,
  CNG_PACKAGE_IDS,
  CngEmploymentSector,
  CngEmploymentStatus,
  CngEngineType,
  CngFinancingPlan,
  CngFuelSystem,
  CngGender,
  CngMaritalStatus,
  NIGERIAN_PHONE_REGEX,
  NIGERIAN_STATES,
} from '../cng-application.constants';

const CURRENT_YEAR = new Date().getFullYear();

export class SavePersonalDetailsDto {
  @ApiProperty({ example: 'Emeka' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName: string;

  @ApiPropertyOptional({ example: 'Chukwuemeka' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @ApiProperty({ example: 'Okafor' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ enum: CngGender, example: CngGender.Male })
  @IsEnum(CngGender)
  gender: CngGender;

  @ApiProperty({ example: '1990-01-15' })
  @IsDateString({ strict: true })
  dateOfBirth: string;

  @ApiProperty({ enum: CngMaritalStatus, example: CngMaritalStatus.Married })
  @IsEnum(CngMaritalStatus)
  maritalStatus: CngMaritalStatus;

  @ApiProperty({ example: 'emeka@example.com' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  email: string;

  @ApiProperty({ example: '08012345678' })
  @IsString()
  @Matches(NIGERIAN_PHONE_REGEX, { message: 'phone must be a valid Nigerian mobile number' })
  phone: string;

  @ApiProperty({ example: '12345678901' })
  @Matches(/^\d{11}$/, { message: 'bvn must contain exactly 11 digits' })
  bvn: string;

  @ApiProperty({ example: '12345678901' })
  @Matches(/^\d{11}$/, { message: 'nin must contain exactly 11 digits' })
  nin: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  currentlyEmployed: boolean;

  @ApiProperty({ enum: CngEmploymentStatus, example: CngEmploymentStatus.Employed })
  @IsEnum(CngEmploymentStatus)
  employmentStatus: CngEmploymentStatus;

  @ApiProperty({ enum: CngEmploymentSector, example: CngEmploymentSector.Private })
  @IsEnum(CngEmploymentSector)
  employmentSector: CngEmploymentSector;

  @ApiPropertyOptional({ example: 'Example Logistics Limited' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  employerName?: string;

  @ApiProperty({ example: 'Operations Manager' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  occupationJobTitle: string;

  @ApiProperty({ enum: CNG_INCOME_RANGES, example: '₦200,000 – ₦400,000' })
  @IsIn(CNG_INCOME_RANGES)
  monthlyIncome: string;

  @ApiPropertyOptional({ example: '2020-01-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  employmentStartDate?: string;

  @ApiPropertyOptional({ example: '2020-07-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  employmentConfirmationDate?: string;

  @ApiProperty({ example: '14 Herbert Macaulay Way, Yaba' })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  address: string;

  @ApiProperty({ enum: NIGERIAN_STATES, example: 'Lagos' })
  @IsIn(NIGERIAN_STATES)
  state: string;

  @ApiProperty({ example: 'Yaba' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lga: string;

  @ApiProperty({ example: 'Chidi Okafor' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nextOfKinName: string;

  @ApiProperty({ example: '08023456789' })
  @IsString()
  @Matches(NIGERIAN_PHONE_REGEX, {
    message: 'nextOfKinPhone must be a valid Nigerian mobile number',
  })
  nextOfKinPhone: string;

  @ApiProperty({ example: 'Sibling' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nextOfKinRelationship: string;
}

export class SaveVehicleDetailsDto {
  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  vehicleBrand: string;

  @ApiProperty({ example: 'Camry' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  vehicleModel: string;

  @ApiProperty({ example: 2018 })
  @Type(() => Number)
  @IsInt()
  @Min(1980)
  @Max(CURRENT_YEAR + 1)
  vehicleYear: number;

  @ApiProperty({ example: '2018-06', description: 'Manufacturing month in YYYY-MM format' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'manufacturingDate must use YYYY-MM format',
  })
  manufacturingDate: string;

  @ApiProperty({ example: 'Silver' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  vehicleColor: string;

  @ApiPropertyOptional({ example: '85000' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  mileage?: string;

  @ApiProperty({ enum: CngFuelSystem, example: CngFuelSystem.Injector })
  @IsEnum(CngFuelSystem)
  fuelSystem: CngFuelSystem;

  @ApiProperty({ enum: CngEngineType, example: CngEngineType.FourCylinder })
  @IsEnum(CngEngineType)
  engineType: CngEngineType;

  @ApiProperty({ example: 'ABC123XY' })
  @IsString()
  @MinLength(5)
  @MaxLength(30)
  licensePlate: string;

  @ApiProperty({ example: '1HGBH41JXMN109186' })
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  chassisNumber: string;

  @ApiProperty({ example: '2AZFE1234567' })
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  engineNumber: string;
}

export class SaveFinancingDetailsDto {
  @ApiProperty({ enum: CNG_PACKAGE_IDS, example: 'B' })
  @IsIn(CNG_PACKAGE_IDS)
  packageId: (typeof CNG_PACKAGE_IDS)[number];

  @ApiProperty({ enum: CngFinancingPlan, example: CngFinancingPlan.Gold })
  @IsEnum(CngFinancingPlan)
  financingPlanId: CngFinancingPlan;

  @ApiPropertyOptional({ example: 6, minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  preferredLoanTenor?: number;

  @ApiProperty({ example: true })
  @Equals(true, { message: 'privacyConsent must be accepted' })
  privacyConsent: true;

  @ApiPropertyOptional({ example: '1.0', default: '1.0' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  privacyPolicyVersion?: string;
}

export class RequestPhoneVerificationDto {
  @ApiProperty({ example: '08012345678' })
  @IsString()
  @Matches(NIGERIAN_PHONE_REGEX, { message: 'phone must be a valid Nigerian mobile number' })
  phone: string;
}

export class VerifyPhoneDto extends RequestPhoneVerificationDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'code must contain exactly 6 digits' })
  code: string;
}

export class AdminCngApplicationQueryDto {
  @ApiPropertyOptional({ enum: CngApplicationStatus })
  @IsOptional()
  @IsEnum(CngApplicationStatus)
  status?: CngApplicationStatus;

  @ApiPropertyOptional({ example: 'CNG-2026-ABC123' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class ReviewCngApplicationDto {
  @ApiProperty({
    enum: [
      CngApplicationStatus.UNDER_REVIEW,
      CngApplicationStatus.APPROVED,
      CngApplicationStatus.REJECTED,
    ],
  })
  @IsIn([
    CngApplicationStatus.UNDER_REVIEW,
    CngApplicationStatus.APPROVED,
    CngApplicationStatus.REJECTED,
  ])
  status: CngApplicationStatus;

  @ApiPropertyOptional({ example: 'Identity and affordability checks completed.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNote?: string;

  @ApiPropertyOptional({ example: 'Bank statement could not be verified.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionReason?: string;
}
