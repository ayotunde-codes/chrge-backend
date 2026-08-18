import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CngApplicationStatus } from '@prisma/client';

export class CngApplicationDocumentResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'bank_statement' })
  type: string;

  @ApiProperty({ example: 'statement.pdf' })
  originalName: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 428512 })
  sizeBytes: number;

  @ApiProperty()
  required: boolean;

  @ApiProperty()
  uploadedAt: Date;
}

export class CngApplicationProgressResponseDto {
  @ApiProperty()
  personal: boolean;

  @ApiProperty()
  phoneVerified: boolean;

  @ApiProperty()
  vehicle: boolean;

  @ApiProperty()
  documents: boolean;

  @ApiProperty()
  financing: boolean;

  @ApiProperty({ type: [String] })
  missingRequiredDocuments: string[];
}

export class CngApplicationResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'CNG-2026-A1B2C3D4' })
  reference: string;

  @ApiProperty({ enum: CngApplicationStatus })
  status: CngApplicationStatus;

  @ApiProperty({ type: CngApplicationProgressResponseDto })
  progress: CngApplicationProgressResponseDto;

  @ApiPropertyOptional({
    description: 'Saved personal data with BVN and NIN returned only in masked form',
  })
  personal: Record<string, unknown> | null;

  @ApiPropertyOptional()
  vehicle: Record<string, unknown> | null;

  @ApiPropertyOptional()
  financing: Record<string, unknown> | null;

  @ApiProperty({ type: [CngApplicationDocumentResponseDto] })
  documents: CngApplicationDocumentResponseDto[];

  @ApiPropertyOptional()
  submittedAt: Date | null;

  @ApiPropertyOptional()
  reviewedAt: Date | null;

  @ApiPropertyOptional()
  reviewNote: string | null;

  @ApiPropertyOptional()
  rejectionReason: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PhoneVerificationResponseDto {
  @ApiProperty({ example: '+2348012345678' })
  phone: string;

  @ApiProperty()
  expiresAt: Date;

  @ApiPropertyOptional({
    description: 'Returned only in non-production environments when no OTP webhook is configured',
  })
  developmentCode?: string;
}

export class AdminCngApplicationListResponseDto {
  @ApiProperty({ type: [Object], description: 'PII-minimized application summaries' })
  applications: Record<string, unknown>[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
