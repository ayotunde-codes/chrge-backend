import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

type CngApplicationRequest = Request & {
  user?: JwtPayload;
  cngApplication?: {
    id: string;
    userId: string;
  };
};

@Injectable()
export class CngApplicationAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CngApplicationRequest>();
    const idParam = request.params.id;
    const applicationId = Array.isArray(idParam) ? idParam[0] : idParam;

    const application = await this.prisma.cngApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, userId: true },
    });

    if (!application) {
      throw new NotFoundException('CNG application not found');
    }

    if (!request.user?.sub || application.userId !== request.user.sub) {
      throw new ForbiddenException('You do not have access to this CNG application');
    }

    request.cngApplication = application;
    return true;
  }
}
