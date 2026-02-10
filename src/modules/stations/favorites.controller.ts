import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StationsService } from './stations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { StationCardResponseDto } from './dto/station-response.dto';

@ApiTags('me')
@Controller('me/favorites')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class FavoritesController {
  constructor(private readonly stationsService: StationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user favorite stations' })
  @ApiResponse({ status: 200, type: [StationCardResponseDto] })
  async getMyFavorites(@CurrentUser() user: JwtPayload): Promise<StationCardResponseDto[]> {
    const favorites = await this.stationsService.getFavorites(user.sub);
    return favorites as unknown as StationCardResponseDto[];
  }
}




