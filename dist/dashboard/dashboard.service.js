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
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../common/prisma/prisma.service");
const round = (value) => Math.round(value * 100) / 100;
let DashboardService = class DashboardService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getOverview() {
        const [productsByStatus, listingsByStatus, ordersByStatus, orderTotals, profitTotals, recentAlerts, orders,] = await Promise.all([
            this.prisma.product.groupBy({ by: ['status'], _count: { _all: true } }),
            this.prisma.listing.groupBy({ by: ['status'], _count: { _all: true } }),
            this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
            this.prisma.order.aggregate({ _sum: { totalAmount: true }, _count: { _all: true } }),
            this.prisma.profitRecord.aggregate({ _sum: { profit: true } }),
            this.prisma.alert.findMany({ orderBy: { createdAt: 'desc' }, take: 6 }),
            this.prisma.order.findMany({
                select: { placedAt: true, totalAmount: true },
                orderBy: { placedAt: 'asc' },
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
            metrics,
            revenueSeries: this.buildRevenueSeries(orders, profit, revenue),
            productsByStatus: productsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
            listingsByStatus: listingsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
            ordersByStatus: ordersByStatus.map((r) => ({ status: r.status, count: r._count._all })),
            recentAlerts,
        };
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
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map