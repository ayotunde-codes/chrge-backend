import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  services: {
    database: {
      status: 'up' | 'down';
      latencyMs?: number;
    };
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();

    // Check database connectivity
    let databaseStatus: 'up' | 'down' = 'down';
    let databaseLatency: number | undefined;

    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      databaseLatency = Date.now() - start;
      databaseStatus = 'up';
    } catch {
      databaseStatus = 'down';
    }

    const overallStatus = databaseStatus === 'up' ? 'ok' : 'error';

    return {
      status: overallStatus,
      timestamp,
      uptime,
      services: {
        database: {
          status: databaseStatus,
          latencyMs: databaseLatency,
        },
      },
    };
  }

  async liveness(): Promise<{ status: 'ok' }> {
    return { status: 'ok' };
  }

  async readiness(): Promise<{ status: 'ok' | 'not_ready' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      return { status: 'not_ready' };
    }
  }
}




