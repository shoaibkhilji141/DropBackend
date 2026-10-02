import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CacheModule } from './common/cache/cache.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HealthController } from './common/health.controller';
import { PrismaModule } from './common/prisma/prisma.module';
import { AppConfigModule } from './config/config.module';
import { AiModule } from './ai/ai.module';
import { ConnectionsModule } from './connections/connections.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ImporterModule } from './importer/importer.module';
import { JobsModule } from './jobs/jobs.module';
import { ListingsModule } from './listings/listings.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { ProfitModule } from './profit/profit.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'debug',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } },
        autoLogging: { ignore: (req) => req.url?.startsWith('/docs') ?? false },
      },
    }),
    PrismaModule,
    CacheModule,
    RedisModule,
    JobsModule.register(),
    AuthModule,
    UsersModule,
    ProductsModule,
    ImporterModule,
    AiModule,
    ListingsModule,
    OrdersModule,
    MonitoringModule,
    ProfitModule,
    ConnectionsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
