import { createHmac } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AliExpressConfig } from '../../config/configuration';
import { OAuthTokenSet } from '../marketplace/marketplace.types';
import {
  SupplierProduct,
  SupplierProductVariant,
  SupplierSearchQuery,
  SupplierSearchResult,
  SupplierShippingOption,
} from './aliexpress.types';

const GATEWAY = 'https://api-sg.aliexpress.com/sync';
const AUTHORIZE = 'https://oauth.aliexpress.com/authorize';
const TOKEN = 'https://oauth.aliexpress.com/token';

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
      client_id: config.appKey,
      redirect_uri: config.callbackUrl,
      state,
      view: 'web',
      sp: 'ae',
    });
    return `${AUTHORIZE}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokenSet & { userNick?: string; userId?: string }> {
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
    const payload = (await response.json()) as Record<string, unknown>;
    const accessToken = String(payload.access_token ?? '');
    if (!response.ok || !accessToken) {
      throw new Error(String(payload.error_description ?? payload.error ?? 'AliExpress token request failed'));
    }
    const expireTime = Number(payload.expire_time ?? 0);
    return {
      accessToken,
      refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined,
      expiresAt: expireTime > 0 ? new Date(expireTime) : undefined,
      userNick: typeof payload.user_nick === 'string' ? payload.user_nick : undefined,
      userId: payload.user_id != null ? String(payload.user_id) : undefined,
    };
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
    const result = await this.call('aliexpress.ds.text.search', accessToken, {
      keyWord: query.search || 'electronics',
      local: 'en_US',
      countryCode: 'US',
      currency: 'USD',
      sortBy: this.mapSort(query.sort),
      pageIndex: 1,
      pageSize: 40,
    });
    if (!result.ok) {
      throw new Error(
        result.error ||
          'AliExpress product search is not available for this application. Confirm Dropshipping API access for aliexpress.ds.text.search.',
      );
    }
    const items = this.extractList(result.payload)
      .map((row) => this.mapSearchRow(row))
      .filter((item): item is SupplierProduct => item !== null);
    return {
      items,
      facets: { categories: [], suppliers: [] },
    };
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

  private sign(params: Record<string, string>, secret: string): string {
    const assembled = Object.keys(params)
      .filter((key) => key !== 'sign' && params[key] !== '')
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join('');
    return createHmac('sha256', secret).update(assembled).digest('hex').toUpperCase();
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
    if (typeof payload.error_msg === 'string') return payload.error_msg;
    if (typeof payload.msg === 'string' && payload.code && payload.code !== '0') {
      return payload.msg;
    }
    return undefined;
  }

  private extractList(payload: Record<string, unknown>): Record<string, unknown>[] {
    const candidates = [
      this.dig(payload, ['aliexpress_ds_text_search_response', 'data', 'products', 'product']),
      this.dig(payload, ['aliexpress_ds_text_search_response', 'result', 'products']),
      this.dig(payload, ['result', 'data', 'products']),
      this.dig(payload, ['data', 'products']),
      this.dig(payload, ['products']),
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
    const image = String(row.itemMainPic ?? row.image ?? row.product_main_image_url ?? '');
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
    const images = this.asArray(media.image_urls ?? media.ae_video_dtos ?? [])
      .map((item) => (typeof item === 'string' ? item : String((item as { poster_url?: string }).poster_url ?? '')))
      .filter(Boolean);
    const firstImage = String(base.product_main_image_url ?? images[0] ?? '');
    const variants: SupplierProductVariant[] = skuList.map((sku, index) => ({
      externalId: String(sku.sku_id ?? sku.id ?? `${fallbackId}-${index}`),
      name: String(sku.sku_attr ?? sku.sku_property ?? `Variant ${index + 1}`),
      attributes: String(sku.sku_attr ?? ''),
      costPrice: this.num(sku.offer_sale_price ?? sku.sku_price ?? sku.offer_bulk_sale_price),
      stock: this.num(sku.sku_available_stock ?? sku.s_k_u_available_stock ?? 0),
      imageUrl: typeof sku.sku_img === 'string' ? sku.sku_img : undefined,
    }));
    const costPrice = variants[0]?.costPrice || this.num(base.target_sale_price ?? base.sale_price);
    const stock = variants.reduce((sum, variant) => sum + variant.stock, 0) || this.num(base.product_stock);
    const id = String(base.product_id ?? fallbackId);

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
}
