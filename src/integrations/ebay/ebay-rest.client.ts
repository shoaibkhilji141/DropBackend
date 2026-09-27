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

export interface EbayResearchQuery {
  q?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: string;
  sort?: string;
  limit?: number;
}

export interface EbayMarketplaceItem {
  itemId: string;
  title: string;
  imageUrl: string | null;
  price: number;
  currency: string;
  itemUrl: string;
  seller: string | null;
  condition: string | null;
  categories: string[];
  soldCount: number;
  soldLast7Days: number;
  soldLast30Days: number;
  listingAgeDays: number | null;
  endedAt?: Date;
}

interface BrowseItemPayload {
  itemId?: string;
  legacyItemId?: string;
  itemCreationDate?: string;
  estimatedAvailabilities?: { estimatedSoldQuantity?: number }[];
}

@Injectable()
export class EbayRestClient {
  private readonly logger = new Logger(EbayRestClient.name);
  private appToken?: { accessToken: string; expiresAt: number };

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

  async applicationToken(): Promise<string> {
    if (this.appToken && this.appToken.expiresAt > Date.now() + 60_000) {
      return this.appToken.accessToken;
    }
    const tokens = await this.tokenRequest({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    });
    this.appToken = {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt?.getTime() ?? Date.now() + 7_000_000,
    };
    return tokens.accessToken;
  }

