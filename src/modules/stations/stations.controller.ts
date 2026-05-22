import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { StationsService } from './stations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { NearbyStationsDto } from './dto/nearby-stations.dto';
import { AllStationsDto } from './dto/all-stations.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { SubmitStationDto } from './dto/submit-station.dto';
import {
  StationCardResponseDto,
  StationDetailResponseDto,
  StationListResponseDto,
  ReviewResponseDto,
  ReviewListResponseDto,
} from './dto/station-response.dto';

@ApiTags('stations')
@Controller('stations')
export class StationsController {
  constructor(private readonly stationsService: StationsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get all stations with optional filters and pagination' })
  @ApiResponse({ status: 200, type: StationListResponseDto })
  async getAllStations(
    @Query() dto: AllStationsDto,
    @CurrentUser() user?: JwtPayload,
  ): Promise<StationListResponseDto> {
    const { stations, nextCursor } = await this.stationsService.findAll(dto, user?.sub);
    return {
      stations: stations as unknown as StationCardResponseDto[],
      nextCursor,
    };
  }

  @Get('nearby')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get stations near a location' })
  @ApiResponse({ status: 200, type: StationListResponseDto })
  async getNearby(
    @Query() dto: NearbyStationsDto,
    @CurrentUser() user?: JwtPayload,
  ): Promise<StationListResponseDto> {
    const { stations, nextCursor } = await this.stationsService.findNearby(dto, user?.sub);
    return {
      stations: stations as unknown as StationCardResponseDto[],
      nextCursor,
    };
  }

  @Get('top-picks')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get curated top pick stations near a location' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max 4' })
  @ApiResponse({ status: 200, type: [StationCardResponseDto] })
  async getTopPicks(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('limit') limit?: number,
    @CurrentUser() user?: JwtPayload,
  ): Promise<StationCardResponseDto[]> {
    const picks = await this.stationsService.findTopPicks(
      Number(lat),
      Number(lng),
      user?.sub,
      Math.min(limit || 4, 4),
    );
    return picks as unknown as StationCardResponseDto[];
  }

  @Post('upload-image')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload a station image, returns the public URL' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'stations');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          cb(null, `${uuidv4()}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('No image file provided');
    const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';
    return { url: `${baseUrl}/uploads/stations/${file.filename}` };
  }

  @Post('submit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Submit a new charging station' })
  @ApiResponse({ status: 201, type: StationDetailResponseDto, description: 'Station submitted successfully' })
  async submitStation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitStationDto,
  ): Promise<StationDetailResponseDto> {
    const station = await this.stationsService.submitStation(user.sub, dto);
    return station as unknown as StationDetailResponseDto;
  }

  @Get('my-submissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Get the current user's submitted stations" })
  @ApiResponse({ status: 200, type: StationListResponseDto })
  async getMySubmissions(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ stations: StationCardResponseDto[]; nextCursor: null }> {
    const stations = await this.stationsService.getMySubmissions(user.sub);
    return { stations: stations as unknown as StationCardResponseDto[], nextCursor: null };
  }

  @Get('identity/preview')
  @ApiOperation({ summary: 'Preview sample anonymous handle formats used in reviews' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        format: 'AdjectiveNounRole',
        examples: ['QuietCraneBrewer', 'BoldFoxSteeper', 'MysticOwlBarista'],
        totalCombinations: 440940,
      },
    },
  })
  getIdentityPreview(): { format: string; examples: string[]; totalCombinations: number } {
    return this.stationsService.getIdentityPreview();
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get station details' })
  @ApiResponse({ status: 200, type: StationDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Station not found' })
  async getStation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<StationDetailResponseDto> {
    const station = await this.stationsService.findById(id, user?.sub);
    return station as unknown as StationDetailResponseDto;
  }

  @Get(':id/reviews')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get reviews for a station' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Default 10' })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Cursor for pagination (ISO date)' })
  @ApiResponse({ status: 200, type: ReviewListResponseDto })
  async getReviews(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ): Promise<ReviewListResponseDto> {
    const { reviews, nextCursor } = await this.stationsService.getReviews(
      id,
      limit || 10,
      cursor,
    );
    return {
      reviews: reviews as unknown as ReviewResponseDto[],
      nextCursor,
    };
  }

  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create or update a review for a station' })
  @ApiResponse({ status: 201, description: 'Review saved' })
  async createReview(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
  ): Promise<{ message: string; reviewId: string }> {
    const review = await this.stationsService.createReview(user.sub, id, dto);
    return { message: 'Review saved successfully', reviewId: review.id };
  }

  @Post(':id/favorite')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Add station to favorites' })
  @ApiResponse({ status: 200, type: StationDetailResponseDto })
  async addFavorite(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StationDetailResponseDto> {
    await this.stationsService.addFavorite(user.sub, id);
    const station = await this.stationsService.findById(id, user.sub);
    return station as unknown as StationDetailResponseDto;
  }

  @Delete(':id/favorite')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remove station from favorites' })
  @ApiResponse({ status: 200, type: StationDetailResponseDto })
  async removeFavorite(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StationDetailResponseDto> {
    await this.stationsService.removeFavorite(user.sub, id);
    const station = await this.stationsService.findById(id, user.sub);
    return station as unknown as StationDetailResponseDto;
  }
}
