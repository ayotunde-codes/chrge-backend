import { Controller, Get, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getProfile(@CurrentUser() user: JwtPayload): Promise<UserResponseDto> {
    const fullUser = await this.usersService.findById(user.sub);
    return this.mapToResponse(fullUser);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() updateDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const updatedUser = await this.usersService.update(user.sub, updateDto);
    return this.mapToResponse(updatedUser);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Delete current user account (soft delete)' })
  @ApiResponse({ status: 200, description: 'Account deleted successfully' })
  async deleteAccount(@CurrentUser() user: JwtPayload): Promise<{ message: string }> {
    await this.usersService.softDelete(user.sub);
    return { message: 'Account deleted successfully' };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID (public profile)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getUser(@Param('id') id: string): Promise<Partial<UserResponseDto>> {
    const user = await this.usersService.findById(id);
    // Return limited public profile
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
    };
  }

  private mapToResponse(user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    provider: string;
    emailVerified: boolean;
    role: string;
    createdAt: Date;
  }): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      provider: user.provider as UserResponseDto['provider'],
      emailVerified: user.emailVerified,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}




