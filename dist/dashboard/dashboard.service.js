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
var DashboardService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../common/prisma/prisma.service");
const demo_data_1 = require("../common/demo-data");
const aliexpress_api_provider_1 = require("../integrations/aliexpress/aliexpress-api.provider");
const ebay_service_1 = require("../integrations/ebay/ebay.service");
const orders_service_1 = require("../orders/orders.service");
const users_service_1 = require("../users/users.service");
const round = (value) => Math.round(value * 100) / 100;
let DashboardService = DashboardService_1 = class DashboardService {
    prisma;
    orders;
    ebay;
    aliexpress;
    users;
    logger = new common_1.Logger(DashboardService_1.name);
    constructor(prisma, orders, ebay, aliexpress, users) {
        this.prisma = prisma;
        this.orders = orders;
        this.ebay = ebay;
        this.aliexpress = aliexpress;
        this.users = users;
    }
    async getOverview(identity) {
        const user = await this.users.findCurrent(identity);
        const ebayConnected = await this.ebay.isConnected(user.id);
        const aliConnected = await this.aliexpress.hasLiveSession();
        const live = ebayConnected || aliConnected;
        let syncError = null;
        if (live) {
            try {
                const synced = await this.orders.syncShops(identity, false);
                syncError = [synced.listingError, synced.aliexpressError].filter(Boolean).join(' ') || null;
            }
            catch (error) {
                syncError = error instanceof Error ? error.message : 'Shop sync failed';
                this.logger.warn(syncError);
            }
        }
        const orderWhere = live ? (0, demo_data_1.liveOrderWhere)() : {};
        const listingWhere = live ? (0, demo_data_1.liveListingWhere)() : {};
        const productWhere = live ? (0, demo_data_1.liveProductWhere)() : {};
        const [productsByStatus, listingsByStatus, ordersByStatus, orderTotals, profitTotals, recentAlerts, orders, topListings,] = await Promise.all([
            this.prisma.product.groupBy({ by: ['status'], where: productWhere, _count: { _all: true } }),
            this.prisma.listing.groupBy({ by: ['status'], where: listingWhere, _count: { _all: true } }),
            this.prisma.order.groupBy({ by: ['status'], where: orderWhere, _count: { _all: true } }),
            this.prisma.order.aggregate({ where: orderWhere, _sum: { totalAmount: true }, _count: { _all: true } }),
            this.prisma.profitRecord.aggregate({
                where: live ? { order: (0, demo_data_1.liveOrderWhere)() } : {},
                _sum: { profit: true },
            }),
            this.prisma.alert.findMany({ orderBy: { createdAt: 'desc' }, take: 6 }),
            this.prisma.order.findMany({
                where: orderWhere,
                select: { placedAt: true, totalAmount: true },
                orderBy: { placedAt: 'asc' },
            }),
            this.prisma.listing.findMany({
                where: {
                    ...listingWhere,
                    status: 'PUBLISHED',
                },
                include: { product: true },
                orderBy: [{ soldCount: 'desc' }, { updatedAt: 'desc' }],
                take: 8,
            }),
        ]);
        const revenue = round(orderTotals._sum.totalAmount ?? 0);
        const profit = round(profitTotals._sum.profit ?? 0);
        const metrics = [
            {
                key: 'revenue',
                label: 'Revenue',
                value: revenue,
                unit: 'currency',
            },
            {
                key: 'profit',
                label: 'Profit',
                value: profit,
                unit: 'currency',
            },
            {
                key: 'orders',
                label: 'Orders',
                value: orderTotals._count._all,
                unit: 'count',
            },
            {
                key: 'margin',
                label: 'Average margin',
                value: revenue > 0 ? round((profit / revenue) * 100) : 0,
                unit: 'percent',
            },
        ];
        return {
            dataSource: live ? 'live' : 'demo',
            syncError,
            metrics,
            revenueSeries: this.buildRevenueSeries(orders, profit, revenue),
            productsByStatus: productsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
            listingsByStatus: listingsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
            ordersByStatus: ordersByStatus.map((r) => ({ status: r.status, count: r._count._all })),
            topSellers: topListings.map((listing) => {
                const images = this.parseImages(listing.images, listing.product?.imageUrl);
                return {
                    listingId: listing.id,
                    title: listing.title,
                    imageUrl: images[0] ?? null,
                    price: listing.price,
                    currency: listing.product?.currency || 'GBP',
                    soldCount: listing.soldCount,
                    ebayUrl: this.ebay.itemUrl(listing.externalId, listing.itemUrl),
                    sourceUrl: listing.product?.sourceUrl ?? null,
                };
            }),
            recentAlerts,
        };
    }
    parseImages(value, fallback) {
        if (value) {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) {
                    const images = parsed.filter((item) => typeof item === 'string' && item.length > 0);
                    if (images.length > 0)
                        return images;
                }
            }
            catch {
            }
        }
        return fallback ? [fallback] : [];
    }
    buildRevenueSeries(orders, totalProfit, totalRevenue) {
        const marginRatio = totalRevenue > 0 ? totalProfit / totalRevenue : 0;
        const days = [];
        const today = new Date();
        for (let offset = 13; offset >= 0; offset -= 1) {
            const day = new Date(today);
            day.setDate(today.getDate() - offset);
            const key = day.toISOString().slice(0, 10);
            const dayRevenue = orders
                .filter((order) => order.placedAt.toISOString().slice(0, 10) === key)
                .reduce((sum, order) => sum + order.totalAmount, 0);
            days.push({
                date: key,
                revenue: round(dayRevenue),
                profit: round(dayRevenue * marginRatio),
            });
        }
        return days;
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = DashboardService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        orders_service_1.OrdersService,
        ebay_service_1.EbayService,
        aliexpress_api_provider_1.AliExpressApiProvider,
        users_service_1.UsersService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map