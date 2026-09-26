import {
  AlertSeverity,
  AlertType,
  FulfillmentStatus,
  ListingStatus,
  MonitoringType,
  OrderStatus,
  Prisma,
  PrismaClient,
  ProductStatus,
  ProfitType,
} from '@prisma/client';
import { LOCAL_SUPPLIER_CATALOG } from '../src/integrations/aliexpress/local-catalog';

const prisma = new PrismaClient();

const daysAgo = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const round = (value: number): number => Math.round(value * 100) / 100;

/** Mirrors ProfitService.suggestSellPrice so seeded prices match the API. */
const suggestSellPrice = (costPrice: number, shippingCost: number): number =>
  round(Math.max(0.99, Math.ceil((costPrice + shippingCost) * 2.6) - 0.01));

/**
 * A subset of the supplier catalog is stored locally so Product Research still
 * has unsaved products to discover.
 */
const SEEDED_STATUSES: ProductStatus[] = [
  ProductStatus.LISTED,
  ProductStatus.LISTED,
  ProductStatus.IMPORTED,
  ProductStatus.IMPORTED,
  ProductStatus.IMPORTED,
  ProductStatus.SAVED,
  ProductStatus.SAVED,
  ProductStatus.SAVED,
];

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: 'seller@example.com' },
    create: { email: 'seller@example.com', name: 'Demo Seller' },
    update: {},
  });

  const store = await prisma.store.upsert({
    where: { id: 'store-ebay-demo' },
    create: {
      id: 'store-ebay-demo',
      userId: user.id,
      name: 'Demo eBay Store',
      platform: 'EBAY',
      status: 'DISCONNECTED',
    },
    update: {},
  });

  await prisma.profitSetting.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      marketplaceFeePercent: 12.9,
      paymentFeePercent: 2.9,
      fixedFee: 0.3,
      additionalCosts: 0,
      defaultMarkupMultiplier: 2.6,
      currency: 'USD',
    },
    update: {},
  });

  // Reset transactional development data so re-seeding stays idempotent.
  await prisma.profitRecord.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.product.deleteMany();

  const supplierIds = new Map<string, string>();
  for (const source of LOCAL_SUPPLIER_CATALOG) {
    if (supplierIds.has(source.supplier.externalId)) continue;
    const supplier = await prisma.supplier.upsert({
      where: { externalId: source.supplier.externalId },
      create: {
        externalId: source.supplier.externalId,
        name: source.supplier.name,
        score: source.supplier.score,
        platform: 'ALIEXPRESS',
      },
      update: { name: source.supplier.name, score: source.supplier.score },
    });
    supplierIds.set(source.supplier.externalId, supplier.id);
  }

  const seeded = LOCAL_SUPPLIER_CATALOG.slice(0, SEEDED_STATUSES.length);
  const products: Prisma.ProductGetPayload<{ include: { variants: true } }>[] = [];

  for (const [index, source] of seeded.entries()) {
    const status = SEEDED_STATUSES[index];
    const sellPrice = suggestSellPrice(source.costPrice, source.shippingCost);
    const standardShipping = source.shippingOptions[0];

    const product = await prisma.product.create({
      data: {
        userId: user.id,
        supplierId: supplierIds.get(source.supplier.externalId)!,
        externalId: source.externalId,
        title: source.title,
        description: source.description,
        imageUrl: source.images[0],
        images: JSON.stringify(source.images),
        sourceUrl: source.sourceUrl,
        category: source.category,
        currency: source.currency,
        costPrice: source.costPrice,
        shippingCost: source.shippingCost,
        sellPrice,
        stock: source.stock,
        rating: source.rating,
        ordersCount: source.orders,
        reviews: source.reviews,
        shippingMethod: standardShipping.method,
        shippingEtaDays: source.shippingEtaDays,
        status,
        importedAt: status === ProductStatus.SAVED ? null : daysAgo(index + 2),
        variants: {
          create: source.variants.map((variant) => ({
            externalId: variant.externalId,
            name: variant.name,
            attributes: variant.attributes,
            imageUrl: variant.imageUrl,
            costPrice: variant.costPrice,
            sellPrice: suggestSellPrice(variant.costPrice, source.shippingCost),
            stock: variant.stock,
          })),
        },
      },
      include: { variants: true },
    });
    products.push(product);

    for (let day = 13; day >= 0; day -= 1) {
      const drift = 1 + Math.sin(day / 3 + index) * 0.05;
      await prisma.priceHistory.create({
        data: {
          productId: product.id,
          price: round(source.costPrice * drift),
          currency: source.currency,
          recordedAt: daysAgo(day),
        },
      });
      await prisma.stockHistory.create({
        data: {
          productId: product.id,
          stock: Math.max(0, Math.round(source.stock * drift)),
          recordedAt: daysAgo(day),
        },
      });
    }

    await prisma.shippingHistory.create({
      data: {
        productId: product.id,
        method: standardShipping.method,
        cost: standardShipping.cost,
        etaDays: source.shippingEtaDays,
        recordedAt: daysAgo(3),
      },
    });

    await prisma.monitoringRule.create({
      data: {
        productId: product.id,
        type:
          index % 3 === 0
            ? MonitoringType.PRICE
            : index % 3 === 1
              ? MonitoringType.STOCK
              : MonitoringType.SHIPPING,
        threshold: 5,
        intervalMinutes: 5,
        enabled: index % 4 !== 0,
        lastRunAt: daysAgo(1),
        nextRunAt: new Date(),
        lastStatus: 'IDLE',
      },
    });
  }

  const listable = products.filter((product) => product.status !== ProductStatus.SAVED);

  const listingStatuses: ListingStatus[] = [
    ListingStatus.PUBLISHED,
    ListingStatus.PUBLISHED,
    ListingStatus.READY,
    ListingStatus.DRAFT,
    ListingStatus.PAUSED,
  ];

  const listings = [];
  for (const [index, product] of listable.entries()) {
    const status = listingStatuses[index] ?? ListingStatus.DRAFT;
    const published = status === ListingStatus.PUBLISHED || status === ListingStatus.PAUSED;
    const listing = await prisma.listing.create({
      data: {
        productId: product.id,
        storeId: store.id,
        externalId: published ? `ebay-${1000 + index}` : null,
        title: `${product.title} - Fast Shipping`.slice(0, 80),
        description: product.description,
        images: product.images,
        category: product.category,
        sku: product.variants.find((variant) => variant.sku)?.sku ?? product.externalId,
        price: product.sellPrice,
        quantity: Math.min(product.stock, 50),
        shippingMethod: product.shippingMethod,
        shippingCost: product.shippingCost,
        shippingEtaDays: product.shippingEtaDays,
        selectedVariantIds: JSON.stringify(product.variants.map((variant) => variant.id)),
        status,
        publishedAt: published ? daysAgo(10 - index) : null,
      },
    });
    listings.push(listing);
  }

  const orderStatuses = [
    OrderStatus.DELIVERED,
    OrderStatus.SHIPPED,
    OrderStatus.PAID,
    OrderStatus.PENDING,
    OrderStatus.CANCELLED,
  ];
  const fulfillmentByStatus: Record<OrderStatus, FulfillmentStatus> = {
    [OrderStatus.PENDING]: FulfillmentStatus.UNFULFILLED,
    [OrderStatus.PAID]: FulfillmentStatus.PROCESSING,
    [OrderStatus.FULFILLED]: FulfillmentStatus.PROCESSING,
    [OrderStatus.SHIPPED]: FulfillmentStatus.SHIPPED,
    [OrderStatus.DELIVERED]: FulfillmentStatus.DELIVERED,
    [OrderStatus.CANCELLED]: FulfillmentStatus.UNFULFILLED,
    [OrderStatus.REFUNDED]: FulfillmentStatus.UNFULFILLED,
  };
  const buyers = [
    { name: 'A. Wright', email: 'a.wright@example.com', address: '14 King Street', city: 'Manchester', country: 'GB' },
    { name: 'M. Haddad', email: 'm.haddad@example.com', address: '88 Corniche Road', city: 'Dubai', country: 'AE' },
    { name: 'S. Novak', email: 's.novak@example.com', address: '3 Wenceslas Square', city: 'Prague', country: 'CZ' },
    { name: 'L. Ferreira', email: 'l.ferreira@example.com', address: '210 Rua Augusta', city: 'Lisbon', country: 'PT' },
    { name: 'K. Tanaka', email: 'k.tanaka@example.com', address: '5-2 Shibuya', city: 'Tokyo', country: 'JP' },
    { name: 'R. Osei', email: 'r.osei@example.com', address: '19 Oxford Street', city: 'London', country: 'GB' },
  ];

  for (let index = 0; index < 12; index += 1) {
    const listing = listings[index % listings.length];
    const product = products.find((candidate) => candidate.id === listing.productId);
    if (!product) continue;

    const quantity = (index % 3) + 1;
    const revenue = round(listing.price * quantity);
    const cost = round(product.costPrice * quantity);
    const shippingCost = round(product.shippingCost * quantity);
    const fees = round(revenue * 0.129 + revenue * 0.029 + 0.3);
    const profit = round(revenue - cost - shippingCost - fees);
    const status = orderStatuses[index % orderStatuses.length];
    const buyer = buyers[index % buyers.length];
    const fulfillmentStatus = fulfillmentByStatus[status];

    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        externalId: `EB-${20500 + index}`,
        buyerName: buyer.name,
        buyerEmail: buyer.email,
        buyerAddress: buyer.address,
        buyerCity: buyer.city,
        buyerCountry: buyer.country,
        status,
        fulfillmentStatus,
        currency: 'USD',
        totalAmount: revenue,
        supplierCost: cost,
        shippingCost,
        trackingCode:
          fulfillmentStatus === FulfillmentStatus.SHIPPED ||
          fulfillmentStatus === FulfillmentStatus.DELIVERED
            ? `LP${100200300 + index}CN`
            : null,
        trackingCarrier:
          fulfillmentStatus === FulfillmentStatus.SHIPPED ||
          fulfillmentStatus === FulfillmentStatus.DELIVERED
            ? 'China Post'
            : null,
        shippedAt:
          fulfillmentStatus === FulfillmentStatus.SHIPPED ||
          fulfillmentStatus === FulfillmentStatus.DELIVERED
            ? daysAgo(Math.max(0, index - 2))
            : null,
        placedAt: daysAgo(index),
        items: {
          create: [
            {
              productId: product.id,
              listingId: listing.id,
              title: listing.title,
              quantity,
              unitPrice: listing.price,
              unitCost: product.costPrice,
            },
          ],
        },
      },
    });

    await prisma.profitRecord.create({
      data: {
        productId: product.id,
        orderId: order.id,
        type: status === OrderStatus.CANCELLED ? ProfitType.ESTIMATED : ProfitType.ACTUAL,
        revenue,
        cost,
        fees,
        shippingCost,
        profit,
        margin: revenue > 0 ? round((profit / revenue) * 100) : 0,
        recordedAt: daysAgo(index),
      },
    });
  }

  const outOfStock = products.find((product) => product.stock === 0) ?? products[products.length - 1];

  await prisma.alert.createMany({
    data: [
      {
        userId: user.id,
        productId: products[0].id,
        type: AlertType.PRICE_CHANGE,
        severity: AlertSeverity.WARNING,
        message: `Supplier cost increased by 6% for "${products[0].title}"`,
        createdAt: daysAgo(0),
      },
      {
        userId: user.id,
        productId: outOfStock.id,
        type: AlertType.STOCK_CHANGE,
        severity: AlertSeverity.CRITICAL,
        message: `"${outOfStock.title}" is running low at the supplier`,
        createdAt: daysAgo(1),
      },
      {
        userId: user.id,
        productId: products[3].id,
        type: AlertType.SHIPPING_CHANGE,
        severity: AlertSeverity.INFO,
        message: `Shipping time for "${products[3].title}" changed to 16 days`,
        createdAt: daysAgo(2),
      },
      {
        userId: user.id,
        type: AlertType.SYSTEM,
        severity: AlertSeverity.INFO,
        message: 'eBay and AliExpress connections are not configured yet',
        createdAt: daysAgo(3),
      },
    ],
  });

  await prisma.aIRequest.deleteMany();
  await prisma.aIRequest.create({
    data: {
      userId: user.id,
      type: 'TITLE',
      prompt: `Write an eBay title for: ${products[0].title}`,
      status: 'PENDING',
    },
  });

  console.log(
    `Seeded ${LOCAL_SUPPLIER_CATALOG.length} catalog products (${products.length} stored locally), ` +
      `${listings.length} listings and 12 orders for ${user.email}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
