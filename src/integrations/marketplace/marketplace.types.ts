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
}

export interface MarketplacePublishResult {
  listingId: string;
  offerId?: string;
  sku: string;
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
