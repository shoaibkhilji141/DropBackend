import { createHmac } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AliExpressConfig } from '../../config/configuration';
import { htmlToPlainText } from '../../common/html';
import { MarketplaceOrder, OAuthTokenSet } from '../marketplace/marketplace.types';
import {
  SupplierProduct,
  SupplierProductVariant,
  SupplierSearchQuery,
  SupplierSearchResult,
  SupplierShippingOption,
} from './aliexpress.types';

const GATEWAY = 'https://api-sg.aliexpress.com/sync';
const AUTHORIZE = 'https://api-sg.aliexpress.com/oauth/authorize';
const TOKEN = 'https://oauth.aliexpress.com/token';
const REST = 'https://api-sg.aliexpress.com/rest';
const MIN_CALL_GAP_MS = 2000;
const ORDER_LIST_GAP_MS = 8000;
const ORDER_LIST_CACHE_MS = 10 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface AliExpressCallOptions {
  maxRetries?: number;
  minGapMs?: number;
}

interface AliExpressCallResult {
  method: string;
  ok: boolean;
  payload: Record<string, unknown>;
  error?: string;
}

@Injectable()
export class AliExpressApiClient {
  private readonly logger = new Logger(AliExpressApiClient.name);
  private callChain: Promise<unknown> = Promise.resolve();
  private lastCallAt = 0;
  private listOrdersInFlight: Promise<{ orders: MarketplaceOrder[]; error?: string }> | null = null;
  private listOrdersCache: { at: number; result: { orders: MarketplaceOrder[]; error?: string } } | null =
    null;

  constructor(private readonly configService: ConfigService) {}

  private config(): AliExpressConfig {
    return this.configService.get<AliExpressConfig>('aliexpress') as AliExpressConfig;
  }

