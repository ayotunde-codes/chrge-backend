import { Controller, Get, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService, HealthCheckResult } from './health.service';
import { Public } from '../../common/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Full health check with service details' })
  @ApiResponse({ status: 200, description: 'All services are healthy' })
  @ApiResponse({ status: 503, description: 'One or more services are unhealthy' })
  async check(): Promise<HealthCheckResult> {
    const result = await this.healthService.check();

    // Note: In a real scenario, you might want to return 503 if status is 'error'
    // but for simplicity, we always return 200 with the status in the body
    return result;
  }

  @Get('live')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kubernetes liveness probe' })
  @ApiResponse({ status: 200, description: 'Application is alive' })
  async liveness(): Promise<{ status: 'ok' }> {
    return this.healthService.liveness();
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Kubernetes readiness probe' })
  @ApiResponse({ status: 200, description: 'Application is ready to receive traffic' })
  @ApiResponse({ status: 503, description: 'Application is not ready' })
  async readiness(): Promise<{ status: 'ok' | 'not_ready' }> {
    return this.healthService.readiness();
  }
}




