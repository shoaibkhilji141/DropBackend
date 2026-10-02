export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string;
}

export interface MarketplaceAccountInfo {
  displayName: string;
  email?: string;
  externalUserId?: string;
}

export interface MarketplaceListingInput {
  sku: string;
  title: string;
  description: string;
  images: string[];
  price: number;
  quantity: number;
  category?: string | null;
  categoryId?: string | null;
  /** Item specifics. eBay uses these for search relevance, so they matter. */
  aspects?: MarketplaceListingAspect[];
}

export interface MarketplaceListingAspect {
  name: string;
  values: string[];
}

export interface MarketplaceVariation {
  sku: string;
  /** Aspect values that make this variation unique, e.g. Colour: Red, Size: L. */
  aspects: MarketplaceListingAspect[];
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

/**
 * A single eBay listing that buyers pick a variation from. eBay models this as
 * one inventory item per SKU plus an inventory item group that ties them
 * together, so the publish step needs all SKUs up front.
 */
export interface MarketplaceVariationListingInput {
  groupKey: string;
  title: string;
  description: string;
  images: string[];
  category?: string | null;
  categoryId?: string | null;
  /** Aspects shared by every variation, e.g. Brand or Material. */
  aspects?: MarketplaceListingAspect[];
  /** Aspect names buyers choose between, in the order they should appear. */
  variesBy: string[];
  variations: MarketplaceVariation[];
}

export interface MarketplacePublishResult {
  listingId: string;
  offerId?: string;
  sku: string;
  inventoryItemGroupKey?: string;
}

export interface MarketplaceOrderItem {
  title: string;
  quantity: number;
  unitPrice: number;
  sku?: string;
  lineItemId?: string;
  legacyItemId?: string;
  imageUrl?: string;
}

export interface SellerListing {
  itemId: string;
  title: string;
  description: string;
  images: string[];
  price: number;
  currency: string;
  quantity: number;
  soldCount: number;
  sku?: string;
  category?: string;
  itemUrl: string;
}

export interface MarketplaceOrder {
  externalId: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerAddress?: string;
  buyerCity?: string;
  buyerCountry?: string;
  status: string;
  currency: string;
  totalAmount: number;
  placedAt: Date;
  shopName?: string;
  trackingCode?: string;
  trackingCarrier?: string;
  items: MarketplaceOrderItem[];
}

export interface MarketplaceConnectionView {
  platform: 'EBAY' | 'ALIEXPRESS';
  configured: boolean;
  connected: boolean;
  missing: string[];
  displayName?: string | null;
  accountEmail?: string | null;
  externalUserId?: string | null;
  authorizationStatus: 'not_configured' | 'ready' | 'connected' | 'error' | 'expired';
  lastError?: string | null;
  scopes?: string | null;
  expiresAt?: string | null;
  capabilities?: string[];
  dataSource?: 'live' | 'local';
}

export const MARKETPLACE_PROVIDER = Symbol('MARKETPLACE_PROVIDER');
