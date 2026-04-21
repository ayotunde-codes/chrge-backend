import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  // Never throw — if no token or invalid token, just leave request.user undefined
  handleRequest<TUser>(_err: unknown, user: TUser): TUser {
    return user;
  }
}
