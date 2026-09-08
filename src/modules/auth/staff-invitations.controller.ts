import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StaffAccessGuard } from '../../common/guards/staff-access.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  AcceptStaffInvitationDto,
  CreateStaffInvitationDto,
  VerifyStaffInvitationDto,
} from './dto/staff-invitation.dto';
import { StaffInvitationsService } from './staff-invitations.service';

function requestMeta(request: Request, ip: string) {
  return {
    requestId: request.get('x-request-id') ?? randomUUID(),
    ipAddress: ip,
    userAgent: request.get('user-agent'),
  };
}

@Controller('admin/staff/invitations')
@UseGuards(JwtAuthGuard, StaffAccessGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class StaffInvitationsController {
  constructor(private readonly invitations: StaffInvitationsService) {}

  @Get()
  list() {
    return this.invitations.list();
  }

  @Post()
  create(
    @Body() dto: CreateStaffInvitationDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Ip() ip: string,
  ) {
    return this.invitations.create(dto, {
      ...requestMeta(request, ip),
      actorId: user.sub,
      actorRole: 'ADMIN',
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Ip() ip: string,
  ) {
    return this.invitations.revoke(id, {
      ...requestMeta(request, ip),
      actorId: user.sub,
      actorRole: 'ADMIN',
    });
  }
}

@Controller('admin/staff/accounts')
@UseGuards(JwtAuthGuard, StaffAccessGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class StaffAccountsController {
  constructor(private readonly invitations: StaffInvitationsService) {}

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  disable(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Ip() ip: string,
  ) {
    return this.invitations.disableAccount(userId, {
      ...requestMeta(request, ip),
      actorId: user.sub,
      actorRole: 'ADMIN',
    });
  }
}

@Controller('admin/auth/invitations')
export class StaffInvitationEnrollmentController {
  constructor(private readonly invitations: StaffInvitationsService) {}

  @Get(':token')
  @Public()
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  inspect(@Param('token') token: string) {
    return this.invitations.inspect(token);
  }

  @Post(':token/accept')
  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  accept(
    @Param('token') token: string,
    @Body() dto: AcceptStaffInvitationDto,
    @Req() request: Request,
    @Ip() ip: string,
  ) {
    return this.invitations.accept(token, dto, requestMeta(request, ip));
  }

  @Post(':token/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 8, ttl: 60000 } })
  verify(
    @Param('token') token: string,
    @Body() dto: VerifyStaffInvitationDto,
    @Req() request: Request,
    @Ip() ip: string,
  ) {
    return this.invitations.verify(token, dto.code, requestMeta(request, ip));
  }
}
