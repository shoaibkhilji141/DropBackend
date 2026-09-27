import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EbayConfig } from '../../config/configuration';
import {
  MarketplaceAccountInfo,
  MarketplaceListingInput,
  MarketplaceOrder,
  MarketplacePublishResult,
  OAuthTokenSet,
  SellerListing,
} from '../marketplace/marketplace.types';

interface EbayErrorBody {
  error?: string;
  error_description?: string;
  errors?: { message?: string; longMessage?: string }[];
}

const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
];

@Injectable()
export class EbayRestClient {
  private readonly logger = new Logger(EbayRestClient.name);

  constructor(private readonly configService: ConfigService) {}

  private config(): EbayConfig {
    return this.configService.get<EbayConfig>('ebay') as EbayConfig;
  }

  private currency(): string {
    return this.config().marketplaceId === 'EBAY_GB' ? 'GBP' : 'USD';
  }

  private hosts() {
    const sandbox = this.config().environment === 'sandbox';
    return {
      auth: sandbox ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com',
      api: sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com',
      identity: sandbox ? 'https://apiz.sandbox.ebay.com' : 'https://apiz.ebay.com',
    };
  }

  scopes(): string[] {
    return EBAY_SCOPES;
  }

  authorizationUrl(state: string): string {
    const ebay = this.config();
    const params = new URLSearchParams({
      client_id: ebay.appId,
      response_type: 'code',
      redirect_uri: ebay.ruName,
      scope: EBAY_SCOPES.join(' '),
      state,
    });
    return `${this.hosts().auth}/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokenSet> {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config().ruName,
    });
  }

  async refresh(refreshToken: string): Promise<OAuthTokenSet> {
    return this.tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: EBAY_SCOPES.join(' '),
    });
  }

  async getAccountInfo(accessToken: string): Promise<MarketplaceAccountInfo> {
    try {
      const user = await this.request<Record<string, unknown>>(
        'GET',
        `${this.hosts().identity}/commerce/identity/v1/user/`,
        accessToken,
      );
      const username = typeof user.username === 'string' ? user.username : undefined;
      const userId = typeof user.userId === 'string' ? user.userId : undefined;
      const email =
        user.individualAccount && typeof user.individualAccount === 'object'
          ? String((user.individualAccount as { email?: string }).email ?? '')
          : undefined;
      return {
        displayName: username ?? 'eBay seller',
        email: email || undefined,
        externalUserId: userId,
      };
    } catch {
      return { displayName: 'eBay seller' };
    }
  }

  async publishListing(accessToken: string, input: MarketplaceListingInput): Promise<MarketplacePublishResult> {
    const ebay = this.config();
    const sku = this.sanitizeSku(input.sku);
    await this.ensureLocation(accessToken);
    const policies = await this.loadPolicies(accessToken);
    const categoryId = await this.resolveCategoryId(accessToken, input.category ?? input.title);

    await this.request(
      'PUT',
      `${this.hosts().api}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      accessToken,
      {
        availability: { shipToLocationAvailability: { quantity: Math.max(input.quantity, 0) } },
        condition: 'NEW',
        product: {
          title: input.title.slice(0, 80),
          description: input.description || input.title,
          imageUrls: input.images.filter((url) => url.startsWith('https://')).slice(0, 12),
        },
      },
    );

    const existing = await this.request<{ offers?: { offerId?: string }[] }>(
      'GET',
      `${this.hosts().api}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`,
      accessToken,
    ).catch(() => ({ offers: [] }));

    let offerId = existing.offers?.[0]?.offerId;
    const offerBody = {
      sku,
      marketplaceId: ebay.marketplaceId,
      format: 'FIXED_PRICE',
      availableQuantity: Math.max(input.quantity, 0),
      categoryId,
      listingDescription: input.description || input.title,
      listingPolicies: {
        fulfillmentPolicyId: policies.fulfillmentPolicyId,
        paymentPolicyId: policies.paymentPolicyId,
        returnPolicyId: policies.returnPolicyId,
      },
      merchantLocationKey: 'elbaflabs-default',
      pricingSummary: { price: { currency: this.currency(), value: input.price.toFixed(2) } },
    };

    if (offerId) {
      await this.request(
        'PUT',
        `${this.hosts().api}/sell/inventory/v1/offer/${offerId}`,
        accessToken,
        offerBody,
      );
    } else {
      const created = await this.request<{ offerId?: string }>(
        'POST',
        `${this.hosts().api}/sell/inventory/v1/offer`,
        accessToken,
        offerBody,
      );
      offerId = created.offerId;
    }

