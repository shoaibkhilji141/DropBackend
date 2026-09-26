import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Auth0Config } from '../config/configuration';

export interface AuthenticatedUser {
  sub: string;
  email?: string;
  scope?: string;
}

/**
 * Validates Auth0-issued RS256 access tokens. Only registered when Auth0 is
 * configured (see AuthModule), so the app still boots without credentials.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    const auth0 = configService.get<Auth0Config>('auth0') as Auth0Config;

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${auth0.domain}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: auth0.audience,
      issuer: `https://${auth0.domain}/`,
      algorithms: ['RS256'],
    });
  }

  validate(payload: AuthenticatedUser): AuthenticatedUser {
    return payload;
  }
}
