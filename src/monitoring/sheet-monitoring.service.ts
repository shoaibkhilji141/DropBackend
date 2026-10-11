import { Inject, Injectable, Logger } from '@nestjs/common';
import { ListingStatus, MonitoringType, Platform, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { GoogleSheetsClient, SheetPairRow, SheetReadOptions } from '../integrations/google-sheets/google-sheets.client';
import { EbayItemVariation, EbayRestClient } from '../integrations/ebay/ebay-rest.client';
import {
  SUPPLIER_PRODUCT_PROVIDER,
  SupplierProductProvider,
} from '../integrations/aliexpress/aliexpress.types';
import { UsersService } from '../users/users.service';
import { SaveGoogleSheetDto } from './dto/sheet-monitoring.dto';
import { matchEbayToSupplier, parseVariationJson } from './sheet-variation-match';
import {
  GoogleSheetRefreshProgress,
  GoogleSheetRowView,
  GoogleSheetSourceView,
  GoogleSheetState,
  GoogleSheetSyncResult,
  GoogleSheetVariationView,
} from './sheet-monitoring.types';

const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1WAJKwx-cWvZGeV5Z2kMpZ6eBHGoi7-FNljYMT_s8Pas/edit?usp=sharing';
const DEFAULT_WORKSHEET = 'Product to Upload';
const RULE_INTERVAL_MINUTES = 60;
const TAX_PERCENT = 10;
const EBAY_REFRESH_CONCURRENCY = 6;

const SOURCE_INCLUDE = {
  rows: {
    include: {
      product: {
        include: {
          monitoringRules: true,
          priceHistory: { orderBy: { recordedAt: 'desc' as const }, take: 1 },
          stockHistory: { orderBy: { recordedAt: 'desc' as const }, take: 1 },
        },
      },
      listing: true,
    },
    orderBy: { sheetRow: 'asc' as const },
  },
} satisfies Prisma.GoogleSheetSourceInclude;

type SourceRecord = Prisma.GoogleSheetSourceGetPayload<{ include: typeof SOURCE_INCLUDE }>;
type RowRecord = SourceRecord['rows'][number];

@Injectable()
export class SheetMonitoringService {
  private readonly logger = new Logger(SheetMonitoringService.name);
  private refreshJob: GoogleSheetRefreshProgress = {
    running: false,
    done: 0,
    total: 0,
    lastError: null,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly sheets: GoogleSheetsClient,
    private readonly users: UsersService,
    private readonly ebay: EbayRestClient,
    @Inject(SUPPLIER_PRODUCT_PROVIDER)
    private readonly supplier: SupplierProductProvider,
  ) {}

  async getState(): Promise<GoogleSheetState> {
    const source = await this.loadSource();
    return {
      source: source ? this.toSourceView(source) : null,
      rows: source ? source.rows.map((row) => this.toRowView(row)) : [],
      taxPercent: TAX_PERCENT,
      refresh: { ...this.refreshJob },
      defaults: {
        spreadsheetUrl: source?.spreadsheetUrl ?? DEFAULT_SHEET_URL,
        worksheetName: source?.worksheetName ?? DEFAULT_WORKSHEET,
        supplierColumn: source?.supplierColumn ?? 2,
        ebayColumn: source?.ebayColumn ?? 3,
        titleColumn: source?.titleColumn ?? 4,
      },
    };
  }

  async refresh(): Promise<GoogleSheetState> {
    if (!this.refreshJob.running) {
      void this.runRefresh().catch((error: unknown) => {
        this.refreshJob.running = false;
        this.refreshJob.lastError = error instanceof Error ? error.message : 'Refresh failed';
        this.logger.error(this.refreshJob.lastError);
      });
    }
    return this.getState();
  }

  async save(dto: SaveGoogleSheetDto): Promise<GoogleSheetSourceView> {
    const source = await this.upsertSource(dto);
    return this.toSourceView(source);
  }

  async preview(dto?: SaveGoogleSheetDto): Promise<GoogleSheetRowView[]> {
    const options = await this.resolveOptions(dto);
    const pairs = await this.sheets.readPairs(options);
    return pairs.map((pair) => this.previewRow(pair));
  }

  async sync(dto?: SaveGoogleSheetDto): Promise<GoogleSheetSyncResult> {
    const user = await this.users.findCurrent();
    const source = await this.upsertSource(dto);
    const pairs = await this.sheets.readPairs({
      spreadsheetUrl: source.spreadsheetUrl,
      worksheetName: source.worksheetName,
      supplierColumn: source.supplierColumn,
      ebayColumn: source.ebayColumn,
      titleColumn: source.titleColumn,
    });

    const store = await this.prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });
    const supplier = await this.prisma.supplier.upsert({
      where: { externalId: 'sheet-aliexpress' },
      create: { externalId: 'sheet-aliexpress', name: 'AliExpress', platform: Platform.ALIEXPRESS },
      update: {},
    });

    const supplierIds = pairs
      .map((pair) => this.aliexpressId(pair.supplierUrl))
      .filter((id): id is string => Boolean(id));
    const ebayIds = pairs
      .map((pair) => this.ebayId(pair.ebayUrl))
      .filter((id): id is string => Boolean(id));
    const [existingProducts, existingListings] = await Promise.all([
      this.prisma.product.findMany({
        where: { userId: user.id, externalId: { in: supplierIds } },
        select: { id: true, externalId: true },
      }),
      this.prisma.listing.findMany({
        where: { OR: [{ externalId: { in: ebayIds } }, { productId: { in: source.rows.map((row) => row.productId).filter((id): id is string => Boolean(id)) } }] },
        select: { id: true, externalId: true, productId: true, itemUrl: true },
      }),
    ]);
    const productByExternal = new Map(
      existingProducts
        .filter((product): product is { id: string; externalId: string } => Boolean(product.externalId))
        .map((product) => [product.externalId, product.id]),
    );
    const listingByExternal = new Map(
      existingListings
        .filter((listing) => listing.externalId)
        .map((listing) => [listing.externalId as string, listing]),
    );

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const pair of pairs) {
      const existing = source.rows.find((row) => row.sheetRow === pair.sheetRow);
      try {
        const result = await this.syncPairLocal({
          sourceId: source.id,
          pair,
          existing,
          userId: user.id,
          supplierId: supplier.id,
          storeId: store?.id ?? null,
          productByExternal,
          listingByExternal,
        });
        if (result === 'SKIPPED') skipped += 1;
        else if (existing?.productId) updated += 1;
        else imported += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Row sync failed';
        this.logger.warn(`Sheet row ${pair.sheetRow} failed: ${message}`);
        await this.prisma.googleSheetRow.upsert({
          where: { sourceId_sheetRow: { sourceId: source.id, sheetRow: pair.sheetRow } },
          create: {
            sourceId: source.id,
            sheetRow: pair.sheetRow,
            title: pair.title,
            supplierUrl: pair.supplierUrl,
            ebayUrl: pair.ebayUrl,
            supplierId: this.aliexpressId(pair.supplierUrl),
            ebayItemId: this.ebayId(pair.ebayUrl),
            status: 'FAILED',
            lastError: message.slice(0, 500),
          },
          update: {
            title: pair.title,
            supplierUrl: pair.supplierUrl,
            ebayUrl: pair.ebayUrl,
            supplierId: this.aliexpressId(pair.supplierUrl),
            ebayItemId: this.ebayId(pair.ebayUrl),
            status: 'FAILED',
            lastError: message.slice(0, 500),
          },
        });
      }
    }

    const refreshed = await this.prisma.googleSheetSource.update({
      where: { id: source.id },
      data: {
        lastSyncedAt: new Date(),
        lastError: failed > 0 ? `${failed} row(s) failed` : null,
        lastStatus: failed > 0 && imported + updated === 0 ? 'FAILED' : 'SUCCESS',
      },
      include: SOURCE_INCLUDE,
    });

    return {
      source: this.toSourceView(refreshed),
      imported,
      updated,
      skipped,
      failed,
      rows: refreshed.rows.map((row) => this.toRowView(row)),
    };
  }

  private async syncPairLocal(input: {
    sourceId: string;
    pair: SheetPairRow;
    existing?: RowRecord;
    userId: string;
    supplierId: string;
    storeId: string | null;
    productByExternal: Map<string, string>;
    listingByExternal: Map<string, { id: string; externalId: string | null; productId: string; itemUrl: string | null }>;
  }): Promise<'IMPORTED' | 'SKIPPED'> {
    const { sourceId, pair, existing } = input;
    const aliId = this.aliexpressId(pair.supplierUrl);
    const ebayItemId = this.ebayId(pair.ebayUrl);
    if (!aliId || !ebayItemId) {
      await this.prisma.googleSheetRow.upsert({
        where: { sourceId_sheetRow: { sourceId, sheetRow: pair.sheetRow } },
        create: {
          sourceId,
          sheetRow: pair.sheetRow,
          title: pair.title,
          supplierUrl: pair.supplierUrl,
          ebayUrl: pair.ebayUrl,
          supplierId: aliId,
          ebayItemId,
          status: 'SKIPPED',
          lastError: !aliId
            ? 'Column B has no AliExpress product link'
            : 'Column C has no eBay listing link',
        },
        update: {
          title: pair.title,
          supplierUrl: pair.supplierUrl,
          ebayUrl: pair.ebayUrl,
          supplierId: aliId,
          ebayItemId,
          status: 'SKIPPED',
          lastError: !aliId
            ? 'Column B has no AliExpress product link'
            : 'Column C has no eBay listing link',
        },
      });
      return 'SKIPPED';
    }

    const title = (pair.title ?? existing?.title ?? `AliExpress ${aliId}`).slice(0, 200);
    let productId = input.productByExternal.get(aliId) ?? existing?.productId ?? null;
    if (!productId) {
      const created = await this.prisma.product.create({
        data: {
          userId: input.userId,
          supplierId: input.supplierId,
          externalId: aliId,
          title,
          sourceUrl: pair.supplierUrl,
          status: ProductStatus.SAVED,
        },
        select: { id: true },
      });
      productId = created.id;
      input.productByExternal.set(aliId, productId);
    } else {
      await this.prisma.product.update({
        where: { id: productId },
        data: {
          title,
          sourceUrl: pair.supplierUrl,
          supplierId: input.supplierId,
        },
      });
    }

    let listingId = input.listingByExternal.get(ebayItemId)?.id ?? existing?.listingId ?? null;
    if (!listingId) {
      const created = await this.prisma.listing.create({
        data: {
          productId,
          storeId: input.storeId,
          externalId: ebayItemId,
          title: title.slice(0, 80),
          sku: aliId,
          itemUrl: pair.ebayUrl,
          status: ListingStatus.PUBLISHED,
          publishedAt: new Date(),
        },
        select: { id: true },
      });
      listingId = created.id;
      input.listingByExternal.set(ebayItemId, {
        id: listingId,
        externalId: ebayItemId,
        productId,
        itemUrl: pair.ebayUrl,
      });
    } else {
      await this.prisma.listing.update({
        where: { id: listingId },
        data: {
          productId,
          storeId: input.storeId,
          externalId: ebayItemId,
          title: title.slice(0, 80),
          itemUrl: pair.ebayUrl,
          status: ListingStatus.PUBLISHED,
        },
      });
    }

    await this.ensureRules(productId);

    await this.prisma.googleSheetRow.upsert({
      where: { sourceId_sheetRow: { sourceId, sheetRow: pair.sheetRow } },
      create: {
        sourceId,
        sheetRow: pair.sheetRow,
        title,
        supplierUrl: pair.supplierUrl,
        ebayUrl: pair.ebayUrl,
        supplierId: aliId,
        ebayItemId,
        productId,
        listingId,
        status: 'IMPORTED',
        lastError: null,
      },
      update: {
        title,
        supplierUrl: pair.supplierUrl,
        ebayUrl: pair.ebayUrl,
        supplierId: aliId,
        ebayItemId,
        productId,
        listingId,
        status: 'IMPORTED',
        lastError: null,
      },
    });
    return 'IMPORTED';
  }

  private async runRefresh(): Promise<void> {
    const source = await this.loadSource();
    const rows = (source?.rows ?? []).filter(
      (row) => row.status === 'IMPORTED' && row.productId && (row.supplierId || row.ebayItemId),
    );
    this.refreshJob = { running: true, done: 0, total: rows.length, lastError: null };

    const ebayVariations = new Map<string, EbayItemVariation[]>();
    const ebayErrors = new Map<string, string>();
    const ebayFetched = new Set<string>();

    try {
    await this.mapPool(rows, EBAY_REFRESH_CONCURRENCY, async (row) => {
      if (!row.ebayItemId) return;
      try {
        const live = await this.ebay.getItemDetail(row.ebayItemId, {
          variationId: this.ebayVariationId(row.ebayUrl),
        });
        const variations = live.variations ?? [];
        if (row.id) {
          ebayFetched.add(row.id);
          if (variations.length) ebayVariations.set(row.id, variations);
        }
        const quantity = variations.length
          ? variations.reduce((sum, variation) => sum + variation.quantity, 0)
          : live.availableQuantity;
        const price = this.pickEbayPrice(live.price, variations, row.ebayUrl) || row.listing?.price || 0;
        const data = {
          price,
          itemUrl: live.itemUrl || row.ebayUrl,
          title: (live.title || row.title || row.listing?.title || 'eBay listing').slice(0, 80),
          externalId: row.ebayItemId,
          status: ListingStatus.PUBLISHED,
          ...(quantity != null ? { quantity } : {}),
        };
        if (row.id) {
          await this.prisma.googleSheetRow.update({
            where: { id: row.id },
            data: {
              variationJson: variations.length
                ? JSON.stringify(
                    matchEbayToSupplier(variations, [], 0, parseVariationJson(row.variationJson)),
                  )
                : null,
            },
          });
        }
        if (row.listingId) {
          await this.prisma.listing.update({ where: { id: row.listingId }, data });
        } else if (row.productId) {
          const created = await this.prisma.listing.create({
            data: {
              ...data,
              quantity: quantity ?? 0,
              productId: row.productId,
              sku: row.supplierId,
              publishedAt: new Date(),
            },
            select: { id: true },
          });
          if (row.id) {
            await this.prisma.googleSheetRow.update({
              where: { id: row.id },
              data: { listingId: created.id },
            });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'eBay refresh failed';
        this.logger.warn(`eBay refresh failed for ${row.ebayItemId}: ${message}`);
        if (row.id) ebayErrors.set(row.id, message.slice(0, 500));
      }
    });

    for (const row of rows) {
      try {
        if (row.productId && row.supplierId) {
          await this.refreshSupplier(
            row,
            row.id ? ebayVariations.get(row.id) ?? [] : [],
            Boolean(row.id && ebayFetched.has(row.id)),
          );
        }
        if (row.id) {
          await this.prisma.googleSheetRow.update({
            where: { id: row.id },
            data: { lastError: ebayErrors.get(row.id) ?? null, status: 'IMPORTED' },
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AliExpress refresh failed';
        this.logger.warn(`AliExpress refresh failed for row ${row.sheetRow}: ${message}`);
        if (row.id) {
          await this.prisma.googleSheetRow.update({
            where: { id: row.id },
            data: { lastError: message.slice(0, 500) },
          });
        }
        this.refreshJob.lastError = message;
      } finally {
        this.refreshJob.done += 1;
      }
    }
    } finally {
      this.refreshJob.running = false;
    }
  }

  private async refreshSupplier(
    row: RowRecord,
    liveEbayVariations: EbayItemVariation[],
    ebayFetched: boolean,
  ): Promise<void> {
    if (!row.productId || !row.supplierId || !row.product) return;
    const live = await this.supplier.getByExternalId(row.supplierId, { includeFreight: true });
    if (!live) {
      throw new Error(`AliExpress product ${row.supplierId} was not found`);
    }
    const previousSnapshots = parseVariationJson(row.variationJson);
    const ebayVariations =
      liveEbayVariations.length > 0
        ? liveEbayVariations
        : ebayFetched
          ? []
          : previousSnapshots.map((snapshot) => ({
              sku: snapshot.ebaySku,
              price: snapshot.ebayPrice ?? 0,
              currency: 'GBP',
              quantity: snapshot.ebayQuantity ?? 0,
              soldCount: 0,
              specifics: [],
              label: snapshot.label,
              imageUrl: null,
            }));
    const variations = ebayVariations.length
      ? matchEbayToSupplier(ebayVariations, live.variants, live.shippingCost, previousSnapshots)
      : [];
    if (row.id) {
      await this.prisma.googleSheetRow.update({
        where: { id: row.id },
        data: { variationJson: variations.length ? JSON.stringify(variations) : null },
      });
    }
    const matched = variations.filter((variation) => variation.matched);
    const landed =
      matched[0]?.supplierPrice ?? roundMoney(live.costPrice + live.shippingCost);
    const liveStock = matched.length
      ? matched.reduce((sum, variation) => sum + (variation.supplierStock ?? 0), 0)
      : live.stock;
    const previousPrice = row.product.costPrice;
    const previousStock = row.product.stock;
    const priceChanged = previousPrice > 0 && landed !== roundMoney(previousPrice);
    const stockChanged = previousStock !== liveStock;

    if (priceChanged || row.product.priceHistory.length === 0) {
      await this.prisma.priceHistory.create({
        data: {
          productId: row.productId,
          price: landed,
          previousPrice: previousPrice > 0 ? previousPrice : null,
          currency: 'GBP',
        },
      });
    }
    if (stockChanged || row.product.stockHistory.length === 0) {
      await this.prisma.stockHistory.create({
        data: {
          productId: row.productId,
          stock: liveStock,
          previousStock: row.product.stockHistory.length === 0 && previousStock === 0 ? null : previousStock,
        },
      });
    }

    await this.prisma.product.update({
      where: { id: row.productId },
      data: {
        costPrice: landed,
        shippingCost: live.shippingCost,
        stock: liveStock,
        currency: 'GBP',
        shippingMethod:
          [...live.shippingOptions].sort((left, right) => left.cost - right.cost)[0]?.method ??
          row.product.shippingMethod,
        shippingEtaDays: live.shippingEtaDays,
        title: row.title || live.title,
        sourceUrl: live.sourceUrl || row.supplierUrl,
        imageUrl: live.images[0] ?? row.product.imageUrl,
      },
    });
  }

  private async mapPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
    let index = 0;
    const run = async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        await worker(items[current]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(size, Math.max(items.length, 1)) }, () => run()));
  }

  private async ensureRules(productId: string): Promise<void> {
    const existing = await this.prisma.monitoringRule.findMany({ where: { productId } });
    const types = new Set(existing.map((rule) => rule.type));
    const create = [MonitoringType.PRICE, MonitoringType.STOCK].filter((type) => !types.has(type));
    if (create.length === 0) return;
    await this.prisma.monitoringRule.createMany({
      data: create.map((type) => ({
        productId,
        type,
        threshold: type === MonitoringType.PRICE ? 1 : 1,
        intervalMinutes: RULE_INTERVAL_MINUTES,
        enabled: true,
        nextRunAt: new Date(),
        lastStatus: 'IDLE',
      })),
    });
  }

  private async upsertSource(dto?: SaveGoogleSheetDto): Promise<SourceRecord> {
    const user = await this.users.findCurrent();
    const current = await this.prisma.googleSheetSource.findUnique({
      where: { userId: user.id },
    });
    const spreadsheetUrl = dto?.spreadsheetUrl?.trim() || current?.spreadsheetUrl || DEFAULT_SHEET_URL;
    const spreadsheetId = this.sheets.spreadsheetIdFromUrl(spreadsheetUrl);
    const data = {
      spreadsheetUrl,
      spreadsheetId,
      worksheetName: dto?.worksheetName?.trim() || current?.worksheetName || DEFAULT_WORKSHEET,
      supplierColumn: dto?.supplierColumn ?? current?.supplierColumn ?? 2,
      ebayColumn: dto?.ebayColumn ?? current?.ebayColumn ?? 3,
      titleColumn: dto?.titleColumn ?? current?.titleColumn ?? 4,
    };

    return this.prisma.googleSheetSource.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
      include: SOURCE_INCLUDE,
    });
  }

  private async resolveOptions(dto?: SaveGoogleSheetDto): Promise<SheetReadOptions> {
    const source = await this.loadSource();
    const spreadsheetUrl = dto?.spreadsheetUrl?.trim() || source?.spreadsheetUrl || DEFAULT_SHEET_URL;
    this.sheets.spreadsheetIdFromUrl(spreadsheetUrl);
    return {
      spreadsheetUrl,
      worksheetName: dto?.worksheetName?.trim() || source?.worksheetName || DEFAULT_WORKSHEET,
      supplierColumn: dto?.supplierColumn ?? source?.supplierColumn ?? 2,
      ebayColumn: dto?.ebayColumn ?? source?.ebayColumn ?? 3,
      titleColumn: dto?.titleColumn ?? source?.titleColumn ?? 4,
    };
  }

  private async loadSource(): Promise<SourceRecord | null> {
    const user = await this.users.findCurrent();
    return this.prisma.googleSheetSource.findUnique({
      where: { userId: user.id },
      include: SOURCE_INCLUDE,
    });
  }

  aliexpressId(url: string): string | null {
    const trimmed = url.trim();
    if (/^\d{6,20}$/.test(trimmed)) return trimmed;
    const item = trimmed.match(/\/item\/(\d{6,20})(?:\.html)?/i);
    if (item) return item[1];
    const query = trimmed.match(/[?&](?:productId|itemId|product_id)=(\d{6,20})/i);
    return query?.[1] ?? null;
  }

  ebayId(url: string): string | null {
    const trimmed = url.trim();
    if (/^\d{9,16}$/.test(trimmed)) return trimmed;
    const itm = trimmed.match(/\/itm\/(?:[^/?]+\/)?(\d{9,16})/i);
    if (itm) return itm[1];
    const query = trimmed.match(/[?&](?:item|itm|legacyItemId)=(\d{9,16})/i);
    return query?.[1] ?? null;
  }

  ebayVariationId(url: string): string | null {
    return url.match(/[?&](?:var|vti|legacy_variation_id)=(\d{6,20})/i)?.[1] ?? null;
  }

  private pickEbayPrice(fallback: number, variations: EbayItemVariation[], ebayUrl: string): number {
    const variationId = this.ebayVariationId(ebayUrl);
    if (variationId) {
      const match = variations.find((variation) => variation.sku === variationId);
      if (match && match.price > 0) return match.price;
    }
    const priced = variations.find((variation) => variation.price > 0);
    return priced?.price || fallback || 0;
  }

  private previewRow(pair: SheetPairRow): GoogleSheetRowView {
    const supplierId = this.aliexpressId(pair.supplierUrl);
    const ebayItemId = this.ebayId(pair.ebayUrl);
    const ready = Boolean(supplierId && ebayItemId);
    return {
      id: null,
      sheetRow: pair.sheetRow,
      title: pair.title,
      supplierUrl: pair.supplierUrl,
      ebayUrl: pair.ebayUrl,
      supplierId,
      ebayItemId,
      productId: null,
      listingId: null,
      status: ready ? 'READY' : 'SKIPPED',
      lastError: ready
        ? null
        : !supplierId
          ? 'Column B has no AliExpress product link'
          : 'Column C has no eBay listing link',
      ...this.emptyCompare(),
      priceRuleEnabled: false,
      stockRuleEnabled: false,
    };
  }

  private toSourceView(source: SourceRecord | Prisma.GoogleSheetSourceGetPayload<object>): GoogleSheetSourceView {
    return {
      id: source.id,
      spreadsheetUrl: source.spreadsheetUrl,
      spreadsheetId: source.spreadsheetId,
      worksheetName: source.worksheetName,
      supplierColumn: source.supplierColumn,
      ebayColumn: source.ebayColumn,
      titleColumn: source.titleColumn,
      lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
      lastError: source.lastError,
      lastStatus: source.lastStatus,
      updatedAt: source.updatedAt.toISOString(),
    };
  }

  private toRowView(row: RowRecord): GoogleSheetRowView {
    const rules = row.product?.monitoringRules ?? [];
    const supplierPrice = row.product && row.product.costPrice > 0 ? row.product.costPrice : null;
    const latestPrice = row.product?.priceHistory[0];
    const previousSupplierPrice =
      latestPrice?.previousPrice ??
      (latestPrice && latestPrice.price !== supplierPrice ? latestPrice.price : null);
    const supplierStock = row.product ? row.product.stock : null;
    const latestStock = row.product?.stockHistory[0];
    const previousSupplierStock =
      latestStock?.previousStock ??
      (latestStock && latestStock.stock !== supplierStock ? latestStock.stock : null);
    const variations = parseVariationJson(row.variationJson).map((variation) =>
      this.withVariationProfit(variation),
    );
    const matched = variations.filter((variation) => variation.matched);
    const ebayPrice =
      variations.find((variation) => variation.ebayPrice && variation.ebayPrice > 0)?.ebayPrice ??
      (row.listing && row.listing.price > 0 ? row.listing.price : null);
    const supplierPriceResolved =
      matched[0]?.supplierPrice ?? supplierPrice;
    const supplierStockResolved = matched.length
      ? matched.reduce((sum, variation) => sum + (variation.supplierStock ?? 0), 0)
      : supplierStock;
    const ebayFailed = Boolean(row.lastError && /eBay|not connected|Could not read/i.test(row.lastError));
    const copiedSupplierStock =
      variations.length === 0 &&
      supplierStockResolved != null &&
      row.listing != null &&
      row.listing.quantity === supplierStockResolved &&
      supplierStockResolved >= 10;
    const ebayQuantity = variations.length
      ? variations.reduce((sum, variation) => sum + (variation.ebayQuantity ?? 0), 0)
      : ebayFailed || copiedSupplierStock
        ? null
        : row.listing?.quantity ?? null;
    const compare = this.profitFields(ebayPrice, supplierPriceResolved);

    return {
      id: row.id,
      sheetRow: row.sheetRow,
      title: row.title ?? row.product?.title ?? row.listing?.title ?? null,
      supplierUrl: row.supplierUrl,
      ebayUrl: row.ebayUrl || row.listing?.itemUrl || '',
      supplierId: row.supplierId,
      ebayItemId: row.ebayItemId,
      productId: row.productId,
      listingId: row.listingId,
      status: row.status,
      lastError: row.lastError,
      supplierPrice: supplierPriceResolved,
      previousSupplierPrice,
      supplierPriceChanged: Boolean(
        supplierPriceResolved !== null &&
          previousSupplierPrice !== null &&
          previousSupplierPrice > 0 &&
          supplierPriceResolved !== previousSupplierPrice,
      ),
      supplierStock: supplierStockResolved,
      previousSupplierStock,
      supplierStockChanged: Boolean(
        supplierStockResolved !== null &&
          previousSupplierStock !== null &&
          previousSupplierStock > 0 &&
          supplierStockResolved !== previousSupplierStock,
      ),
      supplierShipping: row.product?.shippingCost ?? null,
      supplierCurrency: 'GBP',
      ebayPrice,
      ebayQuantity,
      ebayCurrency: 'GBP',
      taxPercent: TAX_PERCENT,
      taxAmount: compare.taxAmount,
      netEbay: compare.netEbay,
      profit: compare.profit,
      profitPercent: compare.profitPercent,
      priceRuleEnabled: rules.some((rule) => rule.type === MonitoringType.PRICE && rule.enabled),
      stockRuleEnabled: rules.some((rule) => rule.type === MonitoringType.STOCK && rule.enabled),
      variations,
    };
  }

  private withVariationProfit(variation: GoogleSheetVariationView): GoogleSheetVariationView {
    return { ...variation, ...this.profitFields(variation.ebayPrice, variation.supplierPrice) };
  }

  private profitFields(ebayPrice: number | null, supplierPrice: number | null) {
    const taxAmount = ebayPrice !== null ? roundMoney((ebayPrice * TAX_PERCENT) / 100) : null;
    const netEbay = ebayPrice !== null && taxAmount !== null ? roundMoney(ebayPrice - taxAmount) : null;
    const profit =
      netEbay !== null && supplierPrice !== null ? roundMoney(netEbay - supplierPrice) : null;
    const profitPercent =
      profit !== null && supplierPrice && supplierPrice > 0
        ? roundMoney((profit / supplierPrice) * 100)
        : null;
    return { taxAmount, netEbay, profit, profitPercent };
  }

  private emptyCompare(): Pick<
    GoogleSheetRowView,
    | 'supplierPrice'
    | 'previousSupplierPrice'
    | 'supplierPriceChanged'
    | 'supplierStock'
    | 'previousSupplierStock'
    | 'supplierStockChanged'
    | 'supplierShipping'
    | 'supplierCurrency'
    | 'ebayPrice'
    | 'ebayQuantity'
    | 'ebayCurrency'
    | 'taxPercent'
    | 'taxAmount'
    | 'netEbay'
    | 'profit'
    | 'profitPercent'
    | 'variations'
  > {
    return {
      supplierPrice: null,
      previousSupplierPrice: null,
      supplierPriceChanged: false,
      supplierStock: null,
      previousSupplierStock: null,
      supplierStockChanged: false,
      supplierShipping: null,
      supplierCurrency: 'GBP',
      ebayPrice: null,
      ebayQuantity: null,
      ebayCurrency: null,
      taxPercent: TAX_PERCENT,
      taxAmount: null,
      netEbay: null,
      profit: null,
      profitPercent: null,
      variations: [],
    };
  }
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100;