  async searchMarketplace(query: string | EbayResearchQuery = {}): Promise<EbayMarketplaceItem[]> {
    const filters: EbayResearchQuery = typeof query === 'string' ? { q: query } : query;
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 100);
    let items: EbayMarketplaceItem[] = [];
    try {
      items = await this.searchFinding(filters, limit);
    } catch (error) {
      this.logger.warn(
        `Finding search failed, using Browse: ${error instanceof Error ? error.message : error}`,
      );
    }
    if (items.length === 0) {
      items = await this.searchBrowse(filters, Math.min(limit, 50));
    }
    items = await this.enrichListingSold(items);
    return this.sortResearchItems(items, filters.sort);
  }

  private async searchFinding(filters: EbayResearchQuery, limit: number): Promise<EbayMarketplaceItem[]> {
    const active = await this.finding('findItemsAdvanced', filters, limit);
    const completed = await this.findingCompleted(filters, 100);
    const sold7 = new Map<string, number>();
    const sold30 = new Map<string, number>();
    const now = Date.now();
    for (const sale of completed) {
      const end = sale.endedAt?.getTime() ?? 0;
      const qty = Math.max(sale.soldCount, 1);
      const keys = [sale.itemId, this.titleKey(sale.title)].filter(Boolean);
      if (end >= now - 30 * 24 * 60 * 60 * 1000) {
        for (const key of keys) sold30.set(key, (sold30.get(key) ?? 0) + qty);
      }
      if (end >= now - 7 * 24 * 60 * 60 * 1000) {
        for (const key of keys) sold7.set(key, (sold7.get(key) ?? 0) + qty);
      }
    }

    return active.map((item) => {
      const titleKey = this.titleKey(item.title);
      const matched7 = sold7.get(item.itemId) ?? sold7.get(titleKey) ?? 0;
      const matched30 = sold30.get(item.itemId) ?? sold30.get(titleKey) ?? 0;
      const age = item.listingAgeDays;
      const soldLast7Days = age != null && age <= 7 ? item.soldCount : matched7;
      const soldLast30Days = age != null && age <= 30 ? item.soldCount : Math.max(matched30, matched7);
      return { ...item, soldLast7Days, soldLast30Days };
    });
  }

  private async searchBrowse(filters: EbayResearchQuery, limit: number): Promise<EbayMarketplaceItem[]> {
    const token = await this.applicationToken();
    const params = new URLSearchParams({
      limit: String(limit),
      fieldgroups: 'EXTENDED',
    });
    const trimmed = filters.q?.trim();
    if (trimmed) params.set('q', trimmed);
    else params.set('category_ids', filters.categoryId || '293');
    if (filters.categoryId && trimmed) params.set('category_ids', filters.categoryId);
    const filterParts: string[] = ['buyingOptions:{FIXED_PRICE}'];
    if (filters.minPrice != null || filters.maxPrice != null) {
      const min = filters.minPrice ?? 0;
      const max = filters.maxPrice ?? 10_000;
      filterParts.push(`price:[${min}..${max}]`, `priceCurrency:${this.currency()}`);
    }
    if (filters.condition === 'NEW') filterParts.push('conditions:{NEW}');
    if (filters.condition === 'USED') filterParts.push('conditions:{USED}');
    params.set('filter', filterParts.join(','));
    const payload = await this.request<{
      itemSummaries?: Array<{
        itemId?: string;
        title?: string;
        image?: { imageUrl?: string };
        thumbnailImages?: { imageUrl?: string }[];
        price?: { value?: string; currency?: string };
        itemWebUrl?: string;
        seller?: { username?: string };
        condition?: string;
        categories?: { categoryName?: string }[];
      }>;
    }>('GET', `${this.hosts().api}/buy/browse/v1/item_summary/search?${params.toString()}`, token);

    return (payload.itemSummaries ?? [])
      .map((item): EbayMarketplaceItem | null => {
        const itemId = String(item.itemId ?? '');
        if (!itemId) return null;
        return {
          itemId,
          title: String(item.title ?? 'eBay item'),
          imageUrl: item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl ?? null,
          price: Number(item.price?.value ?? 0),
          currency: item.price?.currency ?? this.currency(),
          itemUrl: String(item.itemWebUrl ?? this.itemUrl(itemId.replace(/^v1\|/, '').split('|')[0]) ?? ''),
          seller: item.seller?.username ?? null,
          condition: item.condition ?? null,
          categories: (item.categories ?? [])
            .map((category) => category.categoryName)
            .filter((name): name is string => Boolean(name)),
          soldCount: 0,
          soldLast7Days: 0,
          soldLast30Days: 0,
          listingAgeDays: null,
        };
      })
      .filter((item): item is EbayMarketplaceItem => item !== null);
  }

  private async finding(
    operation: 'findItemsAdvanced' | 'findCompletedItems',
    filters: EbayResearchQuery,
    limit: number,
  ): Promise<EbayMarketplaceItem[]> {
    const ebay = this.config();
    const params = new URLSearchParams({
      'OPERATION-NAME': operation,
      'SERVICE-VERSION': '1.13.0',
      'SECURITY-APPNAME': ebay.appId,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'REST-PAYLOAD': 'true',
      'GLOBAL-ID': this.findingGlobalId(),
      'paginationInput.entriesPerPage': String(limit),
      'paginationInput.pageNumber': '1',
      'outputSelector(0)': 'SellerInfo',
      'outputSelector(1)': 'PictureURLLarge',
      'outputSelector(2)': 'PictureURLSuperSize',
    });
    const keywords = filters.q?.trim();
    if (keywords) params.set('keywords', keywords);
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (!keywords && !filters.categoryId) params.set('categoryId', '293');

    let filterIndex = 0;
    const addFilter = (name: string, value: string) => {
      params.set(`itemFilter(${filterIndex}).name`, name);
      params.set(`itemFilter(${filterIndex}).value`, value);
      filterIndex += 1;
    };
    addFilter('ListedIn', this.findingGlobalId());
    addFilter('HideDuplicateItems', 'true');
    if (filters.minPrice != null) addFilter('MinPrice', String(filters.minPrice));
    if (filters.maxPrice != null) addFilter('MaxPrice', String(filters.maxPrice));
    if (filters.condition === 'NEW') addFilter('Condition', 'New');
    if (filters.condition === 'USED') addFilter('Condition', 'Used');
    if (operation === 'findCompletedItems') {
      addFilter('SoldItemsOnly', 'true');
      const to = new Date();
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      addFilter('EndTimeFrom', from.toISOString());
      addFilter('EndTimeTo', to.toISOString());
    }

    const findingHost =
      this.config().environment === 'sandbox'
        ? 'https://svcs.sandbox.ebay.com'
        : 'https://svcs.ebay.com';
    const url = `${findingHost}/services/search/FindingService/v1?${params.toString()}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const rootKey = operation === 'findCompletedItems' ? 'findCompletedItemsResponse' : 'findItemsAdvancedResponse';
    const root = this.firstFinding(payload[rootKey]);
    const ack = String(this.firstFindingValue(root?.ack) ?? '');
    if (!response.ok || /failure/i.test(ack)) {
      const errorBlock = this.firstFinding(this.firstFinding(root?.errorMessage)?.error);
      const message =
        this.firstFindingValue(errorBlock?.message) ||
        this.firstFindingValue(errorBlock?.longMessage) ||
        `eBay Finding ${operation} failed`;
      throw new Error(message);
    }
    const search = this.firstFinding(root?.searchResult);
    const rows = Array.isArray(search?.item) ? search.item : [];
    return rows
      .map((row) => this.mapFindingItem(row as Record<string, unknown>))
      .filter((item): item is EbayMarketplaceItem => item !== null);
  }

  private async findingCompleted(filters: EbayResearchQuery, limit: number): Promise<EbayMarketplaceItem[]> {
    try {
      return await this.finding('findCompletedItems', filters, limit);
    } catch (error) {
      this.logger.warn(
        `Completed-item search unavailable: ${error instanceof Error ? error.message : error}`,
      );
      return [];
    }
  }

  private mapFindingItem(row: Record<string, unknown>): EbayMarketplaceItem | null {
    const itemId = String(this.firstFindingValue(row.itemId) ?? '');
    const title = String(this.firstFindingValue(row.title) ?? '');
    if (!itemId || !title) return null;
    const selling = this.firstFinding(row.sellingStatus);
    const priceNode = this.firstFinding(selling?.currentPrice ?? selling?.convertedCurrentPrice);
    const price = Number(priceNode?.__value__ ?? this.firstFindingValue(selling?.currentPrice) ?? 0);
    const currency =
      String(priceNode?.['@currencyId'] ?? '') || this.currency();
    const listing = this.firstFinding(row.listingInfo);
    const start = this.parseFindingDate(this.firstFindingValue(listing?.startTime));
    const end = this.parseFindingDate(this.firstFindingValue(listing?.endTime));
    const category = this.firstFinding(row.primaryCategory);
    const seller = this.firstFinding(row.sellerInfo);
    const condition = this.firstFinding(row.condition);
    const picture =
      this.firstFindingValue(row.pictureURLSuperSize) ??
      this.firstFindingValue(row.pictureURLLarge) ??
      this.firstFindingValue(row.galleryURL);
    const sold = Number(this.firstFindingValue(selling?.quantitySold) ?? 0);
    const age = start ? Math.max(0, Math.round((Date.now() - start.getTime()) / 86_400_000)) : null;
    return {
      itemId,
      title,
      imageUrl: picture ? String(picture) : null,
      price: Number.isFinite(price) ? price : 0,
      currency,
      itemUrl: String(this.firstFindingValue(row.viewItemURL) ?? this.itemUrl(itemId) ?? ''),
      seller: this.firstFindingValue(seller?.sellerUserName)
        ? String(this.firstFindingValue(seller?.sellerUserName))
        : null,
      condition: this.firstFindingValue(condition?.conditionDisplayName)
        ? String(this.firstFindingValue(condition?.conditionDisplayName))
        : null,
      categories: this.firstFindingValue(category?.categoryName)
        ? [String(this.firstFindingValue(category?.categoryName))]
        : [],
      soldCount: Number.isFinite(sold) ? sold : 0,
      soldLast7Days: 0,
      soldLast30Days: 0,
      listingAgeDays: age,
      endedAt: end,
    };
  }

  private async enrichListingSold(items: EbayMarketplaceItem[]): Promise<EbayMarketplaceItem[]> {
    const details = new Map<string, { sold: number; start?: Date }>();
    const restIds = [
      ...new Set(items.map((item) => (item.itemId.startsWith('v1|') ? item.itemId : '')).filter(Boolean)),
    ];
    const legacyIds = [
      ...new Set(
        items
          .filter((item) => !item.itemId.startsWith('v1|'))
          .map((item) => this.numericItemId(item.itemId))
          .filter(Boolean),
      ),
    ];

    for (let offset = 0; offset < restIds.length; offset += 20) {
      try {
        for (const row of await this.browseGetItems(restIds.slice(offset, offset + 20))) {
          details.set(row.itemId, row);
          if (row.legacyId) details.set(row.legacyId, row);
        }
      } catch (error) {
        this.logger.warn(
          `Browse getItems failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const constructed = legacyIds.map((id) => `v1|${id}|0`);
    for (let offset = 0; offset < constructed.length; offset += 20) {
      try {
        for (const row of await this.browseGetItems(constructed.slice(offset, offset + 20))) {
          details.set(row.itemId, row);
          if (row.legacyId) details.set(row.legacyId, row);
        }
      } catch (error) {
        this.logger.warn(
          `Browse getItems (legacy) failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const missingLegacy = legacyIds.filter((id) => !details.has(id) && !details.has(`v1|${id}|0`));
    for (const legacyId of missingLegacy.slice(0, 20)) {
      try {
        const row = await this.browseGetItemByLegacyId(legacyId);
        if (!row) continue;
        details.set(legacyId, row);
        details.set(row.itemId, row);
        if (row.legacyId) details.set(row.legacyId, row);
      } catch (error) {
        this.logger.warn(
          `Browse getItemByLegacyId ${legacyId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const stillMissing = [
      ...new Set(items.map((item) => this.numericItemId(item.itemId)).filter((id) => id && !details.has(id))),
    ];
    for (let offset = 0; offset < stillMissing.length; offset += 20) {
      try {
        for (const row of await this.shoppingSold(stillMissing.slice(offset, offset + 20))) {
          if (!details.has(row.itemId)) details.set(row.itemId, row);
        }
      } catch (error) {
        this.logger.warn(
          `Shopping QuantitySold fallback failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    if (details.size === 0) return items;

    return items.map((item) => {
      const extra =
        details.get(item.itemId) ??
        details.get(this.numericItemId(item.itemId)) ??
        details.get(`v1|${this.numericItemId(item.itemId)}|0`);
      if (!extra) return item;
      const age = extra.start
        ? Math.max(0, Math.round((Date.now() - extra.start.getTime()) / 86_400_000))
        : item.listingAgeDays;
      const sold = extra.sold > 0 ? extra.sold : item.soldCount;
      return {
        ...item,
        soldCount: sold,
        listingAgeDays: age,
        soldLast7Days: age != null && age <= 7 ? sold : item.soldLast7Days,
        soldLast30Days: age != null && age <= 30 ? sold : item.soldLast30Days,
      };
    });
  }

  private async browseGetItems(
    itemIds: string[],
  ): Promise<Array<{ itemId: string; legacyId?: string; sold: number; start?: Date }>> {
    if (itemIds.length === 0) return [];
    const token = await this.applicationToken();
    const params = new URLSearchParams({ item_ids: itemIds.join(',') });
    const payload = await this.request<{
      items?: BrowseItemPayload[];
    }>('GET', `${this.hosts().api}/buy/browse/v1/item/?${params.toString()}`, token);
    return (payload.items ?? [])
      .map((item) => this.mapBrowseSold(item))
      .filter((row): row is { itemId: string; legacyId?: string; sold: number; start?: Date } => row !== null);
  }

  private async browseGetItemByLegacyId(
    legacyItemId: string,
  ): Promise<{ itemId: string; legacyId?: string; sold: number; start?: Date } | null> {
    const token = await this.applicationToken();
    const params = new URLSearchParams({ legacy_item_id: legacyItemId });
    const payload = await this.request<BrowseItemPayload>(
      'GET',
      `${this.hosts().api}/buy/browse/v1/item/get_item_by_legacy_id?${params.toString()}`,
      token,
    );
    return this.mapBrowseSold(payload);
  }

  private mapBrowseSold(
    item: BrowseItemPayload,
  ): { itemId: string; legacyId?: string; sold: number; start?: Date } | null {
    const itemId = String(item.itemId ?? '');
    const legacyId = item.legacyItemId ? String(item.legacyItemId) : this.numericItemId(itemId) || undefined;
    if (!itemId && !legacyId) return null;
    const sold = Math.max(
      0,
      ...(item.estimatedAvailabilities ?? []).map((row) => Number(row.estimatedSoldQuantity ?? 0) || 0),
    );
    const start = this.parseFindingDate(item.itemCreationDate);
    return { itemId: itemId || String(legacyId), legacyId, sold, start };
  }

  private async shoppingSold(
    itemIds: string[],
  ): Promise<Array<{ itemId: string; sold: number; start?: Date }>> {
    const params = new URLSearchParams({
      callname: 'GetMultipleItems',
      responseencoding: 'JSON',
      appid: this.config().appId,
      siteid: this.siteId(),
      version: '967',
      IncludeSelector: 'Details',
      ItemID: itemIds.join(','),
    });
    const response = await fetch(`https://open.api.ebay.com/shopping?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const ack = String(payload.Ack ?? payload.ack ?? '');
    if (!response.ok || /^failure$/i.test(ack)) {
      const errors = payload.Errors ?? payload.errors;
      const first = Array.isArray(errors) ? errors[0] : errors;
      const message =
        first && typeof first === 'object'
          ? String((first as { LongMessage?: string; ShortMessage?: string }).LongMessage ??
              (first as { ShortMessage?: string }).ShortMessage ??
              'Shopping GetMultipleItems failed')
          : 'Shopping GetMultipleItems failed';
      throw new Error(message);
    }
    const rows = Array.isArray(payload.Item) ? payload.Item : payload.Item ? [payload.Item] : [];
    return (rows as Record<string, unknown>[])
      .map((row): { itemId: string; sold: number; start?: Date } | null => {
        const itemId = String(row.ItemID ?? row.itemId ?? '');
        if (!itemId) return null;
        const listing = (row.ListingDetails ?? row.listingDetails ?? {}) as Record<string, unknown>;
        const start = this.parseFindingDate(String(listing.StartTime ?? listing.startTime ?? ''));
        return {
          itemId,
          sold: Number(row.QuantitySold ?? row.quantitySold ?? 0) || 0,
          start,
        };
      })
      .filter((row): row is { itemId: string; sold: number; start?: Date } => row !== null);
  }

  private numericItemId(itemId: string): string {
    const browse = itemId.match(/v1\|(\d+)\|/);
    if (browse) return browse[1];
    return /^\d{8,}$/.test(itemId) ? itemId : '';
  }

  private sortResearchItems(items: EbayMarketplaceItem[], sort?: string): EbayMarketplaceItem[] {
    const copy = [...items];
    copy.sort((a, b) => {
      if (sort === 'priceAsc') return a.price - b.price;
      if (sort === 'priceDesc') return b.price - a.price;
      if (sort === 'newest') return (a.listingAgeDays ?? 999) - (b.listingAgeDays ?? 999);
      if (sort === 'sold7') return b.soldLast7Days - a.soldLast7Days || b.soldCount - a.soldCount;
      if (sort === 'sold30') return b.soldLast30Days - a.soldLast30Days || b.soldCount - a.soldCount;
      return b.soldCount - a.soldCount || b.soldLast30Days - a.soldLast30Days;
    });
    return copy;
  }

  private titleKey(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .slice(0, 8)
      .join(' ');
  }

  private findingGlobalId(): string {
    const map: Record<string, string> = {
      EBAY_GB: 'EBAY-GB',
      EBAY_US: 'EBAY-US',
      EBAY_DE: 'EBAY-DE',
      EBAY_FR: 'EBAY-FR',
      EBAY_IT: 'EBAY-IT',
      EBAY_ES: 'EBAY-ES',
      EBAY_AU: 'EBAY-AU',
      EBAY_CA: 'EBAY-ENCA',
    };
    return map[this.config().marketplaceId] ?? 'EBAY-GB';
  }

  private firstFinding(value: unknown): Record<string, unknown> | undefined {
    if (Array.isArray(value)) {
      const first = value[0];
      return first && typeof first === 'object' ? (first as Record<string, unknown>) : undefined;
    }
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  }

  private firstFindingValue(value: unknown): string | undefined {
    if (value == null) return undefined;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return this.firstFindingValue(value[0]);
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (record.__value__ != null) return String(record.__value__);
    }
    return undefined;
  }

  private parseFindingDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
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
            offers: [{ price: { currency: this.currency(), value: price.toFixed(2) } }],
          },
        ],
      },
    );
  }

  async listActiveListings(accessToken: string): Promise<SellerListing[]> {
    try {
      const trading = await this.listFromTrading(accessToken);
      if (trading.length > 0) return trading;
    } catch (error) {
      this.logger.warn(
        `GetMyeBaySelling unavailable: ${error instanceof Error ? error.message : error}`,
      );
    }
    return this.listFromInventory(accessToken);
  }

  async listOrders(accessToken: string, since?: Date): Promise<MarketplaceOrder[]> {
    const from = (since ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)).toISOString();
    const filter = `creationdate:[${from}..]`;
    try {
      const data = await this.request<{ orders?: Record<string, unknown>[] }>(
        'GET',
        `${this.hosts().api}/sell/fulfillment/v1/order?limit=200&filter=${encodeURIComponent(filter)}`,
        accessToken,
      );
      return (data.orders ?? []).map((order) => this.mapOrder(order));
    } catch (error) {
      this.logger.warn(`Filtered order query failed: ${error instanceof Error ? error.message : error}`);
      const data = await this.request<{ orders?: Record<string, unknown>[] }>(
        'GET',
        `${this.hosts().api}/sell/fulfillment/v1/order?limit=200`,
        accessToken,
      );
      return (data.orders ?? []).map((order) => this.mapOrder(order));
    }
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

  private async listFromTrading(accessToken: string): Promise<SellerListing[]> {
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
    <Pagination>
      <EntriesPerPage>${pageSize}</EntriesPerPage>
      <PageNumber>${page}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`,
      );

      const ack = this.xmlTag(xml, 'Ack');
      if (ack === 'Failure') {
        throw new Error(
          this.xmlTag(xml, 'LongMessage') || this.xmlTag(xml, 'ShortMessage') || 'eBay GetMyeBaySelling failed',
        );
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

  private async listFromInventory(accessToken: string): Promise<SellerListing[]> {
    const inventory = new Map<
      string,
      { title: string; description: string; images: string[]; quantity: number }
    >();

    for (let offset = 0; offset < 500; offset += 100) {
      const data = await this.request<{
        inventoryItems?: Record<string, unknown>[];
      }>('GET', `${this.hosts().api}/sell/inventory/v1/inventory_item?limit=100&offset=${offset}`, accessToken);
      const rows = data.inventoryItems ?? [];
      for (const row of rows) {
        const sku = String(row.sku ?? '');
        if (!sku) continue;
        const product = (row.product as Record<string, unknown> | undefined) ?? {};
        const availability =
          (row.availability as { shipToLocationAvailability?: { quantity?: number } } | undefined)
            ?.shipToLocationAvailability;
        const images = Array.isArray(product.imageUrls)
          ? product.imageUrls.filter((url): url is string => typeof url === 'string' && url.startsWith('http'))
          : [];
        inventory.set(sku, {
          title: String(product.title ?? sku),
          description: String(product.description ?? ''),
          images,
          quantity: Number(availability?.quantity ?? 0),
        });
      }
      if (rows.length < 100) break;
    }

    const offers = await this.request<{
      offers?: Record<string, unknown>[];
    }>('GET', `${this.hosts().api}/sell/inventory/v1/offer?limit=200`, accessToken).catch(() => ({ offers: [] }));

    const listings: SellerListing[] = [];
    for (const offer of offers.offers ?? []) {
      const listing = (offer.listing as { listingId?: string; listingStatus?: string } | undefined) ?? {};
      const itemId = String(listing.listingId ?? offer.listingId ?? '');
      const status = String(listing.listingStatus ?? offer.status ?? 'PUBLISHED');
      if (!itemId || /UNPUBLISHED|ENDED|WITHDRAWN|INACTIVE/i.test(status)) continue;
      const sku = String(offer.sku ?? '');
      const item = inventory.get(sku);
      const price = (offer.pricingSummary as { price?: { value?: string; currency?: string } } | undefined)?.price;
      listings.push({
        itemId,
        title: (item?.title || sku || itemId).slice(0, 80),
        description: item?.description ?? '',
        images: item?.images ?? [],
        price: Number(price?.value ?? 0),
        currency: price?.currency ?? this.currency(),
        quantity: Number(offer.availableQuantity ?? item?.quantity ?? 0),
        soldCount: 0,
        sku: sku || undefined,
        category: typeof offer.categoryId === 'string' ? offer.categoryId : undefined,
        itemUrl: this.itemUrl(itemId) ?? '',
      });
    }
    return listings;
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
        'Content-Language': 'en-GB',
        'Accept-Language': 'en-GB',
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
