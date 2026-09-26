import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Auth0Config } from '../config/configuration';
import { Public } from './public.decorator';

class AuthConfigResponse {
  enabled: boolean;
  domain: string;
  clientId: string;
  audience: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Public Auth0 settings the SPA needs. Client secrets are never returned.
   */
  @Public()
  @Get('config')
  @ApiOkResponse({ type: AuthConfigResponse })
  getConfig(): AuthConfigResponse {
    const auth0 = this.configService.get<Auth0Config>('auth0') as Auth0Config;
    return {
      enabled: auth0.enabled,
      domain: auth0.domain,
      clientId: auth0.clientId,
      audience: auth0.audience,
    };
  }
}
