import { FulfillmentStatus, OrderStatus, Prisma } from '@prisma/client';
import { ProfitBreakdownDto } from '../profit/dto/profit.dto';

export type OrderRecord = Prisma.OrderGetPayload<{
  include: { items: true; store: true; profitRecords: true };
}>;

export interface OrderBuyerView {
  name: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
}

export interface OrderItemView {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  productId: string | null;
  listingId: string | null;
}

export interface OrderView {
  id: string;
  externalId: string | null;
  channel: string;
  buyerName: string | null;
  buyer: OrderBuyerView;
  status: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  currency: string;
  totalAmount: number;
  supplierCost: number;
  shippingCost: number;
  trackingCode: string | null;
  trackingCarrier: string | null;
  lastError: string | null;
  shippedAt: string | null;
  placedAt: string;
  items: OrderItemView[];
  store: { id: string; name: string } | null;
  estimate: ProfitBreakdownDto;
}
