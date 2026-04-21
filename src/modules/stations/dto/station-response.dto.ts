import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================================================
// STATION CARD (for lists) — matches frontend Station type
// ============================================================================

class ConnectorSummaryDto {
  @ApiProperty({ example: 'CCS2' })
  type: string;

  @ApiProperty({ example: 150 })
  powerKw: number;

  @ApiProperty({ example: 4 })
  count: number;
}

export class StationCardResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Lekki Phase 1 Supercharger' })
  name: string;

  @ApiProperty({ example: '123 Admiralty Way' })
  address: string;

  @ApiPropertyOptional({ example: 'Lekki', description: 'Neighbourhood / district' })
  area: string | null;

  @ApiProperty({ example: 'Lagos' })
  city: string;

  @ApiProperty({ example: 6.4478, description: 'Latitude' })
  lat: number;

  @ApiProperty({ example: 3.4723, description: 'Longitude' })
  lng: number;

  @ApiPropertyOptional({ example: 'https://example.com/station.jpg' })
  heroImageUrl: string | null;

  @ApiProperty({ type: [String], example: ['https://example.com/img1.jpg'] })
  images: string[];

  @ApiPropertyOptional({ example: 2.5, description: 'Distance in km from query location' })
  distanceKm: number | null;

  @ApiPropertyOptional({ example: 4.5 })
  rating: number | null;

  @ApiProperty({ example: 12 })
  reviewCount: number;

  @ApiProperty({ example: true })
  isOpenNow: boolean;

  @ApiProperty({ example: 'Open 24/7', description: 'Human-readable opening hours text' })
  openingHoursText: string;

  @ApiPropertyOptional({ example: '₦350/kWh', description: 'Human-readable price text' })
  priceText: string | null;

  @ApiProperty({
    example: 'AVAILABLE',
    enum: ['AVAILABLE', 'IN_USE', 'OUT_OF_SERVICE'],
    description: 'Overall station availability status',
  })
  statusSummary: string;

  @ApiProperty({ example: 3 })
  portsAvailableCount: number;

  @ApiProperty({ example: 6 })
  portsTotalCount: number;

  @ApiProperty({ type: [ConnectorSummaryDto] })
  connectors: ConnectorSummaryDto[];

  @ApiProperty({ type: [String], example: ['Cafe', 'WiFi', 'Restroom'] })
  amenities: string[];

  @ApiPropertyOptional()
  updatedAt: string | null;

  @ApiProperty({ example: false })
  isFavorite: boolean;
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

  @ApiPropertyOptional({ example: 'Lekki', description: 'Neighbourhood / district' })
  area: string | null;

  @ApiProperty({ example: 'Lagos' })
  city: string;

  @ApiProperty({ example: 'Lagos' })
  state: string;

  @ApiPropertyOptional({ example: '101233' })
  postalCode: string | null;

  @ApiProperty({ example: 'NG' })
  country: string;

  @ApiProperty({ example: 6.4541, description: 'Latitude (also exposed as lat)' })
  latitude: number;

  @ApiProperty({ example: 3.4725, description: 'Longitude (also exposed as lng)' })
  longitude: number;

  @ApiProperty({ example: 6.4541 })
  lat: number;

  @ApiProperty({ example: 3.4725 })
  lng: number;

  @ApiProperty({ example: true })
  isOpenNow: boolean;

  @ApiProperty({ example: 'Open 24/7' })
  openingHoursText: string;

  @ApiPropertyOptional({ type: OperatingHoursDto })
  operatingHours: OperatingHoursDto | null;

  @ApiProperty({ example: ['Cafe', 'WiFi', 'Restroom'], type: [String] })
  amenities: string[];

  @ApiPropertyOptional({ example: '₦350/kWh' })
  priceText: string | null;

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
  rating: number | null;

  @ApiProperty({ example: 12 })
  reviewCount: number;

  @ApiProperty({
    example: 'AVAILABLE',
    enum: ['AVAILABLE', 'IN_USE', 'OUT_OF_SERVICE'],
  })
  statusSummary: string;

  @ApiProperty({ example: 3 })
  portsAvailableCount: number;

  @ApiProperty({ example: 6 })
  portsTotalCount: number;

  @ApiProperty({ type: [ConnectorSummaryDto] })
  connectors: ConnectorSummaryDto[];

  @ApiProperty({ example: false })
  isFavorite: boolean;

  @ApiProperty({ example: true })
  isVerified: boolean;

  @ApiPropertyOptional()
  lastStatusUpdate: Date | null;

  @ApiPropertyOptional()
  updatedAt: string | null;

  @ApiProperty({
    example: 'APPROVED',
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    description: 'Submission approval status',
  })
  status: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'User ID who submitted this station' })
  submittedBy: string | null;

  @ApiPropertyOptional({ example: 'Location could not be verified', description: 'Reason if rejected' })
  rejectionReason: string | null;
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
