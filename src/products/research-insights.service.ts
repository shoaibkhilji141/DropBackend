import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CacheService } from '../common/cache/cache.service';
import { sanitizeListingHtml, toHttpsImage } from '../common/html';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { EbayConfig } from '../config/configuration';
import {
  SUPPLIER_PRODUCT_PROVIDER,
  SupplierProduct,
  SupplierProductProvider,
} from '../integrations/aliexpress/aliexpress.types';
import {
  EbayCategoryAspect,
  EbayItemDetail,
  EbayMarketplaceItem,
  EbayRestClient,
} from '../integrations/ebay/ebay-rest.client';
import { EbayService } from '../integrations/ebay/ebay.service';
import { MarketplaceListingAspect } from '../integrations/marketplace/marketplace.types';
import { ListingsService } from '../listings/listings.service';
import { ListingView } from '../listings/listings.types';
import { ProfitService } from '../profit/profit.service';
import { UsersService } from '../users/users.service';
import { scanEbayUkPolicy } from '../ai/ebay-listing-policy';
import { ListOnEbayDto, MatchAliExpressQueryDto } from './dto/product.dto';
import {
  minePhrases,
  searchSeed,
  titleContainsPhrase,
} from './keyword-mining';
import { ProductsService } from './products.service';
import { ProductView, ResearchSearchResultView } from './products.types';
import {
  AliExpressInsightView,
  EbayItemInsightView,
  KeywordInsightsView,
  KeywordRow,
  ListingCompareConclusion,
  ListingCompareRow,
  ListingCompareView,
  SalesDiagnosisItem,
  ImageReviewView,
  SalesDiagnosisView,
  SalesHistoryView,
  SalesObservationRow,
  SalesVelocityRow,
  SeoAspectSuggestion,
  SeoChecklistItem,
  SeoRecommendationView,
} from './research-insights.types';

const SEARCH_TTL_MS = 90_000;
const ITEM_TTL_MS = 5 * 60_000;
const SUGGEST_TTL_MS = 10 * 60_000;
const ASPECT_TTL_MS = 24 * 60 * 60_000;
const AI_SEO_TTL_MS = 30 * 60_000;
const AI_SEO_TIMEOUT_MS = 8_000;
const SNAPSHOT_GAP_MS = 2 * 60_000;

export interface ListOnEbayResult {
  product: ProductView;
  listing: ListingView;
  published: boolean;
  ebayUrl: string | null;
  error: string | null;
}

@Injectable()
export class ResearchInsightsService {
  private readonly logger = new Logger(ResearchInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly ebayClient: EbayRestClient,
    private readonly ebay: EbayService,
    private readonly products: ProductsService,
    private readonly listings: ListingsService,
    private readonly ai: AiService,
    private readonly profit: ProfitService,
    private readonly users: UsersService,
    private readonly configService: ConfigService,
    @Inject(SUPPLIER_PRODUCT_PROVIDER)
    private readonly supplier: SupplierProductProvider,
  ) {}

  marketplaceId(): string {
    return this.configService.get<EbayConfig>('ebay')?.marketplaceId ?? 'EBAY_GB';
  }

  async searchMarketplaceCached(query: {
    q?: string;
    categoryId?: string;
    minPrice?: number;
    maxPrice?: number;
    condition?: string;
    sort?: string;
    limit?: number;
    page?: number;
  }) {
    const limit = Math.min(Math.max(query.limit ?? 24, 1), 50);
    const page = Math.min(Math.max(query.page ?? 1, 1), 200);
    const offset = (page - 1) * limit;
    const key = this.cache.key('ebay:search', { ...query, limit, page });
    const result = await this.cache.wrap(key, SEARCH_TTL_MS, () =>
      this.ebay.searchMarketplace({ ...query, limit, offset }),
    );
    // Do not keep a page of 0-sold cards if enrichment failed this turn.
    if (result.items.length > 0 && result.items.every((item) => !item.soldCount)) {
      this.cache.invalidate(key);
    }
    return result;
  }

  async getInsight(itemId: string): Promise<EbayItemInsightView> {
    const trimmed = itemId.trim();
    if (!trimmed) {
      throw new BadRequestException('An eBay item id is required.');
    }

    const sellerToken = await this.ebay.resolveSellerToken('').catch(() => null);
    const item = await this.cache.wrap(`ebay:item:v6:${trimmed}`, ITEM_TTL_MS, () =>
      this.ebayClient.getItemDetail(trimmed, { sellerToken }),
    );

    const seed = searchSeed(item.title);
    await this.recordSnapshot(item);

    const [competitors, suggestions, categoryAspects, snapshots] = await Promise.all([
      this.cache.wrap(`ebay:competitors:${seed}`, SEARCH_TTL_MS, () =>
        this.ebayClient.searchMarketplace({ q: seed, limit: 20, sort: 'sold' }).then((result) => result.items),
      ),
      this.cache.wrap(`ebay:suggest:${seed}`, SUGGEST_TTL_MS, () =>
        this.ebayClient.searchSuggestions(seed),
      ),
      item.categoryId
        ? this.cache.wrap(`ebay:aspects:${item.categoryId}`, ASPECT_TTL_MS, () =>
            this.ebayClient.categoryAspects(item.categoryId as string),
          )
        : Promise.resolve([] as EbayCategoryAspect[]),
      this.prisma.ebaySalesSnapshot.findMany({
        where: { OR: [{ itemId: item.itemId }, { legacyItemId: item.legacyItemId ?? undefined }] },
        orderBy: { capturedAt: 'desc' },
        take: 40,
      }),
    ]);

    const peers = competitors.filter((listing) => listing.itemId !== item.itemId && listing.soldCount > 0);
    const keywords = this.buildKeywords(item, peers.length ? peers : competitors, suggestions);
    const sales = this.buildSales(item, snapshots);
    const diagnosis = this.buildDiagnosis(item, peers, keywords, categoryAspects);
    const seo = await this.buildSeo(item, keywords, categoryAspects, diagnosis);
    const imageReview = this.buildImageReview(item, seo);

    return {
      item,
      marketplace: this.marketplaceId(),
      aliexpressQuery: seed,
      sales,
      keywords,
      seo,
      competitors: peers.slice(0, 12),
      diagnosis,
      imageReview,
    };
  }

  async optimizeListing(url: string): Promise<EbayItemInsightView> {
    const itemId = this.ebayClient.listingIdFromInput(url);
    if (!itemId) {
      throw new BadRequestException(
        'Paste a full eBay listing link, for example https://www.ebay.co.uk/itm/123456789012',
      );
    }
    return this.getInsight(itemId);
  }

