import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StaffAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    const principal = request.user;
    if (
      principal.audience !== 'chrge-admin' ||
      principal.mfa !== true ||
      principal.environment !== this.config.get<string>('NODE_ENV', 'development')
    ) {
      throw new UnauthorizedException('Staff authentication required');
    }
    const staff = await this.prisma.staffProfile.findUnique({
      where: { userId: principal.sub },
      include: { role: true },
    });
    if (!staff || staff.status !== 'ACTIVE' || !staff.mfaEnabledAt) {
      throw new UnauthorizedException('Staff authentication required');
    }
    // Existing controller role metadata remains compatible while permissions move
    // to database-backed grants. The role is never trusted from consumer state.
    principal.role = staff.role.id;
    return true;
  }
}
