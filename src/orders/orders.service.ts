import { Injectable, NotFoundException } from '@nestjs/common';
import { FulfillmentStatus, OrderStatus, Platform, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { liveOrderWhere } from '../common/demo-data';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AliExpressApiProvider } from '../integrations/aliexpress/aliexpress-api.provider';
import { EbayService } from '../integrations/ebay/ebay.service';
import { MarketplaceOrder } from '../integrations/marketplace/marketplace.types';
import { ProfitService } from '../profit/profit.service';
import { UsersService } from '../users/users.service';
import { ListOrdersQueryDto, UpdateOrderDto } from './dto/order.dto';
import { OrderRecord, OrderView } from './orders.types';

const ORDER_INCLUDE = {
  items: true,
  store: true,
  profitRecords: true,
} satisfies Prisma.OrderInclude;

export interface ShopSyncResult {
  upserted: number;
  listings: number;
  aliexpressOrders: number;
  listingError: string | null;
  aliexpressError: string | null;
  skipped: boolean;
}

@Injectable()
export class OrdersService {
  private readonly syncedAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly profit: ProfitService,
    private readonly ebay: EbayService,
    private readonly aliexpress: AliExpressApiProvider,
    private readonly users: UsersService,
  ) {}

  async findAll(query: ListOrdersQueryDto, identity?: AuthenticatedUser): Promise<OrderView[]> {
    const user = await this.users.findCurrent(identity);
    const live =
      (await this.ebay.isConnected(user.id)) || (await this.aliexpress.hasLiveSession());
    const orders = await this.prisma.order.findMany({
      where: {
        ...(live ? liveOrderWhere() : {}),
        ...(query.channel ? { channel: query.channel } : {}),
        status: query.status,
        fulfillmentStatus: query.fulfillmentStatus,
        ...(query.search
          ? {
              OR: [
                { buyerName: { contains: query.search } },
                { buyerEmail: { contains: query.search } },
                { externalId: { contains: query.search } },
              ],
            }
          : {}),
      },
      include: ORDER_INCLUDE,
      orderBy: { placedAt: 'desc' },
    });
    return orders.map((order) => this.toView(order));
  }

  async findOne(id: string): Promise<OrderView> {
    return this.toView(await this.findRecord(id));
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderView> {
    const current = await this.findRecord(id);
    const nextStatus = dto.status ?? current.status;
    const fulfillmentStatus =
      dto.fulfillmentStatus ?? this.fulfillmentFromStatus(nextStatus, current.fulfillmentStatus);
    const shippedAt =
      fulfillmentStatus === FulfillmentStatus.SHIPPED ||
      fulfillmentStatus === FulfillmentStatus.DELIVERED
        ? (current.shippedAt ?? new Date())
        : current.shippedAt;

    const order = await this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        fulfillmentStatus,
        trackingCode: dto.trackingCode,
        trackingCarrier: dto.trackingCarrier,
        buyerName: dto.buyerName,
        buyerEmail: dto.buyerEmail,
        buyerAddress: dto.buyerAddress,
        buyerCity: dto.buyerCity,
        buyerCountry: dto.buyerCountry,
        shippedAt,
      },
      include: ORDER_INCLUDE,
    });

    return this.toView(order);
  }

  async syncFromEbay(identity?: AuthenticatedUser, force = true): Promise<ShopSyncResult> {
    return this.syncShops(identity, force);
  }

  async syncShops(identity?: AuthenticatedUser, force = false): Promise<ShopSyncResult> {
    const user = await this.users.findCurrent(identity);
    const last = this.syncedAt.get(user.id) ?? 0;
    if (!force && Date.now() - last < 90_000) {
      return {
        upserted: 0,
        listings: 0,
        aliexpressOrders: 0,
        listingError: null,
        aliexpressError: null,
        skipped: true,
      };
    }

    let listings = 0;
    let upserted = 0;
    let listingError: string | null = null;
    if (await this.ebay.isConnected(user.id)) {
      try {
        const ebay = await this.ebay.syncShop(user.id);
        listings = ebay.listings;
        upserted = ebay.orders;
        listingError = ebay.listingError;
      } catch (error) {
        listingError = error instanceof Error ? error.message : 'eBay sync failed';
      }
    }

    const aliexpress = await this.syncAliExpressOrders(user.id);
    this.syncedAt.set(user.id, Date.now());
    return {
      upserted,
      listings,
      aliexpressOrders: aliexpress.upserted,
      listingError,
      aliexpressError: aliexpress.error,
      skipped: false,
    };
  }

  async pushTracking(id: string, identity?: AuthenticatedUser): Promise<OrderView> {
    const user = await this.users.findCurrent(identity);
    try {
      await this.ebay.pushTracking(user.id, id);
      const order = await this.prisma.order.update({
        where: { id },
        data: { lastError: null },
        include: ORDER_INCLUDE,
      });
      return this.toView(order);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not push tracking to eBay';
      await this.prisma.order.update({ where: { id }, data: { lastError: message } });
      throw error;
    }
  }

  async summary(): Promise<{ status: OrderStatus; count: number }[]> {
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return grouped.map((row) => ({ status: row.status, count: row._count._all }));
  }

  private async syncAliExpressOrders(userId: string): Promise<{ upserted: number; error: string | null }> {
    if (!(await this.aliexpress.hasLiveSession())) {
      return { upserted: 0, error: null };
    }

    let remote: { orders: MarketplaceOrder[]; error?: string };
    try {
      remote = await this.aliexpress.listOrders();
    } catch (error) {
      return {
        upserted: 0,
        error: error instanceof Error ? error.message : 'AliExpress order sync failed',
      };
    }
    if (remote.error && remote.orders.length === 0) {
      return { upserted: 0, error: remote.error };
    }

    let store = await this.prisma.store.findFirst({
      where: { userId, platform: Platform.ALIEXPRESS },
    });
    if (!store) {
      store = await this.prisma.store.create({
        data: {
          userId,
          name: 'AliExpress',
          platform: Platform.ALIEXPRESS,
          status: 'CONNECTED',
        },
      });
    }

    let upserted = 0;
    for (const order of remote.orders) {
      if (!order.externalId) continue;
      const mapped = this.mapAliExpressStatus(order.status);
      const data = {
        storeId: store.id,
        channel: 'ALIEXPRESS',
        buyerName: order.shopName || order.buyerName || 'AliExpress shop',
        status: mapped.status,
        fulfillmentStatus: mapped.fulfillment,
        currency: order.currency || 'GBP',
        totalAmount: order.totalAmount,
        supplierCost: order.totalAmount,
        trackingCode: order.trackingCode,
        trackingCarrier: order.trackingCarrier,
        placedAt: order.placedAt,
        lastError: null,
      };
      const existing = await this.prisma.order.findFirst({
        where: { externalId: order.externalId, channel: 'ALIEXPRESS' },
      });
      const items = order.items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitPrice,
      }));
      if (existing) {
        await this.prisma.orderItem.deleteMany({ where: { orderId: existing.id } });
        await this.prisma.order.update({
          where: { id: existing.id },
          data: { ...data, items: { create: items } },
        });
      } else {
        await this.prisma.order.create({
          data: { ...data, externalId: order.externalId, items: { create: items } },
        });
      }
      upserted += 1;
    }

    return { upserted, error: remote.error ?? null };
  }

  private mapAliExpressStatus(status: string): {
    status: OrderStatus;
    fulfillment: FulfillmentStatus;
  } {
    const value = status.toUpperCase();
    if (value.includes('FINISH')) return { status: OrderStatus.DELIVERED, fulfillment: FulfillmentStatus.DELIVERED };
    if (value.includes('WAIT_BUYER_ACCEPT')) {
      return { status: OrderStatus.SHIPPED, fulfillment: FulfillmentStatus.SHIPPED };
    }
    if (value.includes('CANCEL') || value.includes('INVALID')) {
      return { status: OrderStatus.CANCELLED, fulfillment: FulfillmentStatus.UNFULFILLED };
    }
    if (value.includes('PLACE_ORDER')) {
      return { status: OrderStatus.PENDING, fulfillment: FulfillmentStatus.UNFULFILLED };
    }
    return { status: OrderStatus.PAID, fulfillment: FulfillmentStatus.PROCESSING };
  }

  private async findRecord(id: string): Promise<OrderRecord> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  private fulfillmentFromStatus(
    status: OrderStatus,
    current: FulfillmentStatus,
  ): FulfillmentStatus {
    if (status === OrderStatus.SHIPPED) return FulfillmentStatus.SHIPPED;
    if (status === OrderStatus.DELIVERED) return FulfillmentStatus.DELIVERED;
    if (status === OrderStatus.PAID || status === OrderStatus.FULFILLED) {
      return current === FulfillmentStatus.UNFULFILLED ? FulfillmentStatus.PROCESSING : current;
    }
    return current;
  }

  toView(order: OrderRecord): OrderView {
    const supplierCost =
      order.supplierCost ||
      order.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
    const estimate = this.profit.breakdown(order.totalAmount, supplierCost, order.shippingCost);

    return {
      id: order.id,
      externalId: order.externalId,
      channel: order.channel,
      shopName: order.channel === 'ALIEXPRESS' ? order.buyerName : (order.store?.name ?? null),
      buyerName: order.buyerName,
      buyer: {
        name: order.buyerName,
        email: order.buyerEmail,
        address: order.buyerAddress,
        city: order.buyerCity,
        country: order.buyerCountry,
      },
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      currency: order.currency,
      totalAmount: order.totalAmount,
      supplierCost,
      shippingCost: order.shippingCost,
      trackingCode: order.trackingCode,
      trackingCarrier: order.trackingCarrier,
      lastError: order.lastError,
      shippedAt: order.shippedAt?.toISOString() ?? null,
      placedAt: order.placedAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
        productId: item.productId,
        listingId: item.listingId,
      })),
      store: order.store ? { id: order.store.id, name: order.store.name } : null,
      estimate,
    };
  }
}