  async compareListings(yoursUrl: string, competitorUrl: string): Promise<ListingCompareView> {
    const yoursId = this.ebayClient.listingIdFromInput(yoursUrl);
    const competitorId = this.ebayClient.listingIdFromInput(competitorUrl);
    if (!yoursId || !competitorId) {
      throw new BadRequestException(
        'Paste two full eBay listing links, for example https://www.ebay.co.uk/itm/123456789012',
      );
    }
    if (yoursId === competitorId) {
      throw new BadRequestException('Use two different listings — your product and a competitor with sales.');
    }

    const sellerToken = await this.ebay.resolveSellerToken('').catch(() => null);
    const load = (itemId: string) =>
      this.cache.wrap(`ebay:item:v6:${itemId}`, ITEM_TTL_MS, () =>
        this.ebayClient.getItemDetail(itemId, { sellerToken }),
      );
    const [yours, competitor] = await Promise.all([load(yoursId), load(competitorId)]);
    const diffs = this.buildCompareDiffs(yours, competitor);
    const conclusion = await this.buildCompareConclusion(yours, competitor, diffs);
    return {
      yours,
      competitor,
      marketplace: this.marketplaceId(),
      diffs,
      conclusion,
    };
  }

  async getAliExpressInsight(externalId: string): Promise<AliExpressInsightView> {
    const trimmed = externalId.trim();
    if (!trimmed) throw new BadRequestException('An AliExpress product id is required.');

    const product = await this.cache.wrap(`ali:item:${trimmed}`, ITEM_TTL_MS, () =>
      this.products.getSupplierProduct(trimmed),
    );
    const seed = searchSeed(product.title, 4) || product.title.slice(0, 40);

    const [similarResult, ebayResult] = await Promise.all([
      this.products.searchSupplier({ search: seed, sort: 'ordersDesc', page: 1, pageSize: 8 }),
      this.cache.wrap(`ebay:for-ali:${seed}`, SEARCH_TTL_MS, () =>
        this.ebay.searchMarketplace({ q: seed, limit: 8, sort: 'sold' }).catch((error: unknown) => {
          this.logger.warn(
            `eBay match for AliExpress insight failed: ${error instanceof Error ? error.message : error}`,
          );
          return {
            items: [],
            marketplace: this.marketplaceId(),
            page: 1,
            pageSize: 8,
            pageCount: 1,
            total: 0,
          };
        }),
      ),
    ]);

    const similar = similarResult.items
      .filter((item) => item.externalId !== product.externalId)
      .slice(0, 6);

    const mined = minePhrases(
      [
        { title: product.title, soldCount: product.orders },
        ...similar.map((item) => ({ title: item.title, soldCount: item.orders })),
      ],
      { minListings: 1, limit: 20 },
    );
    const sampleUnitsSold = Math.max(mined.sampleUnitsSold, 1);
    const topPhrases: KeywordRow[] = mined.phrases.map((phrase) => ({
      phrase: phrase.phrase,
      words: phrase.words,
      listings: phrase.listings,
      unitsSold: phrase.unitsSold,
      soldShare: Number((phrase.unitsSold / sampleUnitsSold).toFixed(3)),
      inTitle: titleContainsPhrase(product.title, phrase.phrase),
      source: 'competitors',
    }));

    const specs = (product.specs ?? []).map((spec) => `${spec.name}: ${spec.value}`);
    const policy = scanEbayUkPolicy({
      title: product.title,
      description: product.description,
      category: product.category,
      specs,
      variants: (product.variants ?? []).map((variant) => variant.attributes || variant.name),
      costPrice: product.costPrice,
      currency: product.currency,
    });

    return {
      product,
      ebayQuery: seed,
      similar,
      ebayMatches: ebayResult.items,
      keywords: {
        seed,
        sampleListings: mined.sampleListings,
        sampleUnitsSold: mined.sampleUnitsSold,
        topPhrases,
        missingFromTitle: topPhrases.filter((row) => !row.inTitle).slice(0, 10),
        buyerSearches: [],
        aiKeywords: [],
        note: 'Phrases mined from this product and similar AliExpress titles, weighted by order volume.',
      },
      policy,
    };
  }

