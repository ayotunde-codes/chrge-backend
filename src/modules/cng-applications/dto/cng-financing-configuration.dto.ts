import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const CONFIGURABLE_CNG_PLAN_IDS = ['gold', 'silver', 'bronze'] as const;

export class CngFinancingTermInputDto {
  @IsIn(CONFIGURABLE_CNG_PLAN_IDS)
  planId: (typeof CONFIGURABLE_CNG_PLAN_IDS)[number];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  tenureMonths: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  interestRateBps: number;
}

export class SaveCngFinancingPackageDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tank: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(100000000)
  priceNgn: number;

  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => CngFinancingTermInputDto)
  terms: CngFinancingTermInputDto[];
}

export class PublishCngFinancingPackageDto {
  @IsString()
  @MinLength(32)
  stepUpToken: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class SetCngFinancingPackageActivationDto extends PublishCngFinancingPackageDto {
  @IsBoolean()
  active: boolean;
}
