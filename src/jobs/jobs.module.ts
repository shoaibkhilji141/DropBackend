import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isRedisEnabled, RedisConfig } from '../config/configuration';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { JobsController } from './jobs.controller';
import { MonitoringScheduler } from './monitoring-scheduler.service';
import {
  PriceMonitoringProcessor,
  ShippingMonitoringProcessor,
  StockMonitoringProcessor,
} from './monitoring.processor';
import { ALL_QUEUES } from './queues';

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 50,
};

/**
 * Registers BullMQ queues, workers and the 60s scheduler when Redis is enabled.
 */
@Module({})
export class JobsModule {
  static register(): DynamicModule {
    const redisEnabled = isRedisEnabled();

    if (!redisEnabled) {
      return { module: JobsModule };
    }

    return {
      module: JobsModule,
      imports: [
        MonitoringModule,
        BullModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            const redis = configService.get<RedisConfig>('redis') as RedisConfig;
            return {
              connection: {
                host: redis.host,
                port: redis.port,
                password: redis.password || undefined,
              },
              defaultJobOptions,
            };
          },
        }),
        ...ALL_QUEUES.map((name) => BullModule.registerQueue({ name })),
      ],
      controllers: [JobsController],
      providers: [
        MonitoringScheduler,
        PriceMonitoringProcessor,
        StockMonitoringProcessor,
        ShippingMonitoringProcessor,
      ],
      exports: [BullModule, MonitoringScheduler],
    };
  }
}
