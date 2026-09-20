import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CngApplicationAccessGuard } from './cng-application-access.guard';
import { CngApplicationsService } from './cng-applications.service';
import {
  RequestPhoneVerificationDto,
  SaveFinancingDetailsDto,
  SavePersonalDetailsDto,
  SaveVehicleDetailsDto,
  VerifyPhoneDto,
  SubmitAdditionalInformationDto,
} from './dto/cng-application.dto';
import {
  CngApplicationDocumentResponseDto,
  CngApplicationResponseDto,
  PhoneVerificationResponseDto,
} from './dto/cng-application-response.dto';
import { CNG_DOCUMENTS, isCngDocumentType } from './cng-application.constants';
import { CngApplicationOperationsService } from './cng-application-operations.service';

const APPLICATION_ACCESS_GUARDS = [JwtAuthGuard, CngApplicationAccessGuard];
@ApiTags('cng-applications')
@Controller('cng/applications')
export class CngApplicationsController {
  constructor(
    private readonly cngApplicationsService: CngApplicationsService,
    private readonly configService: ConfigService,
    private readonly operations: CngApplicationOperationsService,
  ) {}

  private assertApplicationsEnabled(): void {
    if (this.configService.get<string>('CNG_APPLICATIONS_ENABLED') !== 'true') {
      throw new ServiceUnavailableException('CNG financing applications are temporarily closed');
    }
  }

  @Get(':id/additional-information')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List additional-information requests for an application' })
  listAdditionalInformation(@Param('id', ParseUUIDPipe) id: string) {
    return this.operations.listCustomerRequests(id);
  }

  @Post(':id/additional-information/:requestId/respond')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 10 },
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Submit text and/or multiple documents for an information request' })
  respondToAdditionalInformation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitAdditionalInformationDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.operations.submitInformationResponse(
      id,
      requestId,
      user.sub,
      dto.textAnswer,
      files,
    );
  }

  @Get('configuration')
  @ApiOperation({ summary: 'Get CNG packages, financing plans, and document rules' })
  getConfiguration(): Record<string, unknown> {
    return this.cngApplicationsService.getConfiguration();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a CNG financing application draft' })
  @ApiResponse({ status: 201, type: CngApplicationResponseDto })
  async createApplication(@CurrentUser() user: JwtPayload): Promise<Record<string, unknown>> {
    this.assertApplicationsEnabled();
    return this.cngApplicationsService.createApplication(user.sub);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "List the signed-in user's CNG applications" })
  @ApiResponse({ status: 200, type: [CngApplicationResponseDto] })
  async getMyApplications(@CurrentUser() user: JwtPayload): Promise<Record<string, unknown>[]> {
    return this.cngApplicationsService.getMyApplications(user.sub);
  }

  @Get(':id')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a CNG application and its completion progress' })
  @ApiResponse({ status: 200, type: CngApplicationResponseDto })
  async getApplication(@Param('id', ParseUUIDPipe) id: string): Promise<Record<string, unknown>> {
    return this.cngApplicationsService.getApplication(id);
  }

  @Patch(':id/personal')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Save personal, employment, address, and next-of-kin details' })
  @ApiResponse({ status: 200, type: CngApplicationResponseDto })
  async savePersonalDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SavePersonalDetailsDto,
  ): Promise<Record<string, unknown>> {
    this.assertApplicationsEnabled();
    return this.cngApplicationsService.savePersonalDetails(id, dto);
  }

  @Post(':id/phone-verification/request')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @Throttle({ medium: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Send a phone verification code' })
  @ApiResponse({ status: 200, type: PhoneVerificationResponseDto })
  async requestPhoneVerification(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestPhoneVerificationDto,
  ): Promise<{ phone: string; expiresAt: Date; developmentCode?: string }> {
    this.assertApplicationsEnabled();
    return this.cngApplicationsService.requestPhoneVerification(id, dto);
  }

  @Post(':id/phone-verification/verify')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @Throttle({ medium: { limit: 10, ttl: 10 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Verify the applicant phone number' })
  async verifyPhone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyPhoneDto,
  ): Promise<{ verified: true }> {
    this.assertApplicationsEnabled();
    return this.cngApplicationsService.verifyPhone(id, dto);
  }

  @Patch(':id/vehicle')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Save vehicle and CNG conversion compatibility details' })
  @ApiResponse({ status: 200, type: CngApplicationResponseDto })
  async saveVehicleDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveVehicleDetailsDto,
  ): Promise<Record<string, unknown>> {
    this.assertApplicationsEnabled();
    return this.cngApplicationsService.saveVehicleDetails(id, dto);
  }

  @Patch(':id/financing')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Save package, deposit-based financing plan, and privacy consent' })
  @ApiResponse({ status: 200, type: CngApplicationResponseDto })
  async saveFinancingDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveFinancingDetailsDto,
  ): Promise<Record<string, unknown>> {
    this.assertApplicationsEnabled();
    return this.cngApplicationsService.saveFinancingDetails(id, dto);
  }

  @Post(':id/documents/:type')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @Throttle({
    short: { limit: 15, ttl: 1_000 },
    medium: { limit: 30, ttl: 10_000 },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (request, file, callback) => {
        const type = request.params.type;
        if (!isCngDocumentType(type)) {
          return callback(new BadRequestException('Unsupported document type'), false);
        }
        if (!(CNG_DOCUMENTS[type].allowedMimeTypes as readonly string[]).includes(file.mimetype)) {
          return callback(new BadRequestException('Unsupported document format'), false);
        }
        callback(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload or replace one private application document' })
  @ApiResponse({ status: 201, type: CngApplicationDocumentResponseDto })
  async uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type') type: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<Record<string, unknown>> {
    this.assertApplicationsEnabled();
    if (!file) throw new BadRequestException('No document file provided');
    const extensionByMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'application/pdf': '.pdf',
    };
    const storageKey = `${id}/${randomUUID()}${extensionByMime[file.mimetype]}`;
    return this.cngApplicationsService.saveDocument(id, type, file, storageKey);
  }

  @Delete(':id/documents/:type')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remove a document from a draft application' })
  async deleteDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type') type: string,
  ): Promise<void> {
    this.assertApplicationsEnabled();
    await this.cngApplicationsService.deleteDocument(id, type);
  }

  @Get(':id/documents/:type/download')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Download a private application document' })
  async downloadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type') type: string,
    @Res() response: Response,
  ): Promise<void> {
    const { document, stream } = await this.cngApplicationsService.getDocumentForDownload(id, type);
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader('Content-Length', document.sizeBytes);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
    );
    await new Promise<void>((resolvePromise, rejectPromise) => {
      stream.on('error', rejectPromise);
      stream.on('end', resolvePromise);
      stream.pipe(response);
    });
  }

  @Post(':id/submit')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Validate and submit a completed CNG application' })
  @ApiResponse({ status: 200, type: CngApplicationResponseDto })
  async submitApplication(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    this.assertApplicationsEnabled();
    return this.cngApplicationsService.submitApplication(id);
  }

  @Post(':id/cancel')
  @UseGuards(...APPLICATION_ACCESS_GUARDS)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancel a draft or submitted CNG application' })
  @ApiResponse({ status: 200, type: CngApplicationResponseDto })
  async cancelApplication(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    return this.cngApplicationsService.cancelApplication(id);
  }
}
