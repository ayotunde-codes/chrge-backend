import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================================================
// STATION CARD (for lists)
// ============================================================================

export class StationCardResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Lekki Phase 1 Supercharger' })
  name: string;

  @ApiProperty({ example: 'Lekki, Lagos' })
  cityAreaLabel: string;

  @ApiPropertyOptional({ example: 2.5, description: 'Distance in km from query location' })
  distanceKm: number | null;

  @ApiPropertyOptional({ example: 'https://example.com/station.jpg' })
  heroImageUrl: string | null;

  @ApiProperty({ example: true })
  isOpenNow: boolean;

  @ApiPropertyOptional({ example: '₦350/kWh + ₦500 session' })
  priceSummary: string | null;

  @ApiProperty({ example: 'CCS2, TYPE2' })
  connectorsSummary: string;

  @ApiPropertyOptional({ example: 150 })
  maxPowerKw: number | null;

  @ApiProperty({ example: 3 })
  portsAvailableCount: number;

  @ApiProperty({ example: 6 })
  portsTotalCount: number;

  @ApiProperty({ example: '3/6 available' })
  statusSummary: string;

  @ApiPropertyOptional({ example: 4.5 })
  avgRating: number | null;

  @ApiProperty({ example: 12 })
  reviewCount: number;

  @ApiProperty({ example: false })
  isFavorite: boolean;

  @ApiPropertyOptional()
  updatedAt: Date | null;
}

export class StationListResponseDto {
  @ApiProperty({ type: [StationCardResponseDto] })
  stations: StationCardResponseDto[];

  @ApiPropertyOptional({ description: 'Cursor for next page' })
  nextCursor: string | null;
}

// ============================================================================
// STATION DETAIL
// ============================================================================

class NetworkInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Tesla' })
  name: string;

  @ApiPropertyOptional()
  logoUrl: string | null;

  @ApiPropertyOptional()
  website: string | null;

  @ApiPropertyOptional()
  phoneNumber: string | null;
}

class StationImageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  @ApiPropertyOptional()
  caption: string | null;
}

class PortPricingDto {
  @ApiPropertyOptional({ example: 350 })
  perKwh: number | null;

  @ApiPropertyOptional({ example: 5 })
  perMinute: number | null;

  @ApiPropertyOptional({ example: 500 })
  sessionFee: number | null;
}

class PortDetailDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'CCS2' })
  connectorType: string;

  @ApiProperty({ example: 'DCFC' })
  chargerType: string;

  @ApiProperty({ example: 150 })
  powerKw: number;

  @ApiProperty({ example: 'AVAILABLE', enum: ['AVAILABLE', 'IN_USE', 'OUT_OF_ORDER', 'UNKNOWN'] })
  status: string;

  @ApiPropertyOptional({ example: 'A1' })
  portNumber: string | null;

  @ApiProperty({ type: PortPricingDto })
  pricing: PortPricingDto;

  @ApiPropertyOptional({ description: 'When the port might become available' })
  estimatedAvailableAt: Date | null;

  @ApiPropertyOptional({ example: 15, description: 'Minutes until available (if IN_USE)' })
  minutesRemaining: number | null;
}

class DayHoursDto {
  @ApiProperty({ example: '08:00' })
  open: string;

  @ApiProperty({ example: '22:00' })
  close: string;
}

class OperatingHoursDto {
  @ApiPropertyOptional({ type: DayHoursDto })
  mon?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  tue?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  wed?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  thu?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  fri?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  sat?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  sun?: DayHoursDto;
}

class StationPricingDto {
  @ApiPropertyOptional({ example: 350 })
  perKwh?: number;

  @ApiPropertyOptional({ example: 5 })
  perMinute?: number;

  @ApiPropertyOptional({ example: 500 })
  sessionFee?: number;

  @ApiProperty({ example: 'NGN' })
  currency: string;
}

export class StationDetailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Lekki Phase 1 Supercharger' })
  name: string;

  @ApiPropertyOptional({ example: 'Fast charging station near the mall' })
  description: string | null;

  @ApiProperty({ example: '123 Admiralty Way' })
  address: string;

  @ApiProperty({ example: 'Lekki' })
  city: string;

  @ApiProperty({ example: 'Lagos' })
  state: string;

  @ApiPropertyOptional({ example: '101233' })
  postalCode: string | null;

  @ApiProperty({ example: 'NG' })
  country: string;

  @ApiProperty({ example: 6.4541 })
  latitude: number;

  @ApiProperty({ example: 3.4725 })
  longitude: number;

  @ApiProperty({ example: true })
  isOpenNow: boolean;

  @ApiPropertyOptional({ type: OperatingHoursDto })
  operatingHours: OperatingHoursDto | null;

  @ApiProperty({ example: ['restrooms', 'wifi', 'food'], type: [String] })
  amenities: string[];

  @ApiPropertyOptional({ type: StationPricingDto })
  pricing: StationPricingDto | null;

  @ApiPropertyOptional({ example: '+234 801 234 5678' })
  phoneNumber: string | null;

  @ApiPropertyOptional({ type: NetworkInfoDto })
  network: NetworkInfoDto | null;

  @ApiProperty({ type: [StationImageDto] })
  images: StationImageDto[];

  @ApiProperty({ type: [PortDetailDto] })
  ports: PortDetailDto[];

  @ApiProperty({ example: 6 })
  totalPorts: number;

  @ApiProperty({ example: 3 })
  availablePorts: number;

  @ApiPropertyOptional({ example: 4.5 })
  avgRating: number | null;

  @ApiProperty({ example: 12 })
  reviewCount: number;

  @ApiProperty({ example: false })
  isFavorite: boolean;

  @ApiProperty({ example: true })
  isVerified: boolean;

  @ApiPropertyOptional()
  lastStatusUpdate: Date | null;
}

// ============================================================================
// REVIEWS
// ============================================================================

class ReviewUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiPropertyOptional()
  avatarUrl: string | null;
}

export class ReviewResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 4 })
  rating: number;

  @ApiPropertyOptional({ example: 'Great station!' })
  comment: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: ReviewUserDto })
  user: ReviewUserDto;
}

export class ReviewListResponseDto {
  @ApiProperty({ type: [ReviewResponseDto] })
  reviews: ReviewResponseDto[];

  @ApiPropertyOptional({ description: 'Cursor for next page (ISO date string)' })
  nextCursor: string | null;
}
