import { Injectable, NotFoundException } from '@nestjs/common';
import { FulfillmentStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ProfitService } from '../profit/profit.service';
import { ListOrdersQueryDto, UpdateOrderDto } from './dto/order.dto';
import { OrderRecord, OrderView } from './orders.types';

const ORDER_INCLUDE = {
  items: true,
  store: true,
  profitRecords: true,
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profit: ProfitService,
  ) {}

  async findAll(query: ListOrdersQueryDto): Promise<OrderView[]> {
    const orders = await this.prisma.order.findMany({
      where: {
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

  async summary(): Promise<{ status: OrderStatus; count: number }[]> {
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return grouped.map((row) => ({ status: row.status, count: row._count._all }));
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
