"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfitService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../common/prisma/prisma.service");
const round = (value) => Math.round(value * 100) / 100;
const FALLBACK_SETTINGS = {
    marketplaceFeePercent: 12.9,
    paymentFeePercent: 2.9,
    fixedFee: 0.3,
    additionalCosts: 0,
    defaultMarkupMultiplier: 2.6,
    currency: 'GBP',
};
let ProfitService = class ProfitService {
    prisma;
    cachedSettings = { ...FALLBACK_SETTINGS };
    constructor(prisma) {
        this.prisma = prisma;
    }
    async onModuleInit() {
        const current = await this.readSettings();
        if (current.currency === 'USD') {
            this.cachedSettings = await this.updateSettings({ currency: 'GBP' });
            return;
        }
        this.cachedSettings = current;
    }
    async getSettings() {
        this.cachedSettings = await this.readSettings();
        return { ...this.cachedSettings };
    }
    async updateSettings(dto) {
        const current = await this.getSettings();
        const next = {
            marketplaceFeePercent: dto.marketplaceFeePercent ?? current.marketplaceFeePercent,
            paymentFeePercent: dto.paymentFeePercent ?? current.paymentFeePercent,
            fixedFee: dto.fixedFee ?? current.fixedFee,
            additionalCosts: dto.additionalCosts ?? current.additionalCosts,
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
    async readSettings() {
        const row = await this.prisma.profitSetting.findUnique({ where: { id: 'default' } });
        if (!row)
            return { ...FALLBACK_SETTINGS };
        return {
            marketplaceFeePercent: row.marketplaceFeePercent,
            paymentFeePercent: row.paymentFeePercent,
            fixedFee: row.fixedFee,
            additionalCosts: row.additionalCosts,
            defaultMarkupMultiplier: row.defaultMarkupMultiplier,
            currency: row.currency,
        };
    }
    async calculate(dto) {
        const settings = await this.getSettings();
        return this.breakdown(dto.sellPrice, dto.costPrice, dto.shippingCost ?? 0, dto, settings);
    }
    breakdown(sellPrice, productCost, shippingCost, options = {}, settings = this.cachedSettings) {
        const marketplaceFeePercent = options.marketplaceFeePercent ?? settings.marketplaceFeePercent ?? FALLBACK_SETTINGS.marketplaceFeePercent;
        const paymentFeePercent = options.paymentFeePercent ?? settings.paymentFeePercent ?? FALLBACK_SETTINGS.paymentFeePercent;
        const fixedFee = options.fixedFee ?? settings.fixedFee ?? FALLBACK_SETTINGS.fixedFee;
        const additionalCosts = options.additionalCosts ?? settings.additionalCosts ?? FALLBACK_SETTINGS.additionalCosts;
        const revenue = sellPrice;
        const fees = (revenue * marketplaceFeePercent) / 100 + (revenue * paymentFeePercent) / 100 + fixedFee;
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
    suggestSellPrice(productCost, shippingCost, markup) {
        const multiplier = markup ?? this.cachedSettings.defaultMarkupMultiplier;
        const target = (productCost + shippingCost) * multiplier;
        return round(Math.max(0.99, Math.ceil(target) - 0.01));
    }
    estimate(productCost, shippingCost, sellPrice, options = {}) {
        const suggestedSellPrice = this.suggestSellPrice(productCost, shippingCost);
        const price = sellPrice && sellPrice > 0 ? sellPrice : suggestedSellPrice;
        return {
            suggestedSellPrice,
            breakdown: this.breakdown(price, productCost, shippingCost, options),
        };
    }
    history(type) {
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
    async totals() {
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
};
exports.ProfitService = ProfitService;
exports.ProfitService = ProfitService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProfitService);
//# sourceMappingURL=profit.service.js.map