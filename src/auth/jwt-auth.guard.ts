import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { Auth0Config } from '../config/configuration';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Enforces Auth0 access tokens, but stays transparent while Auth0 credentials
 * are not configured so the foundation phase remains runnable locally.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private warned = false;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const auth0 = this.configService.get<Auth0Config>('auth0');

    if (!auth0?.enabled) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          'Auth0 is not configured (AUTH0_DOMAIN / AUTH0_AUDIENCE missing). API routes are open in local development.',
        );
      }
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return isPublic ? true : super.canActivate(context);
  }
}
