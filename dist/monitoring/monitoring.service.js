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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../common/prisma/prisma.service");
const aliexpress_types_1 = require("../integrations/aliexpress/aliexpress.types");
const round = (value) => Math.round(value * 100) / 100;
let MonitoringService = MonitoringService_1 = class MonitoringService {
    prisma;
    supplier;
    logger = new common_1.Logger(MonitoringService_1.name);
    constructor(prisma, supplier) {
        this.prisma = prisma;
        this.supplier = supplier;
    }
    async priceHistory(productId) {
        return this.prisma.priceHistory.findMany({
            where: productId ? { productId } : undefined,
            orderBy: { recordedAt: 'desc' },
            take: 200,
            include: { product: { select: { title: true } } },
        });
    }
    async stockHistory(productId) {
        return this.prisma.stockHistory.findMany({
            where: productId ? { productId } : undefined,
            orderBy: { recordedAt: 'desc' },
            take: 200,
            include: { product: { select: { title: true } } },
        });
    }
    async shippingHistory(productId) {
        return this.prisma.shippingHistory.findMany({
            where: productId ? { productId } : undefined,
            orderBy: { recordedAt: 'desc' },
            take: 200,
            include: { product: { select: { title: true } } },
        });
    }
    async alerts(query = {}) {
        const rows = await this.prisma.alert.findMany({
            where: query.unreadOnly ? { readAt: null } : undefined,
            include: { product: { select: { id: true, title: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        return rows.map((row) => this.toAlertView(row));
    }
    async markAlertRead(id) {
        const existing = await this.prisma.alert.findUnique({
            where: { id },
            include: { product: { select: { id: true, title: true } } },
        });
        if (!existing)
            throw new common_1.NotFoundException(`Alert ${id} not found`);
        const row = await this.prisma.alert.update({
            where: { id },
            data: { readAt: existing.readAt ?? new Date() },
            include: { product: { select: { id: true, title: true } } },
        });
        return this.toAlertView(row);
    }
    async markAllAlertsRead() {
        const result = await this.prisma.alert.updateMany({
            where: { readAt: null },
            data: { readAt: new Date() },
        });
        return { count: result.count };
    }
    async rules(type) {
        const rows = await this.prisma.monitoringRule.findMany({
            where: type ? { type } : undefined,
            include: { product: true },
            orderBy: { createdAt: 'desc' },
        });
        return rows.map((row) => this.toRuleView(row));
    }
    async createRule(dto) {
        const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
        if (!product)
            throw new common_1.NotFoundException(`Product ${dto.productId} not found`);
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
    async updateRule(id, dto) {
        const rule = await this.prisma.monitoringRule.findUnique({
            where: { id },
            include: { product: true },
        });
        if (!rule)
            throw new common_1.NotFoundException(`Monitoring rule ${id} not found`);
        const intervalMinutes = dto.intervalMinutes ?? rule.intervalMinutes;
        const enabled = dto.enabled ?? rule.enabled;
        const nextRunAt = dto.enabled === false
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
    async priceSnapshots() {
        const rules = await this.loadRules(client_1.MonitoringType.PRICE);
        return Promise.all(rules.map(async (rule) => {
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
        }));
    }
    async stockSnapshots() {
        const rules = await this.loadRules(client_1.MonitoringType.STOCK);
        return Promise.all(rules.map(async (rule) => {
            const latest = await this.prisma.stockHistory.findFirst({
                where: { productId: rule.productId },
                orderBy: { recordedAt: 'desc' },
            });
            const current = latest?.stock ?? rule.product.stock;
            const previous = latest?.previousStock ?? null;
            const threshold = rule.threshold ?? 5;
            const status = current <= 0 ? 'OUT_OF_STOCK' : current <= threshold ? 'LOW' : 'IN_STOCK';
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
        }));
    }
    async shippingSnapshots() {
        const rules = await this.loadRules(client_1.MonitoringType.SHIPPING);
        return Promise.all(rules.map(async (rule) => {
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
        }));
    }
    async processDue(type, options = {}) {
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
        const results = [];
        for (const rule of rules) {
            results.push(await this.checkRule(rule.id));
        }
        return results;
    }
    async checkRule(ruleId) {
        const rule = await this.prisma.monitoringRule.findUnique({
            where: { id: ruleId },
            include: { product: true },
        });
        if (!rule)
            throw new common_1.NotFoundException(`Monitoring rule ${ruleId} not found`);
        try {
            const live = await this.loadLiveProduct(rule);
            let result;
            if (rule.type === client_1.MonitoringType.PRICE)
                result = await this.checkPrice(rule, live);
            else if (rule.type === client_1.MonitoringType.STOCK)
                result = await this.checkStock(rule, live);
            else
                result = await this.checkShipping(rule, live);
            await this.markRuleSuccess(rule);
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Monitoring check failed';
            this.logger.error(`Rule ${rule.id} (${rule.type}) failed: ${message}`);
            await this.markRuleFailure(rule, message);
            throw error;
        }
    }
    async loadLiveProduct(rule) {
        if (!rule.product.externalId) {
            throw new Error(`Product ${rule.productId} has no supplier external id`);
        }
        const live = await this.supplier.getByExternalId(rule.product.externalId);
        if (!live) {
            throw new Error(`Supplier product ${rule.product.externalId} was not found`);
        }
        return live;
    }
    async checkPrice(rule, live) {
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
                type: increased ? client_1.AlertType.PRICE_INCREASE : client_1.AlertType.PRICE_DECREASE,
                severity: increased ? client_1.AlertSeverity.WARNING : client_1.AlertSeverity.INFO,
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
    async checkStock(rule, live) {
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
                type: client_1.AlertType.OUT_OF_STOCK,
                severity: client_1.AlertSeverity.CRITICAL,
                message: `"${rule.product.title}" is out of stock`,
            });
            alertsCreated += 1;
        }
        else if (previous <= 0 && current > 0) {
            await this.createAlert({
                userId: rule.product.userId,
                productId: rule.productId,
                type: client_1.AlertType.BACK_IN_STOCK,
                severity: client_1.AlertSeverity.INFO,
                message: `"${rule.product.title}" is back in stock (${current} units)`,
            });
            alertsCreated += 1;
        }
        else if (change !== 0 && Math.abs(change) >= threshold) {
            await this.createAlert({
                userId: rule.product.userId,
                productId: rule.productId,
                type: client_1.AlertType.STOCK_CHANGE,
                severity: current <= (rule.threshold ?? 5) ? client_1.AlertSeverity.WARNING : client_1.AlertSeverity.INFO,
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
    async checkShipping(rule, live) {
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
                type: client_1.AlertType.SHIPPING_UNAVAILABLE,
                severity: client_1.AlertSeverity.CRITICAL,
                message: `Shipping is unavailable for "${rule.product.title}"`,
            });
            alertsCreated += 1;
        }
        else if (change !== 0 && changePercent >= threshold) {
            await this.createAlert({
                userId: rule.product.userId,
                productId: rule.productId,
                type: client_1.AlertType.SHIPPING_COST_CHANGE,
                severity: client_1.AlertSeverity.WARNING,
                message: `Shipping cost changed for "${rule.product.title}" from ${previousCost.toFixed(2)} to ${currentCost.toFixed(2)}`,
            });
            alertsCreated += 1;
        }
        else if (previousMethod && currentMethod && previousMethod !== currentMethod) {
            await this.createAlert({
                userId: rule.product.userId,
                productId: rule.productId,
                type: client_1.AlertType.SHIPPING_CHANGE,
                severity: client_1.AlertSeverity.INFO,
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
    createAlert(data) {
        return this.prisma.alert.create({ data });
    }
    async markRuleSuccess(rule) {
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
    async markRuleFailure(rule, message) {
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
    loadRules(type) {
        return this.prisma.monitoringRule.findMany({
            where: { type },
            include: { product: true },
            orderBy: { updatedAt: 'desc' },
        });
    }
    toRuleView(rule) {
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
    toAlertView(row) {
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
};
exports.MonitoringService = MonitoringService;
exports.MonitoringService = MonitoringService = MonitoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(aliexpress_types_1.SUPPLIER_PRODUCT_PROVIDER)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object])
], MonitoringService);
//# sourceMappingURL=monitoring.service.js.map