import { Prisma } from '@prisma/client';

/** Seeded development orders use ids like EB-20500. Live eBay order ids do not. */
export const liveOrderWhere = (): Prisma.OrderWhereInput => ({
  OR: [{ externalId: null }, { NOT: { externalId: { startsWith: 'EB-' } } }],
});

/** Seeded listings use ids like ebay-1000. Live item ids are numeric. */
export const liveListingWhere = (): Prisma.ListingWhereInput => ({
  OR: [{ externalId: null }, { NOT: { externalId: { startsWith: 'ebay-' } } }],
});

/** Seeded supplier products use ids like ae-100501. Live AliExpress ids are numeric. */
export const liveProductWhere = (): Prisma.ProductWhereInput => ({
  OR: [{ externalId: null }, { NOT: { externalId: { startsWith: 'ae-' } } }],
});
