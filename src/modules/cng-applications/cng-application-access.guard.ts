import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { SensitiveDataService } from './sensitive-data.service';

type CngApplicationRequest = Request & {
  user?: JwtPayload;
  cngApplication?: {
    id: string;
    userId: string | null;
    accessTokenHash: string;
  };
};

@Injectable()
export class CngApplicationAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sensitiveData: SensitiveDataService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CngApplicationRequest>();
    const idParam = request.params.id;
    const applicationId = Array.isArray(idParam) ? idParam[0] : idParam;

    const application = await this.prisma.cngApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, userId: true, accessTokenHash: true },
    });

    if (!application) {
      throw new NotFoundException('CNG application not found');
    }

    const user = request.user;
    const isStaff = user?.role === 'ADMIN' || user?.role === 'OPERATOR';
    const isOwner = Boolean(user?.sub && application.userId === user.sub);
    const header = request.headers['x-application-token'];
    const suppliedToken = Array.isArray(header) ? header[0] : header;
    const hasValidToken = Boolean(
      suppliedToken &&
      this.sensitiveData.matchesAccessToken(suppliedToken, application.accessTokenHash),
    );

    if (!isStaff && !isOwner && !hasValidToken) {
      throw new UnauthorizedException('A valid access token or application token is required');
    }

    request.cngApplication = application;
    return true;
  }
}
