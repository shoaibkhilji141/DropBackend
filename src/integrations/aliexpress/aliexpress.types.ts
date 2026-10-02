export interface SupplierProductVariant {
  externalId: string;
  name: string;
  attributes: string;
  costPrice: number;
  stock: number;
  imageUrl?: string;
}

export interface SupplierShippingOption {
  method: string;
  cost: number;
  etaDaysMin: number;
  etaDaysMax: number;
  trackingAvailable: boolean;
}

export interface SupplierRef {
  externalId: string;
  name: string;
  /** Supplier reputation score reported by the source marketplace, 0-100. */
  score: number;
}

export interface SupplierProduct {
  externalId: string;
  title: string;
  description: string;
  images: string[];
  sourceUrl: string;
  currency: string;
  costPrice: number;
  shippingCost: number;
  stock: number;
  rating: number;
  reviews: number;
  orders: number;
  category: string;
  shippingEtaDays: number;
  shippingOptions: SupplierShippingOption[];
  supplier: SupplierRef;
  variants: SupplierProductVariant[];
  specs?: { name: string; value: string }[];
}

export type SupplierSortOption =
  | 'relevance'
  | 'costAsc'
  | 'costDesc'
  | 'ratingDesc'
  | 'ordersDesc';

export interface SupplierSearchQuery {
  search?: string;
  /** eBay / supplier image URL used for visual match when the live API supports it. */
  imageUrl?: string;
  category?: string;
  supplier?: string;
  minCostPrice?: number;
  maxCostPrice?: number;
  minRating?: number;
  minOrders?: number;
  inStockOnly?: boolean;
  sort?: SupplierSortOption;
  page?: number;
  pageSize?: number;
}

export interface SupplierFacet {
  value: string;
  count: number;
}

export interface SupplierSearchResult {
  items: SupplierProduct[];
  total?: number;
  page?: number;
  pageSize?: number;
  /** Facets are calculated on the full match set, before pagination. */
  facets: {
    categories: SupplierFacet[];
    suppliers: SupplierFacet[];
  };
}

/**
 * Contract every supplier data source must satisfy.
 *
 *   SupplierProductProvider
 *       ↓
 *   LocalAliExpressProvider   (current, local development catalog)
 *       ↓
 *   AliExpressApiProvider     (added once credentials exist)
 *
 * Filters that depend on profit (selling price, profit, margin) are applied by
 * the products module after the provider returns, because they are derived from
 * our own pricing rules rather than supplier data.
 */
export interface SupplierProductProvider {
  readonly name: string;
  isConfigured(): boolean;
  search(query: SupplierSearchQuery): Promise<SupplierSearchResult>;
  getByExternalId(externalId: string): Promise<SupplierProduct | null>;
}

export const SUPPLIER_PRODUCT_PROVIDER = Symbol('SUPPLIER_PRODUCT_PROVIDER');
