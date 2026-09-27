import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma, ProfitType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CalculateProfitDto,
  ProfitBreakdownDto,
  ProfitCostOptionsDto,
  ProfitSettingsDto,
  UpdateProfitSettingsDto,
} from './dto/profit.dto';

export type ProfitRecordWithRefs = Prisma.ProfitRecordGetPayload<{
  include: {
    product: { select: { title: true } };
    order: { select: { id: true; externalId: true; buyerName: true; status: true } };
  };
}>;

const round = (value: number): number => Math.round(value * 100) / 100;

const FALLBACK_SETTINGS: ProfitSettingsDto = {
  marketplaceFeePercent: 12.9,
  paymentFeePercent: 2.9,
  fixedFee: 0.3,
  additionalCosts: 0,
  defaultMarkupMultiplier: 2.6,
  currency: 'GBP',
};

export interface ProductEstimate {
  suggestedSellPrice: number;
  breakdown: ProfitBreakdownDto;
}

/**
 * Single source of truth for pricing and profit maths. Fee defaults come from
 * the ProfitSetting row so marketplace values are configurable, not hard-coded
 * in callers or in React.
 */
@Injectable()
export class ProfitService implements OnModuleInit {
  private cachedSettings: ProfitSettingsDto = { ...FALLBACK_SETTINGS };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const current = await this.readSettings();
    if (current.currency === 'USD') {
      this.cachedSettings = await this.updateSettings({ currency: 'GBP' });
      return;
    }
    this.cachedSettings = current;
  }

  async getSettings(): Promise<ProfitSettingsDto> {
    this.cachedSettings = await this.readSettings();
    return { ...this.cachedSettings };
  }

  async updateSettings(dto: UpdateProfitSettingsDto): Promise<ProfitSettingsDto> {
    const current = await this.getSettings();
    const next = {
      marketplaceFeePercent: dto.marketplaceFeePercent ?? current.marketplaceFeePercent!,
      paymentFeePercent: dto.paymentFeePercent ?? current.paymentFeePercent!,
      fixedFee: dto.fixedFee ?? current.fixedFee!,
      additionalCosts: dto.additionalCosts ?? current.additionalCosts!,
      defaultMarkupMultiplier: dto.defaultMarkupMultiplier ?? current.defaultMarkupMultiplier,
      currency: dto.currency ?? current.currency,
    };
    await this.prisma.profitSetting.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...next },
      update: next,
    });
    this.cachedSettings = next;
    return { ...next };
  }

  private async readSettings(): Promise<ProfitSettingsDto> {
    const row = await this.prisma.profitSetting.findUnique({ where: { id: 'default' } });
    if (!row) return { ...FALLBACK_SETTINGS };
    return {
      marketplaceFeePercent: row.marketplaceFeePercent,
      paymentFeePercent: row.paymentFeePercent,
      fixedFee: row.fixedFee,
      additionalCosts: row.additionalCosts,
      defaultMarkupMultiplier: row.defaultMarkupMultiplier,
      currency: row.currency,
    };
  }

  async calculate(dto: CalculateProfitDto): Promise<ProfitBreakdownDto> {
    const settings = await this.getSettings();
    return this.breakdown(dto.sellPrice, dto.costPrice, dto.shippingCost ?? 0, dto, settings);
  }

  breakdown(
    sellPrice: number,
    productCost: number,
    shippingCost: number,
    options: ProfitCostOptionsDto = {},
    settings: ProfitSettingsDto = this.cachedSettings,
  ): ProfitBreakdownDto {
    const marketplaceFeePercent =
      options.marketplaceFeePercent ?? settings.marketplaceFeePercent ?? FALLBACK_SETTINGS.marketplaceFeePercent!;
    const paymentFeePercent =
      options.paymentFeePercent ?? settings.paymentFeePercent ?? FALLBACK_SETTINGS.paymentFeePercent!;
    const fixedFee = options.fixedFee ?? settings.fixedFee ?? FALLBACK_SETTINGS.fixedFee!;
    const additionalCosts =
      options.additionalCosts ?? settings.additionalCosts ?? FALLBACK_SETTINGS.additionalCosts!;

    const revenue = sellPrice;
    const fees =
      (revenue * marketplaceFeePercent) / 100 + (revenue * paymentFeePercent) / 100 + fixedFee;
    const totalCost = productCost + shippingCost + additionalCosts + fees;
    const profit = revenue - totalCost;

    return {
      sellPrice: round(sellPrice),
      revenue: round(revenue),
      productCost: round(productCost),
      shippingCost: round(shippingCost),
      additionalCosts: round(additionalCosts),
      fees: round(fees),
      totalCost: round(totalCost),
      profit: round(profit),
      margin: revenue > 0 ? round((profit / revenue) * 100) : 0,
      roi: totalCost > 0 ? round((profit / totalCost) * 100) : 0,
    };
  }

  suggestSellPrice(productCost: number, shippingCost: number, markup?: number): number {
    const multiplier = markup ?? this.cachedSettings.defaultMarkupMultiplier;
    const target = (productCost + shippingCost) * multiplier;
    return round(Math.max(0.99, Math.ceil(target) - 0.01));
  }

  estimate(
    productCost: number,
    shippingCost: number,
    sellPrice?: number,
    options: ProfitCostOptionsDto = {},
  ): ProductEstimate {
    const suggestedSellPrice = this.suggestSellPrice(productCost, shippingCost);
    const price = sellPrice && sellPrice > 0 ? sellPrice : suggestedSellPrice;
    return {
      suggestedSellPrice,
      breakdown: this.breakdown(price, productCost, shippingCost, options),
    };
  }

  history(type?: ProfitType): Promise<ProfitRecordWithRefs[]> {
    return this.prisma.profitRecord.findMany({
      where: type ? { type } : undefined,
      include: {
        product: { select: { title: true } },
        order: { select: { id: true, externalId: true, buyerName: true, status: true } },
      },
      orderBy: { recordedAt: 'desc' },
      take: 200,
    });
  }

  async totals(): Promise<{ type: ProfitType; profit: number; revenue: number }[]> {
    const grouped = await this.prisma.profitRecord.groupBy({
      by: ['type'],
      _sum: { profit: true, revenue: true },
    });
    return grouped.map((row) => ({
      type: row.type,
      profit: round(row._sum.profit ?? 0),
      revenue: round(row._sum.revenue ?? 0),
    }));
  }
}