  authorizationUrl(state: string): string {
    const config = this.config();
    const params = new URLSearchParams({
      response_type: 'code',
      force_auth: 'true',
      client_id: config.appKey,
      redirect_uri: config.callbackUrl,
      state,
    });
    return `${AUTHORIZE}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokenSet & { userNick?: string; userId?: string }> {
    const errors: string[] = [];
    try {
      return await this.exchangeCodeIop(code);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'IOP token failed');
    }
    try {
      return await this.exchangeCodeClassic(code);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Classic token failed');
    }
    throw new Error(`AliExpress token request failed: ${errors.join(' | ')}`);
  }

  private async exchangeCodeIop(
    code: string,
  ): Promise<OAuthTokenSet & { userNick?: string; userId?: string }> {
    const config = this.config();
    const apiName = '/auth/token/create';
    const params: Record<string, string> = {
      app_key: config.appKey,
      timestamp: String(Date.now()),
      sign_method: 'sha256',
      code,
    };
    params.sign = this.signIop(apiName, params, config.appSecret);
    const response = await fetch(`${REST}${apiName}?${new URLSearchParams(params).toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const raw = await response.text();
    const payload = this.parseJson(raw);
    const tokens = this.readTokenPayload(payload);
    if (!tokens) {
      const detail = this.readError(payload) || raw.slice(0, 240) || `HTTP ${response.status}`;
      this.logger.warn(`IOP token create failed: ${detail}`);
      throw new Error(detail);
    }
    return tokens;
  }

  private async exchangeCodeClassic(
    code: string,
  ): Promise<OAuthTokenSet & { userNick?: string; userId?: string }> {
    const config = this.config();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.appKey,
      client_secret: config.appSecret,
      redirect_uri: config.callbackUrl,
      sp: 'ae',
      view: 'web',
    });
    const response = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const raw = await response.text();
    const payload = this.parseJson(raw);
    const tokens = this.readTokenPayload(payload);
    if (!tokens) {
      throw new Error(
        this.readError(payload) ||
          String(payload.error_description ?? payload.error ?? raw.slice(0, 240) ?? `Classic token failed (${response.status})`),
      );
    }
    return tokens;
  }

  private parseJson(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private readTokenPayload(
    payload: Record<string, unknown>,
  ): (OAuthTokenSet & { userNick?: string; userId?: string }) | null {
    const nested = this.findTokenObject(payload);
    if (!nested) return null;
    const expireTime = Number(nested.expire_time ?? nested.expires_in ?? 0);
    return {
      accessToken: String(nested.access_token),
      refreshToken: typeof nested.refresh_token === 'string' ? nested.refresh_token : undefined,
      expiresAt:
        expireTime > 1_000_000_000
          ? new Date(expireTime)
          : expireTime > 0
            ? new Date(Date.now() + expireTime * 1000)
            : undefined,
      userNick:
        typeof nested.user_nick === 'string'
          ? nested.user_nick
          : typeof nested.account === 'string'
            ? nested.account
            : undefined,
      userId:
        nested.user_id != null
          ? String(nested.user_id)
          : nested.user_Id != null
            ? String(nested.user_Id)
            : nested.seller_id != null
              ? String(nested.seller_id)
              : nested.seller_Id != null
                ? String(nested.seller_Id)
                : nested.account_id != null
                  ? String(nested.account_id)
                  : undefined,
    };
  }

  private findTokenObject(value: unknown, depth = 0): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || depth > 4) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.access_token === 'string' && record.access_token) return record;
    for (const child of Object.values(record)) {
      const found = this.findTokenObject(child, depth + 1);
      if (found) return found;
    }
    return null;
  }

  async call(
    method: string,
    accessToken: string,
    business: Record<string, string | number | boolean | undefined> = {},
    options: AliExpressCallOptions = {},
  ): Promise<AliExpressCallResult> {
    const run = this.callChain.then(() => this.callThrottled(method, accessToken, business, options));
    this.callChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async callThrottled(
    method: string,
    accessToken: string,
    business: Record<string, string | number | boolean | undefined>,
    options: AliExpressCallOptions,
  ): Promise<AliExpressCallResult> {
    const maxRetries = options.maxRetries ?? 1;
    const minGap = options.minGapMs ?? MIN_CALL_GAP_MS;
    let last: AliExpressCallResult | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const wait = minGap - (Date.now() - this.lastCallAt);
      if (wait > 0) await sleep(wait);
      this.lastCallAt = Date.now();
      last = await this.executeCall(method, accessToken, business);
      const banMs = this.frequencyBanMs(last.error);
      if (banMs == null || attempt === maxRetries) return last;
      this.logger.warn(`${method}: rate limited, retry ${attempt + 1}/${maxRetries} after ${banMs}ms`);
      await sleep(Math.max(banMs, minGap));
    }
    return last as AliExpressCallResult;
  }

  private async executeCall(
    method: string,
    accessToken: string,
    business: Record<string, string | number | boolean | undefined>,
  ): Promise<AliExpressCallResult> {
    const config = this.config();
    const params: Record<string, string> = {
      method,
      app_key: config.appKey,
      timestamp: this.gmt8Timestamp(),
      format: 'json',
      v: '2.0',
      sign_method: 'sha256',
      simplify: 'true',
      access_token: accessToken,
    };
    for (const [key, value] of Object.entries(business)) {
      if (value !== undefined && value !== '') params[key] = String(value);
    }
    params.sign = this.sign(params, config.appSecret);

    const response = await fetch(GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams(params).toString(),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const error =
      this.readError(payload) ||
      (!response.ok ? `AliExpress ${method} failed (${response.status})` : undefined);

    if (error) {
      this.logger.warn(`${method}: ${error}`);
    }

    return { method, ok: !error, payload, error };
  }

  private frequencyBanMs(error?: string): number | null {
    if (!error || !/frequency|rate limit|ban will last/i.test(error)) return null;
    const seconds = Number(/ban will last\s+(\d+)/i.exec(error)?.[1] ?? 1);
    return Math.max(1200, (Number.isFinite(seconds) ? seconds : 1) * 1000 + 400);
  }

  async search(accessToken: string, query: SupplierSearchQuery): Promise<SupplierSearchResult> {
    const keyword = query.search?.trim();
    if (!keyword) {
      const recommended = await this.recommend(accessToken);
      if (recommended.length > 0) {
        return { items: recommended, facets: { categories: [], suppliers: [] } };
      }
    }

    const attempts: Record<string, string | number | boolean | undefined>[] = [
      {
        keyWord: keyword || 'best selling',
        local: 'en_GB',
        countryCode: 'GB',
        currency: 'GBP',
        pageIndex: 1,
        pageSize: 40,
      },
      {
        keyWord: keyword || 'electronics',
        local: 'en_GB',
        countryCode: 'GB',
        currency: 'GBP',
        sortBy: this.mapSort(query.sort),
        pageIndex: 1,
        pageSize: 40,
      },
    ];

    let lastError = '';
    for (const business of attempts) {
      const result = await this.call('aliexpress.ds.text.search', accessToken, business);
      const items = this.extractList(result.payload)
        .map((row) => this.mapSearchRow(row))
        .filter((item): item is SupplierProduct => item !== null);
      if (items.length > 0) {
        return { items, facets: { categories: [], suppliers: [] } };
      }
      if (!result.ok) lastError = result.error || lastError;
    }

    const recommended = await this.recommend(accessToken);
    if (recommended.length > 0) {
      return { items: recommended, facets: { categories: [], suppliers: [] } };
    }

    throw new Error(
      lastError ||
        'AliExpress product search returned no products. Confirm Dropshipping API access for aliexpress.ds.text.search.',
    );
  }

  async getProduct(accessToken: string, externalId: string): Promise<SupplierProduct | null> {
    const result = await this.call('aliexpress.ds.product.get', accessToken, {
      product_id: externalId,
      ship_to_country: 'GB',
      target_currency: 'GBP',
      target_language: 'EN',
    });
    if (!result.ok) {
      throw new Error(
        result.error ||
          'AliExpress product details are not available. Confirm access to aliexpress.ds.product.get.',
      );
    }
    return this.mapProduct(result.payload, externalId);
  }

  async getFreight(
    accessToken: string,
    productId: string,
  ): Promise<SupplierShippingOption[]> {
    const result = await this.call('aliexpress.ds.freight.query', accessToken, {
      queryDeliveryReq: JSON.stringify({
        quantity: 1,
        shipToCountry: 'GB',
        productId,
        provinceCode: '',
        cityCode: '',
        language: 'en_GB',
        locale: 'en_GB',
        currency: 'GBP',
      }),
    });
    if (!result.ok) return [];
    return this.mapFreight(result.payload);
  }

  async listOrders(accessToken: string): Promise<{ orders: MarketplaceOrder[]; error?: string }> {
    if (this.listOrdersInFlight) return this.listOrdersInFlight;
    this.listOrdersInFlight = this.listOrdersOnce(accessToken).finally(() => {
      this.listOrdersInFlight = null;
    });
    return this.listOrdersInFlight;
  }

  private async listOrdersOnce(
    accessToken: string,
  ): Promise<{ orders: MarketplaceOrder[]; error?: string }> {
    const cached = this.listOrdersCache;
    if (cached && Date.now() - cached.at < ORDER_LIST_CACHE_MS) {
      return cached.result;
    }

    const end = new Date();
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.callDropshipOrderList(accessToken, start, end, 'Payment Completed');

    if (!result.ok) {
      const rateLimited = this.frequencyBanMs(result.error) != null;
      const error = rateLimited
        ? 'AliExpress blocked the purchase-list API (ApiCallLimit). Your Drop Shipping app cannot read website My Orders — only orders placed through the DS API. Wait 10 minutes, or add a My Orders purchase manually.'
        : result.error ||
          'Drop Shipping order list was refused. Buyer My Orders APIs are not granted to Drop Shipping apps.';
      const empty = { orders: [], error };
      this.listOrdersCache = { at: Date.now(), result: empty };
      return empty;
    }

    const seen = new Set<string>();
    const orders: MarketplaceOrder[] = [];
    for (const row of this.findOrderRows(result.payload)) {
      const mapped = this.mapPurchaseRow(row);
      if (!mapped || seen.has(mapped.externalId)) continue;
      seen.add(mapped.externalId);
      orders.push(mapped);
    }

    for (const order of orders.slice(0, 5)) {
      const detail = await this.getDropshipOrder(accessToken, order.externalId);
      if (!detail) continue;
      order.shopName = detail.shopName || order.shopName;
      order.buyerName = order.shopName;
      order.trackingCode = detail.trackingCode || order.trackingCode;
      order.trackingCarrier = detail.trackingCarrier || order.trackingCarrier;
      if (detail.items.length > 0) order.items = detail.items;
      if (detail.totalAmount) order.totalAmount = detail.totalAmount;
      if (detail.currency) order.currency = detail.currency;
      if (detail.status) order.status = detail.status;
    }

    const mapped = {
      orders,
      error:
        orders.length === 0
          ? 'No Drop Shipping API purchases in the last 30 days. AliExpress website My Orders (Processing / Paid / Delivered) are not exposed to this app — add them with Add My Order.'
          : undefined,
    };
    this.listOrdersCache = { at: Date.now(), result: mapped };
    return mapped;
  }

  private async callDropshipOrderList(
    accessToken: string,
    start: Date,
    end: Date,
    status: string,
  ): Promise<AliExpressCallResult> {
    const body = {
      start_time: this.pstTimestamp(start),
      end_time: this.pstTimestamp(end),
      status,
      page_size: 50,
      page_no: 1,
    };
    return this.call('aliexpress.ds.commissionorder.listbyindex', accessToken, body, {
      maxRetries: 0,
      minGapMs: ORDER_LIST_GAP_MS,
    });
  }

  private async getDropshipOrder(accessToken: string, orderId: string): Promise<MarketplaceOrder | null> {
    for (const method of ['aliexpress.ds.trade.order.get', 'aliexpress.trade.ds.order.get'] as const) {
      const result = await this.call(method, accessToken, { order_id: orderId }, { maxRetries: 0, minGapMs: 2500 });
      if (!result.ok) continue;
      const row = this.findOrderRows(result.payload)[0];
      if (row) return this.mapPurchaseRow(row);
    }
    return null;
  }

  private mapPurchaseRow(row: Record<string, unknown>): MarketplaceOrder | null {
    const externalId = String(
      row.order_id ??
        row.orderId ??
        row.order_number ??
        row.order_id_str ??
        row.parent_order_number ??
        row.purchase_order_no ??
        row.trade_order_id ??
        '',
    );
    if (!externalId) return null;
    const amount = this.money(
      row.paid_amount ?? row.finished_amount ?? row.pay_amount ?? row.order_amount ?? row.orderAmount,
    );
    const currency =
      this.currencyOf(row.pay_amount ?? row.order_amount) ||
      String(row.publisher_settled_currency ?? row.currency_code ?? 'GBP');
    const created = String(
      row.paid_time ??
        row.created_time ??
        row.gmt_create ??
        row.gmtCreate ??
        row.gmt_pay_time ??
        row.completed_time ??
        '',
    );
    const tracking = this.orderTracking(row);
    return {
      externalId,
      buyerName: this.orderShopName(row),
      shopName: this.orderShopName(row),
      status: String(row.order_status ?? row.orderStatus ?? row.effect_status ?? 'PAID'),
      currency,
      totalAmount: amount,
      placedAt: created ? new Date(created.replace(' ', 'T') + 'Z') : new Date(),
      trackingCode: tracking.code,
      trackingCarrier: tracking.carrier,
      items: this.orderLineItems(row),
    };
  }

  private pstTimestamp(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
  }

  private async recommend(accessToken: string): Promise<SupplierProduct[]> {
    for (const feedName of ['DS_bestselling', 'bestselling', 'AE_Hot_Product']) {
      const result = await this.call('aliexpress.ds.recommend.feed.get', accessToken, {
        page_no: 1,
        page_size: 40,
        country: 'GB',
        target_currency: 'GBP',
        target_language: 'EN',
        feed_name: feedName,
      });
      const items = this.extractList(result.payload)
        .map((row) => this.mapSearchRow(row))
        .filter((item): item is SupplierProduct => item !== null);
      if (items.length > 0) return items;
    }
    return [];
  }

  private sign(params: Record<string, string>, secret: string): string {
    const assembled = Object.keys(params)
      .filter((key) => key !== 'sign' && params[key] !== '')
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join('');
    return createHmac('sha256', secret).update(assembled).digest('hex').toUpperCase();
  }

  /** Official IOP REST signature: HMAC-SHA256(apiName + sorted key/value). */
  private signIop(apiName: string, params: Record<string, string>, secret: string): string {
    const assembled = Object.keys(params)
      .filter((key) => key !== 'sign' && params[key] !== '')
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join('');
    return createHmac('sha256', secret).update(`${apiName}${assembled}`).digest('hex').toUpperCase();
  }

  private gmt8Timestamp(): string {
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return now.toISOString().replace('T', ' ').slice(0, 19);
  }

  private readError(payload: Record<string, unknown>): string | undefined {
    if (typeof payload.error_response === 'object' && payload.error_response) {
      const error = payload.error_response as { msg?: string; sub_msg?: string; code?: string };
      return error.sub_msg || error.msg || error.code;
    }
    const code = payload.code != null ? String(payload.code) : '';
    const success = code === '' || code === '0' || code === '00' || code === '200';
    const message = [payload.error_msg, payload.error_message, payload.message, payload.msg, payload.error_code]
      .filter((item): item is string => typeof item === 'string' && item.length > 0 && item !== 'error_code')
      .join(': ');
    if (success) return undefined;
    if (message && code) return `${code}: ${message}`;
    if (message && !payload.access_token) return message;
    if (code && !payload.access_token) return `AliExpress error ${code}`;
    return undefined;
  }

  private extractList(payload: Record<string, unknown>): Record<string, unknown>[] {
    const candidates = [
      this.dig(payload, ['aliexpress_ds_text_search_response', 'data', 'products', 'product']),
      this.dig(payload, ['aliexpress_ds_text_search_response', 'result', 'products']),
      this.dig(payload, ['result', 'data', 'products']),
      this.dig(payload, ['data', 'products']),
      this.dig(payload, ['products']),
      this.dig(payload, ['aliexpress_ds_recommend_feed_get_response', 'result', 'products', 'product']),
      this.dig(payload, ['result', 'products', 'product']),
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate as Record<string, unknown>[];
      if (candidate && typeof candidate === 'object') return [candidate as Record<string, unknown>];
    }
    return [];
  }

  private mapSearchRow(row: Record<string, unknown>): SupplierProduct | null {
    const id = String(row.itemId ?? row.productId ?? row.product_id ?? '');
    if (!id) return null;
    const image = this.absoluteImage(String(row.itemMainPic ?? row.image ?? row.product_main_image_url ?? ''));
    const price = this.num(row.salePrice ?? row.target_sale_price ?? row.price ?? row.minPrice);
    return {
      externalId: id,
      title: String(row.title ?? row.product_title ?? 'AliExpress product'),
      description: String(row.title ?? ''),
      images: image ? [image] : [],
      sourceUrl: String(row.productDetailUrl ?? row.product_detail_url ?? `https://www.aliexpress.com/item/${id}.html`),
      currency: String(row.salePriceCurrency ?? row.target_sale_price_currency ?? 'GBP'),
      costPrice: price,
      shippingCost: this.num(row.shipToCost ?? row.freight),
      stock: this.num(row.stock ?? 1) || 1,
      rating: this.num(row.evaluateRate ?? row.avg_evaluate_rate),
      reviews: this.num(row.totalEvaluationRate ?? row.evaluation_count),
      orders: this.num(row.orders ?? row.lastest_volume),
      category: String(row.categoryName ?? row.second_level_category_name ?? 'General'),
      shippingEtaDays: 15,
      shippingOptions: [],
      supplier: {
        externalId: String(row.storeId ?? row.store_id ?? id),
        name: String(row.storeName ?? row.store_name ?? 'AliExpress seller'),
        score: this.num(row.storeScore ?? 80),
      },
      variants: [],
    };
  }

  private mapProduct(payload: Record<string, unknown>, fallbackId: string): SupplierProduct | null {
    const result =
      (this.dig(payload, ['aliexpress_ds_product_get_response', 'result']) as Record<string, unknown> | undefined) ??
      (this.dig(payload, ['result']) as Record<string, unknown> | undefined) ??
      payload;
    const base =
      (result.ae_item_base_info_dto as Record<string, unknown> | undefined) ??
      (result.ae_item_base_info as Record<string, unknown> | undefined) ??
      {};
    const media =
      (result.ae_multimedia_info_dto as Record<string, unknown> | undefined) ?? {};
    const store =
      (result.ae_store_info as Record<string, unknown> | undefined) ??
      (result.ae_store_info_dto as Record<string, unknown> | undefined) ??
      {};
    const skuBlock =
      (result.ae_item_sku_info_dtos as Record<string, unknown> | undefined) ??
      (result.ae_item_sku_info as Record<string, unknown> | undefined) ??
      {};
    const skuList = this.asArray(
      skuBlock.ae_item_sku_info_d_t_o ?? skuBlock.ae_item_sku_info ?? skuBlock,
    );
    const images = this.imageList(media.image_urls ?? media.ae_video_dtos ?? []);
    const firstImage = this.absoluteImage(String(base.product_main_image_url ?? images[0] ?? ''));
    const variants: SupplierProductVariant[] = skuList.map((sku, index) => ({
      externalId: String(sku.sku_id ?? sku.id ?? `${fallbackId}-${index}`),
      name: String(sku.sku_attr ?? sku.sku_property ?? `Variant ${index + 1}`),
      attributes: String(sku.sku_attr ?? ''),
      costPrice: this.num(sku.offer_sale_price ?? sku.sku_price ?? sku.offer_bulk_sale_price),
      stock: this.num(sku.sku_available_stock ?? sku.s_k_u_available_stock ?? 0),
      imageUrl: typeof sku.sku_img === 'string' ? this.absoluteImage(sku.sku_img) : undefined,
    }));
    const costPrice = variants[0]?.costPrice || this.num(base.target_sale_price ?? base.sale_price);
    const stock = variants.reduce((sum, variant) => sum + variant.stock, 0) || this.num(base.product_stock);
    const id = String(base.product_id ?? fallbackId);
    const propBlock =
      (result.ae_item_properties as Record<string, unknown> | undefined) ??
      (result.ae_item_properties_dto as Record<string, unknown> | undefined) ??
      {};
    const specs = this.asArray(propBlock.ae_item_property ?? propBlock)
      .map((row) => ({
        name: String(row.attr_name ?? row.attrName ?? ''),
        value: String(row.attr_value ?? row.attrValue ?? ''),
      }))
      .filter((row) => row.name && row.value);

    return {
      externalId: id,
      title: htmlToPlainText(String(base.subject ?? base.title ?? 'AliExpress product')).slice(0, 200),
      description: htmlToPlainText(String(base.detail ?? base.mobile_detail ?? base.subject ?? '')),
      images: images.length > 0 ? images : firstImage ? [firstImage] : [],
      sourceUrl: String(base.product_detail_url ?? `https://www.aliexpress.com/item/${id}.html`),
      currency: String(base.currency_code ?? 'GBP'),
      costPrice,
      shippingCost: 0,
      stock,
      rating: this.num(base.avg_evaluation_rating),
      reviews: this.num(base.evaluation_count),
      orders: this.num(base.sales_count ?? base.order_count),
      category: String(base.category_name ?? 'General'),
      shippingEtaDays: 15,
      shippingOptions: [],
      supplier: {
        externalId: String(store.store_id ?? id),
        name: String(store.store_name ?? 'AliExpress seller'),
        score: this.num(store.store_score ?? 80),
      },
      variants,
      specs,
    };
  }

  private mapFreight(payload: Record<string, unknown>): SupplierShippingOption[] {
    const list = this.asArray(
      this.dig(payload, ['aliexpress_ds_freight_query_response', 'result', 'delivery_options']) ??
        this.dig(payload, ['result', 'delivery_options']) ??
        this.dig(payload, ['result']),
    );
    return list
      .map((row) => ({
        method: String(row.company ?? row.service_name ?? row.code ?? 'Standard'),
        cost: this.num(
          (typeof row.freight === 'object' && row.freight
            ? (row.freight as { amount?: unknown }).amount
            : undefined) ?? row.shipping_fee ?? row.cost,
        ),
        etaDaysMin: this.num(row.min_delivery_days ?? 7),
        etaDaysMax: this.num(row.max_delivery_days ?? 20),
        trackingAvailable: Boolean(row.tracking_available ?? true),
      }))
      .filter((option) => option.method);
  }

  private mapSort(sort?: string): string {
    if (sort === 'costAsc') return 'priceAsc';
    if (sort === 'costDesc') return 'priceDesc';
    if (sort === 'ordersDesc') return 'ordersDesc';
    return 'bestMatch';
  }

  private dig(value: unknown, path: string[]): unknown {
    let current = value;
    for (const key of path) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  private asArray(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
    if (value && typeof value === 'object') return [value as Record<string, unknown>];
    return [];
  }

  private num(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private imageList(value: unknown): string[] {
    if (typeof value === 'string') {
      return value
        .split(/[;,]/)
        .map((url) => this.absoluteImage(url))
        .filter(Boolean);
    }
    return this.asArray(value)
      .map((item) =>
        this.absoluteImage(
          typeof item === 'string' ? item : String((item as { poster_url?: string }).poster_url ?? ''),
        ),
      )
      .filter(Boolean);
  }

  private absoluteImage(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    return trimmed;
  }

  private money(value: unknown): number {
    if (value && typeof value === 'object') {
      const amount = (value as { amount?: unknown; cent?: unknown }).amount;
      if (amount != null) return this.num(amount);
    }
    return this.num(value);
  }

  private currencyOf(value: unknown): string {
    if (value && typeof value === 'object') {
      const code = (value as { currency_code?: unknown; currency?: unknown }).currency_code;
      if (typeof code === 'string' && code) return code;
    }
    return '';
  }

  private findOrderRows(payload: Record<string, unknown>): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    const visit = (node: unknown, depth: number) => {
      if (!node || typeof node !== 'object' || depth > 6) return;
      if (Array.isArray(node)) {
        node.forEach((child) => visit(child, depth + 1));
        return;
      }
      const record = node as Record<string, unknown>;
      const id =
        record.order_id ??
        record.orderId ??
        record.order_number ??
        record.order_id_str ??
        record.parent_order_number ??
        record.purchase_order_no ??
        record.trade_order_id;
      if (
        id != null &&
        (record.order_status != null ||
          record.orderStatus != null ||
          record.gmt_create != null ||
          record.gmtCreate != null ||
          record.paid_time != null ||
          record.created_time != null ||
          record.item_title != null ||
          record.product_list != null ||
          record.product_name != null ||
          record.productName != null ||
          record.store_name != null)
      ) {
        rows.push(record);
      }
      Object.values(record).forEach((child) => visit(child, depth + 1));
    };
    visit(payload, 0);
    return rows;
  }

  private orderLineItems(row: Record<string, unknown>): MarketplaceOrder['items'] {
    const lists = [
      this.dig(row, ['product_list', 'aeop_order_product_dto']),
      this.dig(row, ['child_order_list', 'aeop_child_order_info']),
      row.product_list,
      row.child_order_list,
    ];
    for (const list of lists) {
      const items = this.asArray(list)
        .map((item) => ({
          title: String(
            item.product_name ??
              item.productName ??
              item.product_title ??
              item.item_title ??
              item.sku_code ??
              row.item_title ??
              row.product_name ??
              row.product_title ??
              'AliExpress item',
          ),
          quantity: this.num(item.product_count ?? item.productCount ?? item.quantity ?? 1) || 1,
          unitPrice: this.money(item.product_price ?? item.productPrice ?? item.init_order_amt),
          imageUrl: this.absoluteImage(String(item.product_img_url ?? item.snapshot_small_photo_path ?? '')) || undefined,
        }))
        .filter((item) => item.title);
      if (items.length > 0) return items;
    }
    return [
      {
        title: String(row.item_title ?? row.product_name ?? row.product_title ?? row.productName ?? 'AliExpress order'),
        quantity: 1,
        unitPrice: this.money(row.pay_amount ?? row.order_amount),
      },
    ];
  }

  private orderShopName(row: Record<string, unknown>): string {
    const store =
      (row.store_info as Record<string, unknown> | undefined) ??
      (row.storeInfo as Record<string, unknown> | undefined) ??
      {};
    const name = String(
      store.store_name ??
        store.storeName ??
        row.store_name ??
        row.seller_signer_fullname ??
        row.seller_login_id ??
        row.sellerloginid ??
        row.seller_store_name ??
        row.shop_name ??
        '',
    ).trim();
    return name || 'AliExpress shop';
  }

  private orderTracking(row: Record<string, unknown>): { code?: string; carrier?: string } {
    const lists = [
      this.dig(row, ['logistics_info_list', 'aeop_order_logistics_info']),
      this.dig(row, ['logistics_info_list']),
      row.logistics_info,
    ];
    for (const list of lists) {
      const item = this.asArray(list)[0];
      if (!item) continue;
      const code = String(item.logistics_no ?? item.tracking_no ?? item.logisticsNo ?? '').trim();
      const carrier = String(item.logistics_service ?? item.service_name ?? item.logisticsService ?? '').trim();
      if (code || carrier) return { code: code || undefined, carrier: carrier || undefined };
    }
    const code = String(row.logistics_no ?? row.tracking_no ?? '').trim();
    const carrier = String(row.logistics_service ?? row.logistics_type ?? '').trim();
    return { code: code || undefined, carrier: carrier || undefined };
  }
}
