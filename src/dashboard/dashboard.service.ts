import { Injectable } from '@nestjs/common';
import { Alert, ListingStatus, OrderStatus, ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface DashboardMetric {
  key: string;
  label: string;
  value: number;
  unit: 'count' | 'currency' | 'percent';
  changePercent?: number;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  profit: number;
}

export interface DashboardOverview {
  metrics: DashboardMetric[];
  revenueSeries: RevenuePoint[];
  productsByStatus: { status: ProductStatus; count: number }[];
  listingsByStatus: { status: ListingStatus; count: number }[];
  ordersByStatus: { status: OrderStatus; count: number }[];
  recentAlerts: Alert[];
}

const round = (value: number): number => Math.round(value * 100) / 100;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<DashboardOverview> {
    const [
      productsByStatus,
      listingsByStatus,
      ordersByStatus,
      orderTotals,
      profitTotals,
      recentAlerts,
      orders,
    ] = await Promise.all([
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

    const metrics: DashboardMetric[] = [
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

  /** Daily revenue for the last 14 days; profit is scaled by the overall margin. */
  private buildRevenueSeries(
    orders: { placedAt: Date; totalAmount: number }[],
    totalProfit: number,
    totalRevenue: number,
  ): RevenuePoint[] {
    const marginRatio = totalRevenue > 0 ? totalProfit / totalRevenue : 0;
    const days: RevenuePoint[] = [];
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
}
