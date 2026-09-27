import { Injectable, Logger } from '@nestjs/common';
import { Alert, ListingStatus, OrderStatus, Prisma, ProductStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../common/prisma/prisma.service';
import { liveListingWhere, liveOrderWhere, liveProductWhere } from '../common/demo-data';
import { AliExpressApiProvider } from '../integrations/aliexpress/aliexpress-api.provider';
import { EbayService } from '../integrations/ebay/ebay.service';
import { OrdersService } from '../orders/orders.service';
import { UsersService } from '../users/users.service';

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

export interface TopSeller {
  listingId: string;
  title: string;
  imageUrl: string | null;
  price: number;
  currency: string;
  soldCount: number;
  ebayUrl: string | null;
  sourceUrl: string | null;
}

export interface DashboardOverview {
  dataSource: 'live' | 'demo';
  syncError: string | null;
  metrics: DashboardMetric[];
  revenueSeries: RevenuePoint[];
  productsByStatus: { status: ProductStatus; count: number }[];
  listingsByStatus: { status: ListingStatus; count: number }[];
  ordersByStatus: { status: OrderStatus; count: number }[];
  topSellers: TopSeller[];
  recentAlerts: Alert[];
}

const round = (value: number): number => Math.round(value * 100) / 100;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly ebay: EbayService,
    private readonly aliexpress: AliExpressApiProvider,
    private readonly users: UsersService,
  ) {}

  async getOverview(identity?: AuthenticatedUser): Promise<DashboardOverview> {
    const user = await this.users.findCurrent(identity);
    const ebayConnected = await this.ebay.isConnected(user.id);
    const aliConnected = await this.aliexpress.hasLiveSession();
    const live = ebayConnected || aliConnected;
    let syncError: string | null = null;

    if (live) {
      try {
        const synced = await this.orders.syncShops(identity, false);
        syncError = [synced.listingError, synced.aliexpressError].filter(Boolean).join(' ') || null;
      } catch (error) {
        syncError = error instanceof Error ? error.message : 'Shop sync failed';
        this.logger.warn(syncError);
      }
    }

    const orderWhere: Prisma.OrderWhereInput = live ? liveOrderWhere() : {};
    const listingWhere: Prisma.ListingWhereInput = live ? liveListingWhere() : {};
    const productWhere: Prisma.ProductWhereInput = live ? liveProductWhere() : {};

    const [
      productsByStatus,
      listingsByStatus,
      ordersByStatus,
      orderTotals,
      profitTotals,
      recentAlerts,
      orders,
      topListings,
    ] = await Promise.all([
      this.prisma.product.groupBy({ by: ['status'], where: productWhere, _count: { _all: true } }),
      this.prisma.listing.groupBy({ by: ['status'], where: listingWhere, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['status'], where: orderWhere, _count: { _all: true } }),
      this.prisma.order.aggregate({ where: orderWhere, _sum: { totalAmount: true }, _count: { _all: true } }),
      this.prisma.profitRecord.aggregate({
        where: live ? { order: liveOrderWhere() } : {},
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
          currency: listing.product?.currency || 'USD',
          soldCount: listing.soldCount,
          ebayUrl: this.ebay.itemUrl(listing.externalId, listing.itemUrl),
          sourceUrl: listing.product?.sourceUrl ?? null,
        };
      }),
      recentAlerts,
    };
  }

  private parseImages(value: string | null, fallback?: string | null): string[] {
    if (value) {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) {
          const images = parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
          if (images.length > 0) return images;
        }
      } catch {
        // Ignore invalid JSON and use the fallback image.
      }
    }
    return fallback ? [fallback] : [];
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
