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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { Public } from '../../common/decorators/public.decorator';
import { StaffLoginDto, StaffMfaDto } from './dto/staff-auth.dto';
import { StaffAuthService } from './staff-auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { StaffAccessGuard } from '../../common/guards/staff-access.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class StaffAuthController {
  constructor(private readonly staffAuth: StaffAuthService) {}
  private meta(request: Request, ip: string) {
    return {
      ip,
      userAgent: request.get('user-agent'),
      requestId: request.get('x-request-id') ?? randomUUID(),
    };
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Validate staff credentials and issue an MFA challenge; never issues access directly',
  })
  login(@Body() dto: StaffLoginDto, @Req() request: Request, @Ip() ip: string) {
    return this.staffAuth.login(dto, this.meta(request, ip));
  }

  @Post('mfa/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 8, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify real TOTP and issue an admin-audience staff session' })
  verify(@Body() dto: StaffMfaDto, @Req() request: Request, @Ip() ip: string) {
    return this.staffAuth.verify(dto, this.meta(request, ip));
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  refresh(@Body('refreshToken') refreshToken: string, @Req() request: Request, @Ip() ip: string) {
    return this.staffAuth.refresh(refreshToken, this.meta(request, ip));
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard, StaffAccessGuard)
  sessions(@CurrentUser() user: JwtPayload) {
    return this.staffAuth.sessions(user.sub);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard, StaffAccessGuard)
  revoke(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
    @Ip() ip: string,
  ) {
    return this.staffAuth.revoke(user.sub, id, this.meta(request, ip));
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard, StaffAccessGuard)
  revokeAll(@CurrentUser() user: JwtPayload, @Req() request: Request, @Ip() ip: string) {
    return this.staffAuth.revoke(user.sub, undefined, this.meta(request, ip));
  }
}
