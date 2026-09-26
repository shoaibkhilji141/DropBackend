import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { Auth0Config } from '../config/configuration';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';

/**
 * The JWT strategy is only instantiated when Auth0 credentials exist, otherwise
 * passport would fail at bootstrap because the JWKS URI is incomplete.
 */
const jwtStrategyProvider: Provider = {
  provide: JwtStrategy,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const auth0 = configService.get<Auth0Config>('auth0');
    return auth0?.enabled ? new JwtStrategy(configService) : null;
  },
};

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt', session: false })],
  controllers: [AuthController],
  providers: [jwtStrategyProvider, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