  async matchAliExpress(query: MatchAliExpressQueryDto): Promise<ResearchSearchResultView> {
    const text = query.q?.trim() ?? '';
    const imageUrl = query.imageUrl?.trim();
    if (!text && !imageUrl) {
      throw new BadRequestException('Provide a search phrase or an image URL.');
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const attempts = [
      text,
      text ? searchSeed(text, 4) : '',
      text ? searchSeed(text, 2) : '',
    ].filter((value, index, all) => value && all.indexOf(value) === index);

    let items: SupplierProduct[] = [];
    if (imageUrl) {
      items = await this.supplier.search({
        search: attempts[0] || text,
        imageUrl,
        sort: 'ordersDesc',
      }).then((result) => result.items).catch((error: unknown) => {
        this.logger.warn(
          `AliExpress image match failed: ${error instanceof Error ? error.message : error}`,
        );
        return [];
      });
    }

    for (const attempt of attempts) {
      if (items.length >= 8) break;
      const result = await this.supplier.search({
        search: attempt,
        sort: 'ordersDesc',
      });
      items = this.mergeProducts(items, result.items);
    }

    const savedByExternalId = await this.savedLookup(items.map((item) => item.externalId));
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize).map((product) => {
      const savedId = savedByExternalId.get(product.externalId) ?? null;
      return {
        ...product,
        estimate: this.profit.estimate(product.costPrice, product.shippingCost),
        saved: savedId !== null,
        savedProductId: savedId,
      };
    });

    return {
      items: pageItems,
      total: items.length,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(items.length / pageSize)),
      facets: { categories: [], suppliers: [] },
    };
  }

  async listOnEbay(
    externalId: string,
    dto: ListOnEbayDto,
    identity?: AuthenticatedUser,
  ): Promise<ListOnEbayResult> {
    const source = await this.supplier.getByExternalId(externalId);
    if (!source) {
      throw new NotFoundException(`Supplier product ${externalId} not found`);
    }

    const product = await this.products.saveFromSupplier(externalId);
    const selectedExternalIds =
      dto.variantExternalIds?.length
        ? dto.variantExternalIds
        : source.variants.map((variant) => variant.externalId);
    const images = (dto.images?.length ? dto.images : source.images)
      .map(toHttpsImage)
      .filter((url) => url.startsWith('https://'))
      .slice(0, 12);
    const title = (dto.title?.trim() || source.title).slice(0, 80);
    const descriptionHtml = sanitizeListingHtml(
      dto.descriptionHtml?.trim() || this.fallbackDescriptionHtml(source.title, source.description, source.specs ?? []),
    );
    const price = dto.price ?? this.profit.suggestSellPrice(source.costPrice, source.shippingCost);
    const quantity = dto.quantity ?? Math.max(1, Math.min(source.stock || 10, 50));

    await this.prisma.product.update({
      where: { id: product.id },
      data: {
        title,
        images: JSON.stringify(images),
        imageUrl: images[0] ?? null,
        sellPrice: price,
        stock: quantity,
        category: dto.category ?? source.category,
        status: ProductStatus.IMPORTED,
        importedAt: new Date(),
      },
    });

    await this.prisma.productVariant.updateMany({
      where: { productId: product.id },
      data: { selected: false },
    });
    if (selectedExternalIds.length > 0) {
      await this.prisma.productVariant.updateMany({
        where: { productId: product.id, externalId: { in: selectedExternalIds } },
        data: { selected: true },
      });
    }

    const updated = await this.products.findOne(product.id);
    const selectedIds = updated.variants
      .filter((variant) => variant.selected)
      .map((variant) => variant.id);

    const listing = await this.listings.createForEbay({
      productId: updated.id,
      title,
      descriptionHtml,
      images,
      category: dto.category ?? source.category,
      sku: source.externalId,
      price,
      quantity,
      shippingMethod: source.shippingOptions[0]?.method,
      shippingCost: source.shippingCost,
      shippingEtaDays: source.shippingEtaDays,
      selectedVariantIds: selectedIds,
    });

    const shouldPublish = dto.publish !== false;
    if (!shouldPublish) {
      return {
        product: updated,
        listing,
        published: false,
        ebayUrl: listing.ebayUrl,
        error: null,
      };
    }

    const user = await this.users.findCurrent(identity);
    const aspects = this.toMarketplaceAspects(dto.aspects ?? source.specs ?? []);
    try {
      const published = await this.ebay.publishListing(user.id, listing.id, { aspects });
      const view = this.listings.toView(published);
      return {
        product: await this.products.findOne(updated.id),
        listing: view,
        published: view.status === 'PUBLISHED',
        ebayUrl: view.ebayUrl,
        error: view.lastError,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not publish to eBay UK';
      return {
        product: await this.products.findOne(updated.id),
        listing: await this.listings.findOne(listing.id),
        published: false,
        ebayUrl: null,
        error: message,
      };
    }
  }

  private async recordSnapshot(item: EbayItemDetail): Promise<void> {
    const latest = await this.prisma.ebaySalesSnapshot.findFirst({
      where: { itemId: item.itemId },
      orderBy: { capturedAt: 'desc' },
    });
    if (
      latest &&
      latest.soldCount === item.soldCount &&
      Date.now() - latest.capturedAt.getTime() < SNAPSHOT_GAP_MS
    ) {
      return;
    }
    await this.prisma.ebaySalesSnapshot.create({
      data: {
        itemId: item.itemId,
        legacyItemId: item.legacyItemId,
        title: item.title,
        price: item.price,
        currency: item.currency,
        soldCount: item.soldCount,
        available: item.availableQuantity,
      },
    });
  }

  private buildSales(
    item: EbayItemDetail,
    snapshots: Array<{
      capturedAt: Date;
      soldCount: number;
      price: number;
      available: number | null;
    }>,
  ): SalesHistoryView {
    const chronological = [...snapshots].sort(
      (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime(),
    );
    const observations: SalesObservationRow[] = chronological.map((row, index) => {
      const previous = chronological[index - 1];
      const daysSincePrevious = previous
        ? Math.max(
            0,
            (row.capturedAt.getTime() - previous.capturedAt.getTime()) / 86_400_000,
          )
        : null;
      return {
        capturedAt: row.capturedAt.toISOString(),
        soldCount: row.soldCount,
        unitsSincePrevious: previous ? Math.max(0, row.soldCount - previous.soldCount) : null,
        daysSincePrevious:
          daysSincePrevious == null ? null : Number(daysSincePrevious.toFixed(2)),
        price: row.price,
        available: row.available,
      };
    });

    const age = item.listingAgeDays;
    const totalSold = item.soldCount;
    const averageUnitsPerDay =
      age && age > 0 ? Number((totalSold / age).toFixed(2)) : null;
    const windowUnits = (days: number): number | null => {
      if (age != null && age <= days) return totalSold;
      if (averageUnitsPerDay == null) return null;
      return Number((averageUnitsPerDay * days).toFixed(1));
    };

    const velocity: SalesVelocityRow[] = [
      {
        label: 'Last 7 days',
        windowDays: 7,
        units: windowUnits(7),
        revenue: windowUnits(7) != null ? Number(((windowUnits(7) ?? 0) * item.price).toFixed(2)) : null,
        source: age != null && age <= 7 ? 'observed' : 'listing-average',
        note:
          age != null && age <= 7
            ? 'Exact: this listing is newer than 7 days, so the sold total is this window.'
            : 'Estimated from the listing lifetime average. eBay does not expose a 7-day sold table via API.',
      },
      {
        label: 'Last 30 days',
        windowDays: 30,
        units: windowUnits(30),
        revenue: windowUnits(30) != null ? Number(((windowUnits(30) ?? 0) * item.price).toFixed(2)) : null,
        source: age != null && age <= 30 ? 'observed' : 'listing-average',
        note:
          age != null && age <= 30
            ? 'Exact: this listing is newer than 30 days, so the sold total is this window.'
            : 'Estimated from the listing lifetime average. Re-open this page later to record real deltas.',
      },
      {
        label: 'Listing lifetime',
        windowDays: age ?? 0,
        units: totalSold,
        revenue: Number((totalSold * item.price).toFixed(2)),
        source: 'observed',
        note: 'Browse estimatedSoldQuantity for this listing.',
      },
    ];

    return {
      totalSold,
      currency: item.currency,
      estimatedRevenue: Number((totalSold * item.price).toFixed(2)),
      listingAgeDays: age,
      availableQuantity: item.availableQuantity,
      averageUnitsPerDay,
      velocity,
      observations,
      purchaseHistoryUrl: item.purchaseHistoryUrl,
      dataNote:
        'eBay has no API for buyer-by-buyer purchase history. This table uses the listing sold counter, lifetime averages, and snapshots this app records each time you open the item. Open the eBay purchase history page for the official buyer / date / qty rows.',
    };
  }

  private buildKeywords(
    item: EbayItemDetail,
    competitors: EbayMarketplaceItem[],
    buyerSearches: string[],
  ): KeywordInsightsView {
    const mined = minePhrases(
      competitors.map((listing) => ({ title: listing.title, soldCount: listing.soldCount })),
      { minListings: 2, limit: 30 },
    );
    const sampleUnitsSold = Math.max(mined.sampleUnitsSold, 1);
    const topPhrases: KeywordRow[] = mined.phrases.map((phrase) => ({
      phrase: phrase.phrase,
      words: phrase.words,
      listings: phrase.listings,
      unitsSold: phrase.unitsSold,
      soldShare: Number((phrase.unitsSold / sampleUnitsSold).toFixed(3)),
      inTitle: titleContainsPhrase(item.title, phrase.phrase),
      source: 'competitors',
    }));
    const missingFromTitle = topPhrases.filter((phrase) => !phrase.inTitle).slice(0, 12);

    return {
      seed: searchSeed(item.title),
      sampleListings: mined.sampleListings,
      sampleUnitsSold: mined.sampleUnitsSold,
      topPhrases,
      missingFromTitle,
      buyerSearches,
      aiKeywords: [],
      note: 'Phrases are mined from the titles of the best-selling competing eBay UK listings. Buyer searches come from eBay’s own search-box suggestions.',
    };
  }

  private async buildSeo(
    item: EbayItemDetail,
    keywords: KeywordInsightsView,
    categoryAspects: EbayCategoryAspect[],
    diagnosis?: SalesDiagnosisView,
  ): Promise<SeoRecommendationView> {
    const fallback = this.heuristicSeo(item, keywords, categoryAspects);
    const mined = keywords.topPhrases.map((row) => row.phrase);
    const drawbacks = (diagnosis?.items ?? [])
      .filter((row) => row.status !== 'pass')
      .map((row) => `${row.title}: ${row.change}`);
    const cacheKey = this.cache.key('ebay:seo', {
      title: item.title,
      category: item.categoryId,
      seed: keywords.seed,
      gaps: drawbacks.slice(0, 6).join('|'),
    });

    try {
      const ai = await this.cache.wrap(cacheKey, AI_SEO_TTL_MS, () =>
        this.withTimeout(
          this.ai.generateListingSeo({
            sourceTitle: item.title,
            categoryName: item.categoryPath.at(-1) ?? item.categoryPath[0],
            description: item.shortDescription ?? htmlPreview(item.descriptionHtml),
            minedKeywords: mined,
            buyerSearches: keywords.buyerSearches,
            knownAspects: item.aspects,
            requestedAspectNames: categoryAspects.map((aspect) => aspect.name),
            priceHint: item.price,
            currency: item.currency,
            drawbacks,
          }),
          20_000,
        ),
      );
      keywords.aiKeywords = ai.keywords;
      return {
        ...fallback,
        recommendedTitle: ai.title || fallback.recommendedTitle,
        titleLength: (ai.title || fallback.recommendedTitle).length,
        descriptionHtml: sanitizeListingHtml(ai.descriptionHtml) || fallback.descriptionHtml,
        descriptionText: htmlToPlainSafe(ai.descriptionHtml) || fallback.descriptionText,
        highlights: ai.highlights.length ? ai.highlights : fallback.highlights,
        aspects: this.mergeAspects(item, categoryAspects, ai.aspects),
        aiGenerated: true,
        note: 'Title, description and highlights were written for eBay UK (British English, ebay.co.uk). Item specifics still use eBay’s category requirements.',
        checklist: this.checklist(ai.title || fallback.recommendedTitle, item, keywords, categoryAspects),
        mainImagePrompt: ai.mainImagePrompt || fallback.mainImagePrompt,
        imageNotes: ai.imageNotes?.length ? ai.imageNotes : fallback.imageNotes,
      };
    } catch (error) {
      this.logger.warn(
        `SEO generation fell back to heuristics: ${error instanceof Error ? error.message : error}`,
      );
      return fallback;
    }
  }

  private heuristicSeo(
    item: EbayItemDetail,
    keywords: KeywordInsightsView,
    categoryAspects: EbayCategoryAspect[],
  ): SeoRecommendationView {
    const extras = keywords.missingFromTitle
      .slice(0, 4)
      .map((row) => row.phrase)
      .filter((phrase) => !titleContainsPhrase(item.title, phrase));
    const recommendedTitle = packTitle(searchSeed(item.title, 6), extras);
    const highlights = [
      ...item.aspects.slice(0, 4).map((aspect) => `${aspect.name}: ${aspect.value}`),
      ...keywords.topPhrases.slice(0, 2).map((row) => `Searched as “${row.phrase}”`),
    ].slice(0, 6);
    const descriptionHtml = this.fallbackDescriptionHtml(
      recommendedTitle,
      item.shortDescription ?? htmlPreview(item.descriptionHtml),
      item.aspects,
    );

    return {
      categoryId: item.categoryId,
      categoryName: item.categoryPath.at(-1) ?? null,
      recommendedTitle,
      titleLength: recommendedTitle.length,
      descriptionHtml,
      descriptionText: htmlToPlainSafe(descriptionHtml),
      highlights,
      aspects: this.mergeAspects(item, categoryAspects, []),
      checklist: this.checklist(recommendedTitle, item, keywords, categoryAspects),
      aiGenerated: false,
      note: 'Built from competitor keywords and eBay category specifics. Connect an AI key in Settings for a fuller rewrite.',
      mainImagePrompt: this.defaultMainImagePrompt(item),
      imageNotes: this.defaultImageNotes(item),
    };
  }

  private mergeAspects(
    item: EbayItemDetail,
    categoryAspects: EbayCategoryAspect[],
    aiAspects: { name: string; value: string }[],
  ): SeoAspectSuggestion[] {
    const known = new Map(item.aspects.map((aspect) => [aspect.name.toLowerCase(), aspect.value]));
    const generated = new Map(aiAspects.map((aspect) => [aspect.name.toLowerCase(), aspect.value]));
    const names = new Map<string, { name: string; required: boolean; usedForSearch: boolean }>();
    for (const aspect of item.aspects) {
      names.set(aspect.name.toLowerCase(), {
        name: aspect.name,
        required: false,
        usedForSearch: false,
      });
    }
    for (const aspect of categoryAspects) {
      names.set(aspect.name.toLowerCase(), {
        name: aspect.name,
        required: aspect.required,
        usedForSearch: aspect.usedForSearch,
      });
    }

    return [...names.values()]
      .map((aspect) => {
        const value =
          known.get(aspect.name.toLowerCase()) ?? generated.get(aspect.name.toLowerCase()) ?? null;
        return {
          name: aspect.name,
          value,
          required: aspect.required,
          usedForSearch: aspect.usedForSearch,
          source: (known.has(aspect.name.toLowerCase())
            ? 'listing'
            : value
              ? 'ai'
              : 'missing') as SeoAspectSuggestion['source'],
        };
      })
      .sort((a, b) => Number(b.required) - Number(a.required) || Number(b.usedForSearch) - Number(a.usedForSearch));
  }

  private photoCounts(item: EbayItemDetail): { total: number; showcase: number; variation: number } {
    const variation = item.variations.filter((row) => row.imageUrl).length;
    const showcase = item.showcaseImages?.length
      ? item.showcaseImages.length
      : Math.max(0, item.images.length - variation);
    return { total: item.images.length, showcase, variation };
  }

  private photoChangeText(item: EbayItemDetail): string {
    const { total, showcase, variation } = this.photoCounts(item);
    const split = `${showcase} product show-case photo${showcase === 1 ? '' : 's'} + ${variation} variation photo${variation === 1 ? '' : 's'} (${total} total)`;
    if (total >= 8) {
      return `${split}. Keep picture 1 as a clean, sharp main image on a light background.`;
    }
    if (showcase === 0 && variation > 0) {
      return `${split}. Variation shots are not the full gallery — add scale, in-use, contents and extra angles. eBay allows 12.`;
    }
    return `${split}. eBay allows 12 — add clear angles, each colour, scale and what is in the box.`;
  }

  private buildImageReview(
    item: EbayItemDetail,
    seo: SeoRecommendationView,
  ): ImageReviewView {
    const { total, showcase, variation } = this.photoCounts(item);
    const issues = [...(seo.imageNotes ?? [])];
    const strengths: string[] = [];
    if (total === 0) {
      issues.unshift('No listing photos were returned. Download the product shot from the supplier and generate a main image first.');
    } else if (showcase === 0 && variation > 0) {
      issues.unshift(
        `Only ${variation} variation photo${variation === 1 ? '' : 's'} were found. The product show-case gallery (scale, lifestyle, box contents) still needs to be counted and improved.`,
      );
    } else if (total < 6) {
      issues.unshift(`Only ${total} photos (${showcase} show-case, ${variation} variation). Sold listings usually show 8–12.`);
    } else {
      strengths.push(`${total} photos: ${showcase} product show-case and ${variation} variation.`);
    }
    if (item.variations.length > 1) {
      const missing = item.variations.filter((row) => !row.imageUrl).length;
      if (missing) {
        issues.push(`${missing} variations have no own photo. Buyers skip colour/size options they cannot see.`);
      } else {
        strengths.push('Each variation has its own photo.');
      }
    }
    const uniqueIssues = [...new Set(issues)].slice(0, 6);
    const summary =
      total === 0
        ? 'No photos could be read from this listing.'
        : uniqueIssues.length
          ? 'Current photos are usable as a product reference, but they are not a finished eBay UK main image.'
          : 'Photos look complete. Still generate a cleaner picture 1 if the first shot is cluttered or cropped.';

    return {
      count: total,
      showcaseCount: showcase,
      variationCount: variation,
      referenceImageUrl: item.showcaseImages?.[0] ?? item.images[0] ?? null,
      summary,
      issues: uniqueIssues,
      strengths,
      mainImagePrompt: seo.mainImagePrompt || this.defaultMainImagePrompt(item),
      howToUse:
        'Copy the prompt. Open ChatGPT, Gemini or Midjourney. Attach the reference photo below as the only product image. Paste the prompt. Save the result at 1600×1600 and upload it as eBay picture 1.',
    };
  }

  private defaultMainImagePrompt(item: EbayItemDetail): string {
    const extras = item.aspects
      .slice(0, 6)
      .map((aspect) => `${aspect.name} ${aspect.value}`)
      .join(', ');
    return [
      `Create one eBay UK main listing photo for this exact product: ${item.title}.`,
      extras ? `Visible product facts: ${extras}.` : '',
      'Use the attached photo as the only product reference. Keep the same product — same shape, colour, materials, size and parts. Do not invent a different item, brand logo, or extra accessories that are not in the reference.',
      'Style: clean light grey or white studio background, even soft lighting, true colour, sharp focus, product filling 80–90% of a square 1600×1600 frame.',
      'No text, badges, watermarks, price tags, hands, busy lifestyle props, or collage. Marketplace-ready picture 1 only.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private defaultImageNotes(item: EbayItemDetail): string[] {
    const notes = [
      'Picture 1 must be a clean studio shot, not a cropped marketplace thumbnail.',
      'Show the full product, true colour, and enough space around it for eBay’s gallery crop.',
    ];
    if (item.images.length < 6) notes.push('Add more angles after the main image: scale, in-use, back and contents.');
    if (item.variations.length > 1) notes.push('Each colour or size needs its own clear photo.');
    return notes;
  }

  private buildDiagnosis(
    item: EbayItemDetail,
    soldPeers: EbayMarketplaceItem[],
    keywords: KeywordInsightsView,
    categoryAspects: EbayCategoryAspect[],
  ): SalesDiagnosisView {
    const soldPrices = soldPeers.map((peer) => peer.price).filter((price) => price > 0).sort((a, b) => a - b);
    const medianSoldPrice = soldPrices.length ? soldPrices[Math.floor(soldPrices.length / 2)] : null;
    const medianSoldUnits = median(
      soldPeers.map((peer) => peer.soldCount).filter((units) => units > 0),
    );
    const thisSold = item.soldCount || 0;
    const landed = item.price + (item.shippingCost ?? 0);
    const requiredMissing = categoryAspects.filter(
      (aspect) =>
        aspect.required &&
        !item.aspects.some((row) => row.name.toLowerCase() === aspect.name.toLowerCase()),
    );
    const descriptionLength = (item.shortDescription || htmlPreview(item.descriptionHtml) || '').length;

    const items: SalesDiagnosisItem[] = [
      {
        id: 'demand',
        title: 'Product demand',
        priority: 'critical',
        status: soldPeers.length >= 3 ? 'pass' : soldPeers.length > 0 ? 'warn' : 'fail',
        change:
          soldPeers.length >= 3
            ? `${soldPeers.length} similar listings have sales. Demand is there — the listing has to convert.`
            : soldPeers.length > 0
              ? 'Only a few similar items have sold. Confirm buyers still search this product on eBay UK.'
              : 'No similar sold listings found. This product may not have enough eBay UK demand.',
        why: 'Buyers must already be searching and buying this type of item. Views on a weak product will not become orders.',
      },
      {
        id: 'title',
        title: 'SEO-friendly title',
        priority: 'critical',
        status:
          item.title.length >= 60 && item.title.length <= 80 && keywords.missingFromTitle.length <= 3
            ? 'pass'
            : item.title.length >= 40
              ? 'warn'
              : 'fail',
        change:
          keywords.missingFromTitle.length > 0
            ? `Rewrite the title to 60–80 characters and add: ${keywords.missingFromTitle
                .slice(0, 4)
                .map((row) => row.phrase)
                .join(', ')}.`
            : `Title is ${item.title.length}/80 characters. Use brand, type, colour, size and the phrase buyers search.`,
        why: 'Best Match finds titles that match what buyers type. Irrelevant words and stuffing waste the 80-character limit.',
      },
      {
        id: 'photos',
        title: 'High-quality photos',
        priority: 'high',
        status: item.images.length >= 8 ? 'pass' : item.images.length >= 4 ? 'warn' : 'fail',
        change: this.photoChangeText(item),
        why: 'The first photo wins the click. Weak or cropped supplier shots lose buyers who already opened the listing.',
      },
      {
        id: 'price',
        title: 'Competitive total price',
        priority: 'critical',
        status:
          medianSoldPrice == null
            ? 'warn'
            : landed <= medianSoldPrice * 1.08
              ? 'pass'
              : landed <= medianSoldPrice * 1.2
                ? 'warn'
                : 'fail',
        change:
          medianSoldPrice == null
            ? `This listing is £${landed.toFixed(2)} including postage. Compare against recent sold prices.`
            : `This listing is £${landed.toFixed(2)} including postage vs a sold-comp median of £${medianSoldPrice.toFixed(2)}. ${
                landed > medianSoldPrice * 1.08
                  ? 'Lower the item price or postage so the delivered total is closer to what is actually selling.'
                  : 'Delivered price is in a competitive range.'
              }`,
        why: 'Buyers compare item + postage. An uncompetitive total cost explains views without sales.',
      },
      {
        id: 'postage',
        title: 'Delivery and postage',
        priority: 'high',
        status: item.shippingCost == null ? 'warn' : item.shippingCost === 0 ? 'pass' : item.shippingCost > 4 ? 'warn' : 'pass',
        change:
          item.shippingCost == null
            ? 'Postage is unclear on the public listing. Set a realistic UK delivery estimate and handling time you can keep.'
            : item.shippingCost === 0
              ? 'Free postage is a strong Best Match signal. Keep dispatch times honest.'
              : `Postage is £${item.shippingCost.toFixed(2)}${item.shippingService ? ` (${item.shippingService})` : ''}. Keep it competitive and promise only what you can dispatch.`,
        why: 'eBay Best Match rewards complete, buyer-friendly postage. Late dispatch kills conversion and future rank.',
      },
      {
        id: 'specifics',
        title: 'Item specifics and description',
        priority: 'high',
        status:
          requiredMissing.length === 0 && descriptionLength >= 80
            ? 'pass'
            : requiredMissing.length === 0
              ? 'warn'
              : 'fail',
        change:
          requiredMissing.length > 0
            ? `Fill required specifics: ${requiredMissing
                .slice(0, 6)
                .map((aspect) => aspect.name)
                .join(', ')}.`
            : descriptionLength < 80
              ? 'Write a clearer description: brand, model, size, compatibility, condition and what is included.'
              : 'Specifics look complete. Keep condition and accessories explicit so buyers have no uncertainty.',
        why: 'Complete specifics help Best Match and search filters. Uncertainty in the description stops the purchase.',
      },
      {
        id: 'trust',
        title: 'Seller trust',
        priority: 'medium',
        status:
          item.topRatedSeller || (item.sellerFeedbackScore ?? 0) >= 50
            ? 'pass'
            : (item.sellerFeedbackScore ?? 0) >= 10
              ? 'warn'
              : 'warn',
        change: item.topRatedSeller
          ? 'Top-rated seller status already helps visibility.'
          : `Feedback score ${item.sellerFeedbackScore ?? 0}${
              item.sellerFeedbackPercentage != null ? `, ${item.sellerFeedbackPercentage}% positive` : ''
            }. Accurate photos, fast replies and promised dispatch matter more on a newer account.`,
        why: 'A private or new account creates uncertainty. Over-promise on delivery or condition will lose the sale.',
      },
      {
        id: 'offers',
        title: 'Offers and pricing strategy',
        priority: 'medium',
        status:
          medianSoldPrice != null && landed > medianSoldPrice * 1.15 ? 'warn' : 'pass',
        change:
          medianSoldPrice != null && landed > medianSoldPrice * 1.15
            ? 'Test Best Offer or a small price drop. Do not discount every product — only where sold comps are cheaper.'
            : 'Price is close enough that a blanket discount is not required. Watch sold comps before cutting further.',
        why: 'Best Offer can convert watchers, but paid promotion will not fix weak demand or an uncompetitive total price.',
      },
      {
        id: 'performance',
        title: 'Listing performance',
        priority: 'high',
        status:
          medianSoldUnits != null && thisSold >= medianSoldUnits * 0.6
            ? 'pass'
            : thisSold > 0
              ? 'warn'
              : 'fail',
        change:
          thisSold === 0
            ? `This listing shows ${thisSold} sold vs similar sold listings (median ${medianSoldUnits ?? 0} units). Treat views as a warning: buyers are looking, not buying.`
            : `This listing has ${thisSold} sold. Similar sold listings sit around ${medianSoldUnits ?? 'n/a'} units. Track impressions, views, watchers and orders separately.`,
        why: 'Impressions and views are not success. If people open the listing and leave, fix price, postage, photos and confidence.',
      },
      {
        id: 'testing',
        title: 'Consistency and testing',
        priority: 'medium',
        status: 'warn',
        change:
          'Change one major factor at a time: title keywords, then delivered price, then photos. Review after a few days of impressions.',
        why: 'Changing everything at once hides what actually improved Best Match or conversion.',
      },
    ];

    const firstFail = items.find((row) => row.status === 'fail') ?? items.find((row) => row.status === 'warn');
    const firstMove = firstFail
      ? `First change: ${firstFail.title}. ${firstFail.change}`
      : 'Listing looks competitive against sold comps. Keep monitoring sold prices and do not chase views alone.';

    return {
      firstMove,
      summary:
        soldPeers.length > 0
          ? `${soldPeers.length} similar eBay UK listings have sales. Goal is the right buyers finding this listing, trusting it, and completing the purchase — not more views.`
          : 'Few sold comps were found. Confirm demand on eBay UK Sold listings before spending time on title tests or promotions.',
      items,
    };
  }

  private checklist(
    title: string,
    item: EbayItemDetail,
    keywords: KeywordInsightsView,
    categoryAspects: EbayCategoryAspect[],
  ): SeoChecklistItem[] {
    const requiredMissing = categoryAspects.filter((aspect) => {
      if (!aspect.required) return false;
      return !item.aspects.some((row) => row.name.toLowerCase() === aspect.name.toLowerCase());
    });
    return [
      {
        label: 'Title length',
        status: title.length >= 60 && title.length <= 80 ? 'pass' : title.length >= 40 ? 'warn' : 'fail',
        detail: `${title.length}/80 characters. eBay UK ranks fuller titles that still read naturally.`,
      },
      {
        label: 'Primary keyword in title',
        status: titleContainsPhrase(title, keywords.seed.split(' ').slice(0, 3).join(' '))
          ? 'pass'
          : 'warn',
        detail: `Lead with “${keywords.seed}” — that is what buyers type.`,
      },
      {
        label: 'Competitor phrases covered',
        status: keywords.missingFromTitle.length <= 3 ? 'pass' : 'warn',
        detail:
          keywords.missingFromTitle.length === 0
            ? 'The recommended title already covers the strongest competing phrases.'
            : `Still unused: ${keywords.missingFromTitle
                .slice(0, 5)
                .map((row) => row.phrase)
                .join(', ')}.`,
      },
      {
        label: 'Gallery images',
        status: item.images.length >= 6 ? 'pass' : item.images.length >= 3 ? 'warn' : 'fail',
        detail: `${item.images.length} photos. eBay allows 12; listings with 6+ convert better.`,
      },
      {
        label: 'Required item specifics',
        status: requiredMissing.length === 0 ? 'pass' : 'fail',
        detail:
          requiredMissing.length === 0
            ? 'Required category specifics are filled from the source listing.'
            : `Fill before publishing: ${requiredMissing
                .slice(0, 6)
                .map((aspect) => aspect.name)
                .join(', ')}.`,
      },
    ];
  }

  private fallbackDescriptionHtml(
    title: string,
    description: string,
    specs: { name: string; value: string }[],
  ): string {
    const plain = htmlToPlainSafe(description) || title;
    const bullets = specs
      .slice(0, 8)
      .map((spec) => `<li><strong>${escapeHtml(spec.name)}:</strong> ${escapeHtml(spec.value)}</li>`)
      .join('');
    return [
      `<p>${escapeHtml(plain.slice(0, 420))}</p>`,
      bullets ? `<h3>Key details</h3><ul>${bullets}</ul>` : '',
      '<p>Dispatched from a UK-facing seller account on ebay.co.uk. Check the listing for postage and returns before you buy. No specific delivery date is promised here.</p>',
    ]
      .filter(Boolean)
      .join('');
  }

  private toMarketplaceAspects(
    aspects: { name: string; value: string }[],
  ): MarketplaceListingAspect[] {
    return aspects
      .filter((aspect) => aspect.name && aspect.value)
      .map((aspect) => ({ name: aspect.name, values: [aspect.value] }));
  }

  private mergeProducts(current: SupplierProduct[], extra: SupplierProduct[]): SupplierProduct[] {
    const seen = new Set(current.map((item) => item.externalId));
    const merged = [...current];
    for (const item of extra) {
      if (seen.has(item.externalId)) continue;
      seen.add(item.externalId);
      merged.push(item);
    }
    return merged;
  }

  private async savedLookup(externalIds: string[]): Promise<Map<string, string>> {
    if (externalIds.length === 0) return new Map();
    const saved = await this.prisma.product.findMany({
      where: { externalId: { in: externalIds } },
      select: { id: true, externalId: true },
    });
    return new Map(
      saved
        .filter((product): product is { id: string; externalId: string } => product.externalId !== null)
        .map((product) => [product.externalId, product.id]),
    );
  }

  private buildCompareDiffs(yours: EbayItemDetail, competitor: EbayItemDetail): ListingCompareRow[] {
    const yourLanded = yours.price + (yours.shippingCost ?? 0);
    const theirLanded = competitor.price + (competitor.shippingCost ?? 0);
    const yourPhotos = this.photoCounts(yours);
    const theirPhotos = this.photoCounts(competitor);
    const yourWords = new Set(this.titleWords(yours.title));
    const theirExtra = this.titleWords(competitor.title).filter((word) => !yourWords.has(word));
    const yourAspects = new Map(yours.aspects.map((row) => [row.name.toLowerCase(), row.value]));
    const missingSpecifics = competitor.aspects
      .filter((row) => !yourAspects.has(row.name.toLowerCase()))
      .map((row) => row.name);
    const yourDesc = (yours.shortDescription || htmlPreview(yours.descriptionHtml) || '').length;
    const theirDesc = (competitor.shortDescription || htmlPreview(competitor.descriptionHtml) || '').length;

    return [
      {
        id: 'sales',
        title: 'Sales',
        yours: `${yours.soldCount} sold`,
        competitor: `${competitor.soldCount} sold`,
        verdict:
          yours.soldCount === competitor.soldCount ? 'same' : yours.soldCount > competitor.soldCount ? 'ahead' : 'behind',
        note:
          competitor.soldCount > yours.soldCount
            ? 'This competitor already has buyers. Copy what is converting, not just the product type.'
            : yours.soldCount > competitor.soldCount
              ? 'Your listing already outsells this comparison. Use the other gaps only if they still look stronger.'
              : 'Sold counts are level. Look at price, photos and title for the next gain.',
      },
      {
        id: 'title',
        title: 'Title / search words',
        yours: `${yours.title.length}/80 characters`,
        competitor: `${competitor.title.length}/80 characters`,
        verdict: theirExtra.length === 0 ? (yours.title.length >= competitor.title.length ? 'same' : 'behind') : 'behind',
        note: theirExtra.length
          ? `Competitor title uses words yours does not: ${theirExtra.slice(0, 8).join(', ')}.`
          : 'Titles cover similar words. Keep yours 60–80 characters and readable.',
      },
      {
        id: 'price',
        title: 'Delivered price',
        yours: `£${yourLanded.toFixed(2)}${yours.shippingCost != null ? ` (item £${yours.price.toFixed(2)} + postage £${yours.shippingCost.toFixed(2)})` : ''}`,
        competitor: `£${theirLanded.toFixed(2)}${competitor.shippingCost != null ? ` (item £${competitor.price.toFixed(2)} + postage £${competitor.shippingCost.toFixed(2)})` : ''}`,
        verdict: yourLanded === theirLanded ? 'same' : yourLanded < theirLanded ? 'ahead' : 'behind',
        note:
          yourLanded > theirLanded
            ? `You are £${(yourLanded - theirLanded).toFixed(2)} more expensive delivered. Buyers sort and compare item + postage.`
            : yourLanded < theirLanded
              ? 'Your delivered total is cheaper. Keep dispatch honest so the lower price still converts.'
              : 'Delivered totals match. Compete on photos, title and trust.',
      },
      {
        id: 'photos',
        title: 'Photos',
        yours: `${yourPhotos.showcase} show-case + ${yourPhotos.variation} variation (${yourPhotos.total})`,
        competitor: `${theirPhotos.showcase} show-case + ${theirPhotos.variation} variation (${theirPhotos.total})`,
        verdict: yourPhotos.total === theirPhotos.total ? 'same' : yourPhotos.total > theirPhotos.total ? 'ahead' : 'behind',
        note:
          yourPhotos.showcase < Math.max(4, theirPhotos.showcase)
            ? 'They show more product angles — scale, in-use, colours and what is in the box — not only variation shots.'
            : 'Photo count is competitive. Picture 1 still has to look like a clean main image.',
      },
      {
        id: 'specifics',
        title: 'Item specifics',
        yours: `${yours.aspects.length} filled`,
        competitor: `${competitor.aspects.length} filled`,
        verdict:
          missingSpecifics.length === 0
            ? yours.aspects.length >= competitor.aspects.length
              ? 'same'
              : 'behind'
            : 'behind',
        note: missingSpecifics.length
          ? `They list specifics you do not: ${missingSpecifics.slice(0, 8).join(', ')}.`
          : 'Specifics look similarly complete.',
      },
      {
        id: 'description',
        title: 'Description',
        yours: yourDesc ? `${yourDesc} characters` : 'Thin or missing',
        competitor: theirDesc ? `${theirDesc} characters` : 'Thin or missing',
        verdict: yourDesc === theirDesc ? 'same' : yourDesc > theirDesc ? 'ahead' : 'behind',
        note:
          yourDesc < 80 || yourDesc + 80 < theirDesc
            ? 'Their description answers more buyer questions. Add what is included, size, power and UK postage/returns.'
            : 'Description length is in a similar range.',
      },
      {
        id: 'variations',
        title: 'Variations',
        yours: `${yours.variations.length || 1} listed`,
        competitor: `${competitor.variations.length || 1} listed`,
        verdict:
          yours.variations.length === competitor.variations.length
            ? 'same'
            : yours.variations.length > competitor.variations.length
              ? 'ahead'
              : 'behind',
        note:
          (competitor.variations.length || 1) > (yours.variations.length || 1)
            ? 'They offer more options. Missing colours or sizes send the buyer to the listing that has them.'
            : 'Option count is similar. Keep stock on the variations buyers actually pick.',
      },
      {
        id: 'trust',
        title: 'Seller trust',
        yours: this.trustLabel(yours),
        competitor: this.trustLabel(competitor),
        verdict:
          (yours.sellerFeedbackScore ?? 0) === (competitor.sellerFeedbackScore ?? 0)
            ? 'same'
            : (yours.sellerFeedbackScore ?? 0) > (competitor.sellerFeedbackScore ?? 0)
              ? 'ahead'
              : 'behind',
        note:
          (competitor.sellerFeedbackScore ?? 0) > (yours.sellerFeedbackScore ?? 0)
            ? 'A newer or quieter account has to win with clearer photos, honest postage and complete specifics.'
            : 'Trust signals are not the main gap. Fix the listing content first.',
      },
      {
        id: 'returns',
        title: 'Returns',
        yours: yours.returnsAccepted == null ? 'Not shown' : yours.returnsAccepted ? 'Accepted' : 'Not accepted',
        competitor:
          competitor.returnsAccepted == null
            ? 'Not shown'
            : competitor.returnsAccepted
              ? 'Accepted'
              : 'Not accepted',
        verdict:
          yours.returnsAccepted === competitor.returnsAccepted
            ? 'same'
            : yours.returnsAccepted
              ? 'ahead'
              : 'behind',
        note: 'Clear UK returns reduce purchase fear, especially against a listing that already has sales.',
      },
    ];
  }

  private titleWords(title: string): string[] {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2);
  }

  private trustLabel(item: EbayItemDetail): string {
    const score = item.sellerFeedbackScore ?? 0;
    const positive = item.sellerFeedbackPercentage != null ? `${item.sellerFeedbackPercentage}% positive` : '';
    const rated = item.topRatedSeller ? 'Top-rated' : `${score} feedback`;
    return [rated, positive].filter(Boolean).join(', ');
  }

  private async buildCompareConclusion(
    yours: EbayItemDetail,
    competitor: EbayItemDetail,
    diffs: ListingCompareRow[],
  ): Promise<ListingCompareConclusion> {
    const fallback = this.heuristicCompareConclusion(yours, competitor, diffs);
    try {
      const ai = await this.withTimeout(
        this.ai.generateListingCompare({
          yoursTitle: yours.title,
          competitorTitle: competitor.title,
          yoursSold: yours.soldCount,
          competitorSold: competitor.soldCount,
          diffs: diffs.map((row) => `${row.title}: you ${row.yours} vs them ${row.competitor}. ${row.note}`),
        }),
        12_000,
      );
      return {
        summary: ai.summary || fallback.summary,
        firstMove: ai.firstMove || fallback.firstMove,
        actions: ai.actions.length ? ai.actions : fallback.actions,
        aiGenerated: true,
      };
    } catch (error) {
      this.logger.warn(
        `Compare conclusion fell back to heuristics: ${error instanceof Error ? error.message : error}`,
      );
      return fallback;
    }
  }

  private heuristicCompareConclusion(
    yours: EbayItemDetail,
    competitor: EbayItemDetail,
    diffs: ListingCompareRow[],
  ): ListingCompareConclusion {
    const behind = diffs.filter((row) => row.verdict === 'behind');
    const first = behind[0] ?? diffs[0];
    return {
      summary:
        competitor.soldCount > yours.soldCount
          ? `The competitor has ${competitor.soldCount} sales vs your ${yours.soldCount}. The gaps below are why buyers pick them.`
          : `Sales are close (${yours.soldCount} vs ${competitor.soldCount}). The remaining gaps are what to change next.`,
      firstMove: first ? `First change: ${first.title}. ${first.note}` : 'Listings look similar. Test one change at a time.',
      actions: behind.slice(0, 5).map((row) => `${row.title}: ${row.note}`),
      aiGenerated: false,
    };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out')), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}

function packTitle(seed: string, extras: string[]): string {
  const parts = [seed, ...extras].map((part) => part.trim()).filter(Boolean);
  let title = '';
  for (const part of parts) {
    const next = title ? `${title} ${part}` : part;
    if (next.length > 80) continue;
    title = next;
  }
  return title.slice(0, 80) || seed.slice(0, 80);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function htmlPreview(value: string | null): string {
  return htmlToPlainSafe(value).slice(0, 1200);
}

function htmlToPlainSafe(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
