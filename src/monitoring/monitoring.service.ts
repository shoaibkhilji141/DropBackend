import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AlertSeverity,
  AlertType,
  MonitoringType,
  PriceHistory,
  Prisma,
  ShippingHistory,
  StockHistory,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  SUPPLIER_PRODUCT_PROVIDER,
  SupplierProduct,
  SupplierProductProvider,
} from '../integrations/aliexpress/aliexpress.types';
import {
  CreateMonitoringRuleDto,
  ListAlertsQueryDto,
  RunMonitoringDto,
  UpdateMonitoringRuleDto,
} from './dto/monitoring.dto';
import {
  AlertView,
  CheckResult,
  MonitoringRuleRecord,
  MonitoringRuleView,
  PriceSnapshot,
  ShippingSnapshot,
  StockSnapshot,
} from './monitoring.types';

const round = (value: number): number => Math.round(value * 100) / 100;

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SUPPLIER_PRODUCT_PROVIDER)
    private readonly supplier: SupplierProductProvider,
  ) {}

  async priceHistory(productId?: string): Promise<PriceHistory[]> {
    return this.prisma.priceHistory.findMany({
      where: productId ? { productId } : undefined,
      orderBy: { recordedAt: 'desc' },
      take: 200,
      include: { product: { select: { title: true } } },
    });
  }

  async stockHistory(productId?: string): Promise<StockHistory[]> {
    return this.prisma.stockHistory.findMany({
      where: productId ? { productId } : undefined,
      orderBy: { recordedAt: 'desc' },
      take: 200,
      include: { product: { select: { title: true } } },
    });
  }

  async shippingHistory(productId?: string): Promise<ShippingHistory[]> {
    return this.prisma.shippingHistory.findMany({
      where: productId ? { productId } : undefined,
      orderBy: { recordedAt: 'desc' },
      take: 200,
      include: { product: { select: { title: true } } },
    });
  }

  async alerts(query: ListAlertsQueryDto = {}): Promise<AlertView[]> {
    const rows = await this.prisma.alert.findMany({
      where: query.unreadOnly ? { readAt: null } : undefined,
      include: { product: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.toAlertView(row));
  }

  async markAlertRead(id: string): Promise<AlertView> {
    const existing = await this.prisma.alert.findUnique({
      where: { id },
      include: { product: { select: { id: true, title: true } } },
    });
    if (!existing) throw new NotFoundException(`Alert ${id} not found`);
    const row = await this.prisma.alert.update({
      where: { id },
      data: { readAt: existing.readAt ?? new Date() },
      include: { product: { select: { id: true, title: true } } },
    });
    return this.toAlertView(row);
  }

  async markAllAlertsRead(): Promise<{ count: number }> {
    const result = await this.prisma.alert.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }

  async rules(type?: MonitoringType): Promise<MonitoringRuleView[]> {
    const rows = await this.prisma.monitoringRule.findMany({
      where: type ? { type } : undefined,
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toRuleView(row));
  }

  async createRule(dto: CreateMonitoringRuleDto): Promise<MonitoringRuleView> {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException(`Product ${dto.productId} not found`);
    const intervalMinutes = dto.intervalMinutes ?? 15;
    const row = await this.prisma.monitoringRule.create({
      data: {
        productId: dto.productId,
        type: dto.type,
        threshold: dto.threshold,
        intervalMinutes,
        enabled: dto.enabled ?? true,
        nextRunAt: new Date(),
        lastStatus: 'IDLE',
      },
      include: { product: true },
    });
    return this.toRuleView(row);
  }

  async updateRule(id: string, dto: UpdateMonitoringRuleDto): Promise<MonitoringRuleView> {
    const rule = await this.prisma.monitoringRule.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!rule) throw new NotFoundException(`Monitoring rule ${id} not found`);

    const intervalMinutes = dto.intervalMinutes ?? rule.intervalMinutes;
    const enabled = dto.enabled ?? rule.enabled;
    const nextRunAt =
      dto.enabled === false
        ? rule.nextRunAt
        : dto.intervalMinutes !== undefined || dto.enabled === true
          ? new Date()
          : rule.nextRunAt;

    const row = await this.prisma.monitoringRule.update({
      where: { id },
      data: {
        threshold: dto.threshold,
        intervalMinutes,
        enabled,
        nextRunAt,
      },
      include: { product: true },
    });
    return this.toRuleView(row);
  }

  async priceSnapshots(): Promise<PriceSnapshot[]> {
    const rules = await this.loadRules(MonitoringType.PRICE);
    return Promise.all(
      rules.map(async (rule) => {
        const latest = await this.prisma.priceHistory.findFirst({
          where: { productId: rule.productId },
          orderBy: { recordedAt: 'desc' },
        });
        const current = latest?.price ?? rule.product.costPrice;
        const previous = latest?.previousPrice ?? null;
        const change = previous !== null ? round(current - previous) : null;
        return {
          productId: rule.productId,
          title: rule.product.title,
          enabled: rule.enabled,
          intervalMinutes: rule.intervalMinutes,
          lastChecked: rule.lastRunAt?.toISOString() ?? null,
          nextCheck: rule.nextRunAt?.toISOString() ?? null,
          lastError: rule.lastError,
          lastStatus: rule.lastStatus,
          currentPrice: current,
          previousPrice: previous,
          change,
          changePercent: previous && previous > 0 && change !== null ? round((change / previous) * 100) : null,
          currency: latest?.currency ?? rule.product.currency,
        };
      }),
    );
  }

  async stockSnapshots(): Promise<StockSnapshot[]> {
    const rules = await this.loadRules(MonitoringType.STOCK);
    return Promise.all(
      rules.map(async (rule) => {
        const latest = await this.prisma.stockHistory.findFirst({
          where: { productId: rule.productId },
          orderBy: { recordedAt: 'desc' },
        });
        const current = latest?.stock ?? rule.product.stock;
        const previous = latest?.previousStock ?? null;
        const threshold = rule.threshold ?? 5;
        const status =
          current <= 0 ? 'OUT_OF_STOCK' : current <= threshold ? 'LOW' : 'IN_STOCK';
        return {
          productId: rule.productId,
          title: rule.product.title,
          enabled: rule.enabled,
          intervalMinutes: rule.intervalMinutes,
          lastChecked: rule.lastRunAt?.toISOString() ?? null,
          nextCheck: rule.nextRunAt?.toISOString() ?? null,
          lastError: rule.lastError,
          lastStatus: rule.lastStatus,
          currentStock: current,
          previousStock: previous,
          change: previous !== null ? current - previous : null,
          status,
        };
      }),
    );
  }

  async shippingSnapshots(): Promise<ShippingSnapshot[]> {
    const rules = await this.loadRules(MonitoringType.SHIPPING);
    return Promise.all(
      rules.map(async (rule) => {
        const latest = await this.prisma.shippingHistory.findFirst({
          where: { productId: rule.productId },
          orderBy: { recordedAt: 'desc' },
        });
        const currentCost = latest?.cost ?? rule.product.shippingCost;
        const previousCost = latest?.previousCost ?? null;
        return {
          productId: rule.productId,
          title: rule.product.title,
          enabled: rule.enabled,
          intervalMinutes: rule.intervalMinutes,
          lastChecked: rule.lastRunAt?.toISOString() ?? null,
          nextCheck: rule.nextRunAt?.toISOString() ?? null,
          lastError: rule.lastError,
          lastStatus: rule.lastStatus,
          available: latest?.available ?? true,
          method: latest?.method ?? rule.product.shippingMethod,
          currentCost,
          previousCost,
          previousMethod: latest?.previousMethod ?? null,
          change: previousCost !== null ? round(currentCost - previousCost) : null,
        };
      }),
    );
  }

  async processDue(type: MonitoringType, options: RunMonitoringDto = {}): Promise<CheckResult[]> {
    const now = new Date();
    const rules = await this.prisma.monitoringRule.findMany({
      where: {
        type,
        enabled: true,
        ...(options.productId ? { productId: options.productId } : {}),
        ...(options.force ? {} : { OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] }),
      },
      include: { product: true },
    });

    const results: CheckResult[] = [];
    for (const rule of rules) {
      results.push(await this.checkRule(rule.id));
    }
    return results;
  }

  async checkRule(ruleId: string): Promise<CheckResult> {
    const rule = await this.prisma.monitoringRule.findUnique({
      where: { id: ruleId },
      include: { product: true },
    });
    if (!rule) throw new NotFoundException(`Monitoring rule ${ruleId} not found`);

    try {
      const live = await this.loadLiveProduct(rule);
      let result: CheckResult;
      if (rule.type === MonitoringType.PRICE) result = await this.checkPrice(rule, live);
      else if (rule.type === MonitoringType.STOCK) result = await this.checkStock(rule, live);
      else result = await this.checkShipping(rule, live);

      await this.markRuleSuccess(rule);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Monitoring check failed';
      this.logger.error(`Rule ${rule.id} (${rule.type}) failed: ${message}`);
      await this.markRuleFailure(rule, message);
      throw error;
    }
  }

  private async loadLiveProduct(rule: MonitoringRuleRecord): Promise<SupplierProduct> {
    if (!rule.product.externalId) {
      throw new Error(`Product ${rule.productId} has no supplier external id`);
    }
    const live = await this.supplier.getByExternalId(rule.product.externalId);
    if (!live) {
      throw new Error(`Supplier product ${rule.product.externalId} was not found`);
    }
    return live;
  }

  private async checkPrice(rule: MonitoringRuleRecord, live: SupplierProduct): Promise<CheckResult> {
    const previous = rule.product.costPrice;
    const current = live.costPrice;
    const change = round(current - previous);
    const changePercent = previous > 0 ? round((change / previous) * 100) : 0;
    const threshold = rule.threshold ?? 0;
    const significant = Math.abs(changePercent) >= threshold && change !== 0;

    await this.prisma.priceHistory.create({
      data: {
        productId: rule.productId,
        price: current,
        previousPrice: previous,
        currency: live.currency,
      },
    });
    await this.prisma.product.update({
      where: { id: rule.productId },
      data: { costPrice: current },
    });

    let alertsCreated = 0;
    if (significant) {
      const increased = change > 0;
      await this.createAlert({
        userId: rule.product.userId,
        productId: rule.productId,
        type: increased ? AlertType.PRICE_INCREASE : AlertType.PRICE_DECREASE,
        severity: increased ? AlertSeverity.WARNING : AlertSeverity.INFO,
        message: `Price ${increased ? 'increased' : 'decreased'} for "${rule.product.title}" from ${previous.toFixed(2)} to ${current.toFixed(2)} (${changePercent}%)`,
      });
      alertsCreated += 1;
    }

    return {
      ruleId: rule.id,
      type: rule.type,
      productId: rule.productId,
      changed: change !== 0,
      alertsCreated,
    };
  }

  private async checkStock(rule: MonitoringRuleRecord, live: SupplierProduct): Promise<CheckResult> {
    const previous = rule.product.stock;
    const current = live.stock;
    const change = current - previous;
    const threshold = rule.threshold ?? 0;

    await this.prisma.stockHistory.create({
      data: { productId: rule.productId, stock: current, previousStock: previous },
    });
    await this.prisma.product.update({
      where: { id: rule.productId },
      data: { stock: current },
    });

    let alertsCreated = 0;
    if (previous > 0 && current <= 0) {
      await this.createAlert({
        userId: rule.product.userId,
        productId: rule.productId,
        type: AlertType.OUT_OF_STOCK,
        severity: AlertSeverity.CRITICAL,
        message: `"${rule.product.title}" is out of stock`,
      });
      alertsCreated += 1;
    } else if (previous <= 0 && current > 0) {
      await this.createAlert({
        userId: rule.product.userId,
        productId: rule.productId,
        type: AlertType.BACK_IN_STOCK,
        severity: AlertSeverity.INFO,
        message: `"${rule.product.title}" is back in stock (${current} units)`,
      });
      alertsCreated += 1;
    } else if (change !== 0 && Math.abs(change) >= threshold) {
      await this.createAlert({
        userId: rule.product.userId,
        productId: rule.productId,
        type: AlertType.STOCK_CHANGE,
        severity: current <= (rule.threshold ?? 5) ? AlertSeverity.WARNING : AlertSeverity.INFO,
        message: `Stock changed for "${rule.product.title}" from ${previous} to ${current}`,
      });
      alertsCreated += 1;
    }

    return {
      ruleId: rule.id,
      type: rule.type,
      productId: rule.productId,
      changed: change !== 0,
      alertsCreated,
    };
  }

  private async checkShipping(rule: MonitoringRuleRecord, live: SupplierProduct): Promise<CheckResult> {
    const previousCost = rule.product.shippingCost;
    const previousMethod = rule.product.shippingMethod;
    const available = live.shippingOptions.length > 0;
    const option = live.shippingOptions[0];
    const currentCost = option?.cost ?? live.shippingCost;
    const currentMethod = option?.method ?? (available ? live.shippingOptions[0]?.method : 'Unavailable');
    const change = round(currentCost - previousCost);
    const changePercent = previousCost > 0 ? Math.abs(round((change / previousCost) * 100)) : 0;
    const threshold = rule.threshold ?? 0;

    await this.prisma.shippingHistory.create({
      data: {
        productId: rule.productId,
        method: currentMethod ?? 'Unavailable',
        cost: currentCost,
        etaDays: option ? option.etaDaysMax : live.shippingEtaDays,
        previousMethod,
        previousCost,
        available,
      },
    });
    await this.prisma.product.update({
      where: { id: rule.productId },
      data: {
        shippingCost: currentCost,
        shippingMethod: currentMethod,
        shippingEtaDays: option ? option.etaDaysMax : rule.product.shippingEtaDays,
      },
    });

    let alertsCreated = 0;
    if (!available) {
      await this.createAlert({
        userId: rule.product.userId,
        productId: rule.productId,
        type: AlertType.SHIPPING_UNAVAILABLE,
        severity: AlertSeverity.CRITICAL,
        message: `Shipping is unavailable for "${rule.product.title}"`,
      });
      alertsCreated += 1;
    } else if (change !== 0 && changePercent >= threshold) {
      await this.createAlert({
        userId: rule.product.userId,
        productId: rule.productId,
        type: AlertType.SHIPPING_COST_CHANGE,
        severity: AlertSeverity.WARNING,
        message: `Shipping cost changed for "${rule.product.title}" from ${previousCost.toFixed(2)} to ${currentCost.toFixed(2)}`,
      });
      alertsCreated += 1;
    } else if (previousMethod && currentMethod && previousMethod !== currentMethod) {
      await this.createAlert({
        userId: rule.product.userId,
        productId: rule.productId,
        type: AlertType.SHIPPING_CHANGE,
        severity: AlertSeverity.INFO,
        message: `Shipping method for "${rule.product.title}" changed to ${currentMethod}`,
      });
      alertsCreated += 1;
    }

    return {
      ruleId: rule.id,
      type: rule.type,
      productId: rule.productId,
      changed: !available || change !== 0 || previousMethod !== currentMethod,
      alertsCreated,
    };
  }

  private createAlert(data: {
    userId: string;
    productId: string;
    type: AlertType;
    severity: AlertSeverity;
    message: string;
  }) {
    return this.prisma.alert.create({ data });
  }

  private async markRuleSuccess(rule: MonitoringRuleRecord): Promise<void> {
    const nextRunAt = new Date(Date.now() + rule.intervalMinutes * 60 * 1000);
    await this.prisma.monitoringRule.update({
      where: { id: rule.id },
      data: {
        lastRunAt: new Date(),
        nextRunAt,
        lastError: null,
        lastStatus: 'SUCCESS',
      },
    });
  }

  private async markRuleFailure(rule: MonitoringRuleRecord, message: string): Promise<void> {
    const nextRunAt = new Date(Date.now() + rule.intervalMinutes * 60 * 1000);
    await this.prisma.monitoringRule.update({
      where: { id: rule.id },
      data: {
        lastRunAt: new Date(),
        nextRunAt,
        lastError: message.slice(0, 500),
        lastStatus: 'FAILED',
      },
    });
  }

  private loadRules(type: MonitoringType): Promise<MonitoringRuleRecord[]> {
    return this.prisma.monitoringRule.findMany({
      where: { type },
      include: { product: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private toRuleView(rule: MonitoringRuleRecord): MonitoringRuleView {
    return {
      id: rule.id,
      productId: rule.productId,
      type: rule.type,
      threshold: rule.threshold,
      intervalMinutes: rule.intervalMinutes,
      enabled: rule.enabled,
      lastRunAt: rule.lastRunAt?.toISOString() ?? null,
      nextRunAt: rule.nextRunAt?.toISOString() ?? null,
      lastError: rule.lastError,
      lastStatus: rule.lastStatus,
      product: rule.product ? { id: rule.product.id, title: rule.product.title } : null,
    };
  }

  private toAlertView(
    row: Prisma.AlertGetPayload<{ include: { product: { select: { id: true; title: true } } } }>,
  ): AlertView {
    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      message: row.message,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      product: row.product ? { id: row.product.id, title: row.product.title } : null,
    };
  }
}
