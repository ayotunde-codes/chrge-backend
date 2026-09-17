import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
  Res,
  ForbiddenException,
  UseInterceptors,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffAccessGuard } from '../../common/guards/staff-access.guard';
import { CngApplicationsService } from './cng-applications.service';
import { AdminCngReviewService } from './admin-cng-review.service';
import { AdminAuditInterceptor } from '../audit/admin-audit.interceptor';
import {
  AdvanceCngWorkflowDto,
  AdminCngApplicationQueryDto,
  ReviewCngApplicationDto,
  SubmitCngReviewNoteDto,
} from './dto/cng-application.dto';
import {
  AdminCngApplicationListResponseDto,
  CngApplicationResponseDto,
} from './dto/cng-application-response.dto';

@ApiTags('admin-cng-applications')
@Controller('admin/cng-applications')
@UseGuards(JwtAuthGuard, StaffAccessGuard, RolesGuard)
@Roles('ADMIN', 'OPERATOR')
@ApiBearerAuth('access-token')
@UseInterceptors(AdminAuditInterceptor)
export class AdminCngApplicationsController {
  constructor(
    private readonly cngApplicationsService: CngApplicationsService,
    private readonly adminReview: AdminCngReviewService,
  ) {}
  private context(user: JwtPayload, request: Request) {
    return {
      actorId: user.sub,
      actorRole: user.role === 'OPERATOR' ? ('OPERATOR' as const) : ('ADMIN' as const),
      requestId: request.get('x-request-id') ?? randomUUID(),
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List and search CNG financing applications' })
  @ApiResponse({ status: 200, type: AdminCngApplicationListResponseDto })
  async listApplications(
    @Query() dto: AdminCngApplicationQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.cngApplicationsService.listForAdmin(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a CNG application for administrative review' })
  @ApiResponse({ status: 200, type: CngApplicationResponseDto })
  async getApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.adminReview.detail(id, this.context(user, request));
  }

  @Get(':id/documents/:documentId/download')
  @ApiOperation({ summary: 'Open an audited, step-up-protected private document' })
  async downloadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const { document, stream } = await this.adminReview.document(
      id,
      documentId,
      this.context(user, request),
      user.mfaAt,
    );
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader('Content-Length', document.sizeBytes);
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
    );
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; sandbox",
    );
    await new Promise<void>((resolve, reject) => {
      stream.on('error', reject);
      stream.on('end', resolve);
      stream.pipe(response);
    });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move an application through review, approval, or rejection' })
  @ApiResponse({ status: 200, type: CngApplicationResponseDto })
  async reviewApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReviewCngApplicationDto,
  ): Promise<Record<string, unknown>> {
    const sensitiveDecision = dto.status === 'REJECTED';
    if (
      sensitiveDecision &&
      (user.role === 'OPERATOR' || !user.mfaAt || Date.now() / 1000 - user.mfaAt > 300)
    ) {
      throw new ForbiddenException('Administrator role and fresh step-up authentication required');
    }
    return this.cngApplicationsService.reviewApplication(id, user.sub, dto);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Append an internal note to a CNG application' })
  async submitNote(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitCngReviewNoteDto,
  ) {
    return this.cngApplicationsService.submitReviewNote(id, user.sub, dto);
  }

  @Patch(':id/workflow')
  @ApiOperation({ summary: 'Advance a CNG application through the financing workflow' })
  async advanceWorkflow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AdvanceCngWorkflowDto,
  ) {
    if (
      user.role === 'OPERATOR' &&
      ['FINANCING_APPROVED', 'FINANCE_DISBURSED'].includes(dto.status)
    ) {
      throw new ForbiddenException('Administrator role required for financial decisions');
    }
    if (
      ['FINANCING_APPROVED', 'FINANCE_DISBURSED'].includes(dto.status) &&
      (!user.mfaAt || Date.now() / 1000 - user.mfaAt > 300)
    ) {
      throw new ForbiddenException('Fresh step-up authentication required');
    }
    return this.cngApplicationsService.advanceWorkflow(id, dto);
  }
}
