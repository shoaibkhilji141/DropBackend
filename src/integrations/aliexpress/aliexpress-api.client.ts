import { createHmac } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AliExpressConfig } from '../../config/configuration';
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

interface AliExpressCallResult {
  method: string;
  ok: boolean;
  payload: Record<string, unknown>;
  error?: string;
}

@Injectable()
export class AliExpressApiClient {
  private readonly logger = new Logger(AliExpressApiClient.name);

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
        local: 'en_US',
        countryCode: 'US',
        currency: 'USD',
        pageIndex: 1,
        pageSize: 40,
      },
      {
        keyWord: keyword || 'electronics',
        local: 'en_US',
        countryCode: 'US',
        currency: 'USD',
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
      ship_to_country: 'US',
      target_currency: 'USD',
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
        shipToCountry: 'US',
        productId,
        provinceCode: '',
        cityCode: '',
        language: 'en_US',
        locale: 'en_US',
        currency: 'USD',
      }),
    });
    if (!result.ok) return [];
    return this.mapFreight(result.payload);
  }

  async listOrders(accessToken: string): Promise<{ orders: MarketplaceOrder[]; error?: string }> {
    const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const pad = (value: number) => String(value).padStart(2, '0');
    const stamp = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())} ${pad(start.getUTCHours())}:${pad(start.getUTCMinutes())}:${pad(start.getUTCSeconds())}`;
    const attempts = [
      {
        method: 'aliexpress.trade.buyer.orderlist.get',
        body: {
          param_order_list_request: JSON.stringify({
            current_page: 1,
            page_size: 50,
            create_date_start: stamp,
          }),
        },
      },
      {
        method: 'aliexpress.trade.seller.orderlist.get',
        body: {
          param_aeop_order_query: JSON.stringify({
            current_page: 1,
            page_size: 50,
            create_date_start: stamp,
          }),
        },
      },
    ];

    let lastError = '';
    let result: AliExpressCallResult | null = null;
    for (const attempt of attempts) {
      result = await this.call(attempt.method, accessToken, attempt.body);
      if (result.ok) break;
      lastError = result.error || lastError;
    }
    if (!result?.ok) {
      return {
        orders: [],
        error:
          lastError ||
          'This AliExpress app is not allowed to list orders. eBay sales still sync; grant buyer/seller order APIs in the AliExpress open console.',
      };
    }

    const seen = new Set<string>();
    const orders: MarketplaceOrder[] = [];
    for (const row of this.findOrderRows(result.payload)) {
      const externalId = String(row.order_id ?? row.orderId ?? '');
      if (!externalId || seen.has(externalId)) continue;
      seen.add(externalId);
      const amount = this.money(row.pay_amount ?? row.order_amount ?? row.orderAmount);
      const currency =
        this.currencyOf(row.pay_amount ?? row.order_amount) ||
        String(row.currency_code ?? 'USD');
      const created = String(row.gmt_create ?? row.gmtCreate ?? '');
      orders.push({
        externalId,
        buyerName: String(row.buyer_signer_fullname ?? row.buyerloginid ?? 'AliExpress buyer'),
        status: String(row.order_status ?? row.orderStatus ?? 'PAID'),
        currency,
        totalAmount: amount,
        placedAt: created ? new Date(created.replace(' ', 'T') + 'Z') : new Date(),
        items: this.orderLineItems(row),
      });
    }
    return { orders };
  }

  private async recommend(accessToken: string): Promise<SupplierProduct[]> {
    for (const feedName of ['DS_bestselling', 'bestselling', 'AE_Hot_Product']) {
      const result = await this.call('aliexpress.ds.recommend.feed.get', accessToken, {
        page_no: 1,
        page_size: 40,
        country: 'US',
        target_currency: 'USD',
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
      currency: String(row.salePriceCurrency ?? row.target_sale_price_currency ?? 'USD'),
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
      title: String(base.subject ?? base.title ?? 'AliExpress product'),
      description: String(base.detail ?? base.mobile_detail ?? base.subject ?? ''),
      images: images.length > 0 ? images : firstImage ? [firstImage] : [],
      sourceUrl: String(base.product_detail_url ?? `https://www.aliexpress.com/item/${id}.html`),
      currency: String(base.currency_code ?? 'USD'),
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
      if (record.order_id != null && (record.order_status != null || record.gmt_create != null || record.product_list != null)) {
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
          title: String(item.product_name ?? item.productName ?? item.sku_code ?? 'AliExpress item'),
          quantity: this.num(item.product_count ?? item.productCount ?? item.quantity ?? 1) || 1,
          unitPrice: this.money(item.product_price ?? item.productPrice ?? item.init_order_amt),
          imageUrl: this.absoluteImage(String(item.product_img_url ?? item.snapshot_small_photo_path ?? '')) || undefined,
        }))
        .filter((item) => item.title);
      if (items.length > 0) return items;
    }
    return [{ title: 'AliExpress order', quantity: 1, unitPrice: this.money(row.pay_amount ?? row.order_amount) }];
  }
}
