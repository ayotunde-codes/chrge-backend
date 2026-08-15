import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CngApplicationsService } from './cng-applications.service';
import { AdminCngApplicationQueryDto, ReviewCngApplicationDto } from './dto/cng-application.dto';
import {
  AdminCngApplicationListResponseDto,
  CngApplicationResponseDto,
} from './dto/cng-application-response.dto';

@ApiTags('admin-cng-applications')
@Controller('admin/cng-applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERATOR')
@ApiBearerAuth('access-token')
export class AdminCngApplicationsController {
  constructor(private readonly cngApplicationsService: CngApplicationsService) {}

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
  async getApplication(@Param('id', ParseUUIDPipe) id: string): Promise<Record<string, unknown>> {
    return this.cngApplicationsService.getApplication(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move an application through review, approval, or rejection' })
  @ApiResponse({ status: 200, type: CngApplicationResponseDto })
  async reviewApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReviewCngApplicationDto,
  ): Promise<Record<string, unknown>> {
    return this.cngApplicationsService.reviewApplication(id, user.sub, dto);
  }
}