    if (!offerId) {
      throw new Error('eBay createOffer did not return an offerId.');
    }

    const published = await this.request<{ listingId?: string }>(
      'POST',
      `${this.hosts().api}/sell/inventory/v1/offer/${offerId}/publish`,
      accessToken,
    );

    if (!published.listingId) {
      throw new Error('eBay publishOffer did not return a listingId.');
    }

    return { listingId: published.listingId, offerId, sku };
  }

  async updatePriceQuantity(accessToken: string, sku: string, price: number, quantity: number): Promise<void> {
    await this.request(
      'POST',
      `${this.hosts().api}/sell/inventory/v1/bulk_update_price_quantity`,
      accessToken,
      {
        requests: [
          {
            sku: this.sanitizeSku(sku),
            shipToLocationAvailability: { quantity: Math.max(quantity, 0) },
            offers: [{ price: { currency: 'USD', value: price.toFixed(2) } }],
          },
        ],
      },
    );
  }

  async listActiveListings(accessToken: string): Promise<SellerListing[]> {
    const listings: SellerListing[] = [];
    const pageSize = 100;

    for (let page = 1; page <= 3; page += 1) {
      const xml = await this.trading(
        accessToken,
        'GetMyeBaySelling',
        `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <ActiveList>
    <Include>true</Include>
    <Sort>QuantitySold</Sort>
    <Pagination>
      <EntriesPerPage>${pageSize}</EntriesPerPage>
      <PageNumber>${page}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`,
      );

      const ack = this.xmlTag(xml, 'Ack');
      if (ack === 'Failure') {
        throw new Error(this.xmlTag(xml, 'LongMessage') || this.xmlTag(xml, 'ShortMessage') || 'eBay GetMyeBaySelling failed');
      }

      const items = this.xmlBlocks(xml, 'Item');
      for (const block of items) {
        const mapped = this.mapSellerItem(block);
        if (mapped) listings.push(mapped);
      }

      const pages = Number(this.xmlTag(xml, 'TotalNumberOfPages') || '1');
      if (!Number.isFinite(pages) || page >= pages || items.length === 0) break;
    }

    return listings;
  }

  async listOrders(accessToken: string, since?: Date): Promise<MarketplaceOrder[]> {
    const from = (since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).toISOString();
    const filter = `creationdate:[${from}..]`;
    const data = await this.request<{ orders?: Record<string, unknown>[] }>(
      'GET',
      `${this.hosts().api}/sell/fulfillment/v1/order?limit=50&filter=${encodeURIComponent(filter)}`,
      accessToken,
    );

    return (data.orders ?? []).map((order) => this.mapOrder(order));
  }

  async pushTracking(
    accessToken: string,
    orderId: string,
    tracking: { carrier: string; number: string; lineItemIds: string[] },
  ): Promise<void> {
    await this.request(
      'POST',
      `${this.hosts().api}/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}/shipping_fulfillment`,
      accessToken,
      {
        lineItems: tracking.lineItemIds.map((lineItemId) => ({ lineItemId, quantity: 1 })),
        shippingCarrierCode: tracking.carrier,
        trackingNumber: tracking.number,
      },
    );
  }

  private mapOrder(order: Record<string, unknown>): MarketplaceOrder {
    const buyer = (order.buyer as Record<string, unknown> | undefined) ?? {};
    const shipTo = ((order.fulfillmentStartInstructions as Record<string, unknown>[] | undefined)?.[0]
      ?.shippingStep as Record<string, unknown> | undefined)?.shipTo as Record<string, unknown> | undefined;
    const contact = (shipTo?.contactAddress as Record<string, unknown> | undefined) ?? {};
    const pricing = (order.pricingSummary as Record<string, unknown> | undefined)?.total as
      | Record<string, string>
      | undefined;
    const lineItems = (order.lineItems as Record<string, unknown>[] | undefined) ?? [];

    return {
      externalId: String(order.orderId ?? ''),
      buyerName: typeof shipTo?.fullName === 'string' ? shipTo.fullName : String(buyer.username ?? ''),
      buyerEmail: typeof buyer.buyerRegistrationAddress === 'object'
        ? String((buyer.buyerRegistrationAddress as { email?: string })?.email ?? '')
        : undefined,
      buyerAddress: [contact.addressLine1, contact.addressLine2].filter(Boolean).join(', ') || undefined,
      buyerCity: typeof contact.city === 'string' ? contact.city : undefined,
      buyerCountry: typeof contact.countryCode === 'string' ? contact.countryCode : undefined,
      status: String(order.orderFulfillmentStatus ?? order.orderPaymentStatus ?? 'PENDING'),
      currency: pricing?.currency ?? this.currency(),
      totalAmount: Number(pricing?.value ?? 0),
      placedAt: new Date(String(order.creationDate ?? Date.now())),
      items: lineItems.map((item) => {
        const image = item.image as { imageUrl?: string } | undefined;
        return {
          title: String(item.title ?? 'Item'),
          quantity: Number(item.quantity ?? 1),
          unitPrice: Number((item.lineItemCost as { value?: string } | undefined)?.value ?? 0),
          sku: typeof item.sku === 'string' ? item.sku : undefined,
          lineItemId: typeof item.lineItemId === 'string' ? item.lineItemId : undefined,
          legacyItemId: typeof item.legacyItemId === 'string' ? item.legacyItemId : undefined,
          imageUrl: typeof image?.imageUrl === 'string' ? image.imageUrl : undefined,
        };
      }),
    };
  }

  private async ensureLocation(accessToken: string): Promise<void> {
    const url = `${this.hosts().api}/sell/inventory/v1/location/elbaflabs-default`;
    try {
      await this.request('GET', url, accessToken);
      return;
    } catch {
      // Location does not exist yet; create it below.
    }
    await this.request('POST', url, accessToken, {
      location: { address: { country: this.config().marketplaceId === 'EBAY_GB' ? 'GB' : 'US' } },
      name: 'ElbafLabs default',
      merchantLocationStatus: 'ENABLED',
      locationTypes: ['WAREHOUSE'],
    });
  }

  private async loadPolicies(accessToken: string): Promise<{
    fulfillmentPolicyId: string;
    paymentPolicyId: string;
    returnPolicyId: string;
  }> {
    const marketplace = this.config().marketplaceId;
    const [fulfillment, payment, returns] = await Promise.all([
      this.request<{ fulfillmentPolicies?: { fulfillmentPolicyId?: string }[] }>(
        'GET',
        `${this.hosts().api}/sell/account/v1/fulfillment_policy?marketplace_id=${marketplace}`,
        accessToken,
      ),
      this.request<{ paymentPolicies?: { paymentPolicyId?: string }[] }>(
        'GET',
        `${this.hosts().api}/sell/account/v1/payment_policy?marketplace_id=${marketplace}`,
        accessToken,
      ),
      this.request<{ returnPolicies?: { returnPolicyId?: string }[] }>(
        'GET',
        `${this.hosts().api}/sell/account/v1/return_policy?marketplace_id=${marketplace}`,
        accessToken,
      ),
    ]);

    const fulfillmentPolicyId = fulfillment.fulfillmentPolicies?.[0]?.fulfillmentPolicyId;
    const paymentPolicyId = payment.paymentPolicies?.[0]?.paymentPolicyId;
    const returnPolicyId = returns.returnPolicies?.[0]?.returnPolicyId;
    if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
      throw new Error(
        'eBay business policies are missing. Create fulfillment, payment, and return policies in Seller Hub (Account API) before publishing.',
      );
    }
    return { fulfillmentPolicyId, paymentPolicyId, returnPolicyId };
  }

  private async resolveCategoryId(accessToken: string, query: string): Promise<string> {
    const tree = this.config().marketplaceId === 'EBAY_GB' ? '3' : '0';
    try {
      const data = await this.request<{ categorySuggestions?: { category?: { categoryId?: string } }[] }>(
        'GET',
        `${this.hosts().api}/commerce/taxonomy/v1/category_tree/${tree}/get_category_suggestions?q=${encodeURIComponent(query)}`,
        accessToken,
      );
      const id = data.categorySuggestions?.[0]?.category?.categoryId;
      if (id) return id;
    } catch (error) {
      this.logger.warn(
        `Category suggestion unavailable: ${error instanceof Error ? error.message : error}`,
      );
    }
    throw new Error(
      'Could not resolve an eBay categoryId via Commerce Taxonomy API. Set a more specific listing category or grant taxonomy access.',
    );
  }

  private async trading(accessToken: string, callName: string, body: string): Promise<string> {
    const response = await fetch(`${this.hosts().api}/ws/api.dll`, {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': callName,
        'X-EBAY-API-SITEID': this.siteId(),
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml',
      },
      body,
    });
    const xml = await response.text();
    if (!response.ok) {
      throw new Error(this.xmlTag(xml, 'LongMessage') || `eBay ${callName} failed (${response.status})`);
    }
    return xml;
  }

  private siteId(): string {
    const marketplace = this.config().marketplaceId;
    const sites: Record<string, string> = {
      EBAY_US: '0',
      EBAY_GB: '3',
      EBAY_AU: '15',
      EBAY_DE: '77',
      EBAY_FR: '71',
      EBAY_IT: '101',
      EBAY_ES: '186',
      EBAY_CA: '2',
    };
    return sites[marketplace] ?? '0';
  }

  itemUrl(itemId: string, stored?: string | null): string | null {
    if (stored) return stored;
    if (!/^\d{8,}$/.test(itemId)) return null;
    const hosts: Record<string, string> = {
      EBAY_GB: 'https://www.ebay.co.uk',
      EBAY_DE: 'https://www.ebay.de',
      EBAY_FR: 'https://www.ebay.fr',
      EBAY_IT: 'https://www.ebay.it',
      EBAY_ES: 'https://www.ebay.es',
      EBAY_AU: 'https://www.ebay.com.au',
      EBAY_CA: 'https://www.ebay.ca',
    };
    const host = hosts[this.config().marketplaceId] ?? 'https://www.ebay.com';
    return `${host}/itm/${itemId}`;
  }

  private mapSellerItem(block: string): SellerListing | null {
    const itemId = this.xmlTag(block, 'ItemID');
    const title = this.xmlTag(block, 'Title');
    if (!itemId || !title) return null;

    const priceMatch = block.match(/<CurrentPrice([^>]*)>([^<]+)<\/CurrentPrice>/);
    const currency = priceMatch?.[1]?.match(/currencyID="([^"]+)"/)?.[1] ?? this.currency();
    const price = Number(priceMatch?.[2] ?? this.xmlTag(block, 'CurrentPrice') ?? 0);
    const pictures = [
      ...this.xmlTags(block, 'PictureURL'),
      ...this.xmlTags(block, 'GalleryURL'),
    ].filter((url, index, all) => url.startsWith('http') && all.indexOf(url) === index);

    return {
      itemId,
      title,
      description: this.xmlTag(block, 'Description').slice(0, 8000),
      images: pictures.slice(0, 12),
      price: Number.isFinite(price) ? price : 0,
      currency,
      quantity: Number(this.xmlTag(block, 'QuantityAvailable') || this.xmlTag(block, 'Quantity') || 0),
      soldCount: Number(this.xmlTag(block, 'QuantitySold') || 0),
      sku: this.xmlTag(block, 'SKU') || undefined,
      category: this.xmlTag(block, 'CategoryName') || undefined,
      itemUrl: this.xmlTag(block, 'ViewItemURL') || this.itemUrl(itemId) || '',
    };
  }

  private xmlBlocks(xml: string, tag: string): string[] {
    const blocks: string[] = [];
    const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
    let match = pattern.exec(xml);
    while (match) {
      blocks.push(match[1]);
      match = pattern.exec(xml);
    }
    return blocks;
  }

  private xmlTags(xml: string, tag: string): string[] {
    return this.xmlBlocks(xml, tag).map((value) => this.decodeXml(value));
  }

  private xmlTag(xml: string, tag: string): string {
    return this.xmlTags(xml, tag)[0] ?? '';
  }

  private decodeXml(value: string): string {
    return value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  private sanitizeSku(sku: string): string {
    return sku.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 50) || `sku-${Date.now()}`;
  }

  private async tokenRequest(body: Record<string, string>): Promise<OAuthTokenSet> {
    const ebay = this.config();
    const basic = Buffer.from(`${ebay.appId}:${ebay.clientSecret || ebay.certId}`).toString('base64');
    const response = await fetch(`${this.hosts().api}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body).toString(),
    });
    const payload = (await response.json()) as EbayErrorBody & {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!response.ok || !payload.access_token) {
      throw new Error(payload.error_description || payload.error || 'eBay token request failed');
    }
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : undefined,
      scopes: payload.scope,
    };
  }

  private async request<T>(
    method: string,
    url: string,
    accessToken: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-US',
        'X-EBAY-C-MARKETPLACE-ID': this.config().marketplaceId,
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) return {} as T;
    const payload = (await response.json().catch(() => ({}))) as T & EbayErrorBody;
    if (!response.ok) {
      const message =
        payload.errors?.[0]?.longMessage ||
        payload.errors?.[0]?.message ||
        payload.error_description ||
        `eBay API ${method} ${url} failed (${response.status})`;
      this.logger.warn(message);
      throw new Error(message);
    }
    return payload;
  }
}
