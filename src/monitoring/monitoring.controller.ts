import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { MonitoringType, PriceHistory, ShippingHistory, StockHistory } from '@prisma/client';
import { RedisConfig } from '../config/configuration';
import { REDIS_CLIENT, RedisClientHost } from '../redis/redis.module';
import {
  CreateMonitoringRuleDto,
  ListAlertsQueryDto,
  RunMonitoringDto,
  UpdateMonitoringRuleDto,
} from './dto/monitoring.dto';
import { MonitoringService } from './monitoring.service';
import {
  AlertView,
  CheckResult,
  MonitoringOverview,
  MonitoringRuleView,
  PriceSnapshot,
  ShippingSnapshot,
  StockSnapshot,
} from './monitoring.types';

@ApiTags('monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientHost,
  ) {}

  @Get('overview')
  async overview(): Promise<MonitoringOverview> {
    const redis = this.configService.get<RedisConfig>('redis');
    const [rules, alerts] = await Promise.all([
      this.monitoringService.rules(),
      this.monitoringService.alerts(),
    ]);
    const lastChecked =
      rules
        .map((rule) => rule.lastRunAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    return {
      redisEnabled: redis?.enabled ?? false,
      redisConnected: await this.redis.ping(),
      rulesEnabled: rules.filter((rule) => rule.enabled).length,
      rulesTotal: rules.length,
      unreadAlerts: alerts.filter((alert) => !alert.readAt).length,
      lastChecked,
      failedRules: rules.filter((rule) => rule.lastStatus === 'FAILED').length,
      queues: [],
      recentAlerts: alerts.slice(0, 8),
    };
  }

  @Get('price')
  @ApiQuery({ name: 'productId', required: false })
  price(@Query('productId') productId?: string): Promise<PriceHistory[]> {
    return this.monitoringService.priceHistory(productId);
  }

  @Get('price/snapshots')
  priceSnapshots(): Promise<PriceSnapshot[]> {
    return this.monitoringService.priceSnapshots();
  }

  @Get('stock')
  @ApiQuery({ name: 'productId', required: false })
  stock(@Query('productId') productId?: string): Promise<StockHistory[]> {
    return this.monitoringService.stockHistory(productId);
  }

  @Get('stock/snapshots')
  stockSnapshots(): Promise<StockSnapshot[]> {
    return this.monitoringService.stockSnapshots();
  }

  @Get('shipping')
  @ApiQuery({ name: 'productId', required: false })
  shipping(@Query('productId') productId?: string): Promise<ShippingHistory[]> {
    return this.monitoringService.shippingHistory(productId);
  }

  @Get('shipping/snapshots')
  shippingSnapshots(): Promise<ShippingSnapshot[]> {
    return this.monitoringService.shippingSnapshots();
  }

  @Get('alerts')
  alerts(@Query() query: ListAlertsQueryDto): Promise<AlertView[]> {
    return this.monitoringService.alerts(query);
  }

  @Patch('alerts/:id/read')
  markRead(@Param('id') id: string): Promise<AlertView> {
    return this.monitoringService.markAlertRead(id);
  }

  @Post('alerts/read-all')
  markAllRead(): Promise<{ count: number }> {
    return this.monitoringService.markAllAlertsRead();
  }

  @Get('rules')
  @ApiQuery({ name: 'type', required: false, enum: MonitoringType })
  rules(@Query('type') type?: MonitoringType): Promise<MonitoringRuleView[]> {
    return this.monitoringService.rules(type);
  }

  @Post('rules')
  createRule(@Body() dto: CreateMonitoringRuleDto): Promise<MonitoringRuleView> {
    return this.monitoringService.createRule(dto);
  }

  @Patch('rules/:id')
  updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateMonitoringRuleDto,
  ): Promise<MonitoringRuleView> {
    return this.monitoringService.updateRule(id, dto);
  }

  @Post('run')
  run(@Body() dto: RunMonitoringDto): Promise<CheckResult[]> {
    if (dto.type) {
      return this.monitoringService.processDue(dto.type, dto);
    }
    return Promise.all([
      this.monitoringService.processDue(MonitoringType.PRICE, dto),
      this.monitoringService.processDue(MonitoringType.STOCK, dto),
      this.monitoringService.processDue(MonitoringType.SHIPPING, dto),
    ]).then((groups) => groups.flat());
  }
}
