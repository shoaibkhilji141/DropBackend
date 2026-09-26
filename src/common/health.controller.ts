import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { Configuration } from '../config/configuration';
import { REDIS_CLIENT, RedisClientHost } from '../redis/redis.module';

export interface HealthResponse {
  status: 'ok';
  environment: string;
  integrations: {
    auth0: boolean;
    redis: boolean;
    openai: boolean;
    ebay: boolean;
    aliexpress: boolean;
  };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientHost,
  ) {}

  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const app = this.configService.get<Configuration['app']>('app');
    const redisConfig = this.configService.get<Configuration['redis']>('redis');
    return {
      status: 'ok',
      environment: app?.nodeEnv ?? 'development',
      integrations: {
        auth0: this.configService.get<Configuration['auth0']>('auth0')?.enabled ?? false,
        redis: Boolean(redisConfig?.enabled && (await this.redis.ping())),
        openai: this.configService.get<Configuration['openai']>('openai')?.configured ?? false,
        ebay: this.configService.get<Configuration['ebay']>('ebay')?.configured ?? false,
        aliexpress:
          this.configService.get<Configuration['aliexpress']>('aliexpress')?.configured ?? false,
      },
    };
  }
}
