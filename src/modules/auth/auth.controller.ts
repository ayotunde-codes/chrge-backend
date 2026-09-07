import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Ip,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response, CookieOptions } from 'express';
import { ConfigService } from '@nestjs/config';

import { AuthService, AuthServiceResult } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly refreshCookieName = 'chrge_refresh';

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private get refreshCookieOptions(): CookieOptions {
    const expiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION', '30d');
    const days = Number.parseInt(expiration.replace('d', ''), 10) || 30;

    return {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: days * 24 * 60 * 60 * 1000,
    };
  }

  private sendAuthResult(result: AuthServiceResult, response: Response): AuthResponseDto {
    const { refreshToken, ...body } = result;
    response.cookie(this.refreshCookieName, refreshToken, this.refreshCookieOptions);
    return body;
  }

  private getRefreshToken(request: Request, bodyToken?: string): string {
    const cookieToken = request.cookies?.[this.refreshCookieName] as string | undefined;
    const refreshToken = cookieToken || bodyToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh session is missing');
    }
    return refreshToken;
  }

  @Post('register')
  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new user with email and password' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'User registered successfully', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(
    @Body() registerDto: RegisterDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const userAgent = req.get('user-agent');
    const result = await this.authService.register(registerDto, { userAgent, ip });
    return this.sendAuthResult(result, response);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login successful', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const userAgent = req.get('user-agent');
    const result = await this.authService.login(loginDto, { userAgent, ip });
    return this.sendAuthResult(result, response);
  }

  @Post('google')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Login or register with Google ID token' })
  @ApiBody({ type: GoogleLoginDto })
  @ApiResponse({ status: 200, description: 'Google login successful', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid Google token' })
  async googleLogin(
    @Body() googleLoginDto: GoogleLoginDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const userAgent = req.get('user-agent');
    const result = await this.authService.googleLogin(googleLoginDto, { userAgent, ip });
    return this.sendAuthResult(result, response);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const userAgent = req.get('user-agent');
    const refreshToken = this.getRefreshToken(req, refreshTokenDto.refreshToken);
    const result = await this.authService.refreshTokens(refreshToken, { userAgent, ip });
    return this.sendAuthResult(result, response);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiBody({ type: LogoutDto })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(
    @Body() logoutDto: LogoutDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    const cookieToken = request.cookies?.[this.refreshCookieName] as string | undefined;
    await this.authService.logout(user.sub, {
      ...logoutDto,
      refreshToken: logoutDto.refreshToken || cookieToken,
    });
    response.clearCookie(this.refreshCookieName, this.refreshCookieOptions);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile', type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async me(@CurrentUser() user: JwtPayload): Promise<UserResponseDto> {
    return this.authService.getCurrentUser(user.sub);
  }
}
