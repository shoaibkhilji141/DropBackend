import { Global, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisConfig } from '../config/configuration';

export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  enabled: boolean;
}

export class RedisClientHost implements OnModuleDestroy {
  constructor(private readonly client: Redis | null) {}

  get instance(): Redis | null {
    return this.client;
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => this.client?.disconnect());
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): RedisConnectionOptions => {
        const redis = configService.get<RedisConfig>('redis') as RedisConfig;
        if (!redis.enabled) {
          new Logger('RedisModule').log(
            'Redis is disabled (REDIS_ENABLED=false). Background queues will not start.',
          );
        } else {
          new Logger('RedisModule').log(
            `Redis enabled — queues will use ${redis.host}:${redis.port}.`,
          );
        }
        return {
          host: redis.host,
          port: redis.port,
          password: redis.password,
          enabled: redis.enabled,
        };
      },
    },
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService): Promise<RedisClientHost> => {
        const redis = configService.get<RedisConfig>('redis') as RedisConfig;
        if (!redis.enabled) return new RedisClientHost(null);

        const logger = new Logger('RedisModule');
        const client = new Redis({
          host: redis.host,
          port: redis.port,
          password: redis.password,
          maxRetriesPerRequest: 1,
          lazyConnect: true,
          enableOfflineQueue: false,
          retryStrategy: () => null,
        });
        client.on('error', (error) => {
          logger.warn(`Redis error: ${error.message}`);
        });

        try {
          await client.connect();
          const reply = await client.ping();
          logger.log(`Redis connected at ${redis.host}:${redis.port} (${reply})`);
          return new RedisClientHost(client);
        } catch (error) {
          logger.error(
            `Redis connection failed at ${redis.host}:${redis.port}: ${
              error instanceof Error ? error.message : error
            }. Continuing without queues.`,
          );
          client.disconnect();
          return new RedisClientHost(null);
        }
      },
    },
  ],
  exports: [REDIS_CONNECTION, REDIS_CLIENT],
})
export class RedisModule {}
