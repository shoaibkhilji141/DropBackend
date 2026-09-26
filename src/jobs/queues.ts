/** Queue names reserved for the monitoring and marketplace automation phase. */
export const QUEUE_PRICE_MONITORING = 'price-monitoring';
export const QUEUE_STOCK_MONITORING = 'stock-monitoring';
export const QUEUE_SHIPPING_MONITORING = 'shipping-monitoring';

export const ALL_QUEUES = [
  QUEUE_PRICE_MONITORING,
  QUEUE_STOCK_MONITORING,
  QUEUE_SHIPPING_MONITORING,
] as const;

export type QueueName = (typeof ALL_QUEUES)[number];
