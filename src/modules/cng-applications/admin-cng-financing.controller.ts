import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { UserRole } from '@prisma/client';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StaffAccessGuard } from '../../common/guards/staff-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminAuditInterceptor } from '../audit/admin-audit.interceptor';
import { UseInterceptors } from '@nestjs/common';
import { CngFinancingConfigurationService } from './cng-financing-configuration.service';
import {
  PublishCngFinancingPackageDto,
  SaveCngFinancingPackageDto,
  SetCngFinancingPackageActivationDto,
} from './dto/cng-financing-configuration.dto';

@ApiTags('admin-cng-financing')
@Controller('admin/cng-financing')
@UseGuards(JwtAuthGuard, StaffAccessGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth('access-token')
@UseInterceptors(AdminAuditInterceptor)
export class AdminCngFinancingController {
  constructor(private readonly financing: CngFinancingConfigurationService) {}

  private context(user: JwtPayload, request: Request) {
    return {
      actorId: user.sub,
      actorRole: user.role as UserRole,
      requestId: request.get('x-request-id') ?? randomUUID(),
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List published, draft, and historical CNG financing packages' })
  list() {
    return this.financing.listForAdmin();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new inactive CNG financing package draft' })
  create(
    @Body() dto: SaveCngFinancingPackageDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.financing.create(
      dto,
      { id: user.sub, role: user.role as UserRole },
      this.context(user, request),
    );
  }

  @Patch(':id/draft')
  @ApiOperation({ summary: 'Save a complete draft version of a financing package' })
  saveDraft(
    @Param('id') id: string,
    @Body() dto: SaveCngFinancingPackageDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.financing.saveDraft(
      id,
      dto,
      { id: user.sub, role: user.role as UserRole },
      this.context(user, request),
    );
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a draft financing package after MFA step-up' })
  publish(
    @Param('id') id: string,
    @Body() dto: PublishCngFinancingPackageDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.financing.publish(
      id,
      dto.stepUpToken,
      dto.reason,
      { id: user.sub, role: user.role as UserRole },
      this.context(user, request),
    );
  }

  @Post(':id/activation')
  @ApiOperation({ summary: 'Activate or deactivate a published financing package after MFA' })
  activation(
    @Param('id') id: string,
    @Body() dto: SetCngFinancingPackageActivationDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.financing.setActivation(
      id,
      dto.active,
      dto.stepUpToken,
      dto.reason,
      { id: user.sub, role: user.role as UserRole },
      this.context(user, request),
    );
  }
}
