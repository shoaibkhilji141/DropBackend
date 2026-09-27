import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LinkStatus, Platform, Product, ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { liveProductWhere } from '../common/demo-data';
import { htmlToPlainText } from '../common/html';
import { IntegrationAccountsService } from '../integrations/accounts/integration-accounts.service';
import {
  SUPPLIER_PRODUCT_PROVIDER,
  SupplierProduct,
  SupplierProductProvider,
  SupplierSortOption,
} from '../integrations/aliexpress/aliexpress.types';
import { ProfitService } from '../profit/profit.service';
import { UsersService } from '../users/users.service';
import {
  ListProductsQueryDto,
  ResearchSortOption,
  SearchSupplierProductsDto,
  UpdateProductDto,
} from './dto/product.dto';
import {
  ProductRecord,
  ProductView,
  ResearchProductView,
  ResearchSearchResultView,
} from './products.types';

const SUPPLIER_SORTS = new Set<SupplierSortOption>([
  'relevance',
  'costAsc',
  'costDesc',
  'ratingDesc',
  'ordersDesc',
]);

const parseImages = (value: string | null, fallback: string | null): string[] => {
  if (value) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      // Stored value is not valid JSON; fall back to the single image below.
    }
  }
  return fallback ? [fallback] : [];
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly profit: ProfitService,
    private readonly accounts: IntegrationAccountsService,
    @Inject(SUPPLIER_PRODUCT_PROVIDER)
    private readonly supplier: SupplierProductProvider,
  ) {}

  // -------------------------------------------------------------------------
  // Research (supplier catalog)
  // -------------------------------------------------------------------------

  async searchSupplier(query: SearchSupplierProductsDto): Promise<ResearchSearchResultView> {
    const supplierSort = this.supplierSort(query.sort);
    const result = await this.supplier.search({
      search: query.search,
      category: query.category,
      supplier: query.supplier,
      minCostPrice: query.minCostPrice,
      maxCostPrice: query.maxCostPrice,
      minRating: query.minRating,
      minOrders: query.minOrders,
      inStockOnly: query.inStockOnly,
      sort: supplierSort,
    });

    const savedByExternalId = await this.savedLookup(
      result.items.map((product) => product.externalId),
    );

    let items: ResearchProductView[] = result.items.map((product) => {
      const estimate = this.profit.estimate(product.costPrice, product.shippingCost);
      const savedId = savedByExternalId.get(product.externalId) ?? null;
      return { ...product, estimate, saved: savedId !== null, savedProductId: savedId };
    });

    items = items.filter((item) => {
      const { sellPrice, profit, margin } = item.estimate.breakdown;
      if (query.minSellPrice !== undefined && sellPrice < query.minSellPrice) return false;
      if (query.maxSellPrice !== undefined && sellPrice > query.maxSellPrice) return false;
      if (query.minProfit !== undefined && profit < query.minProfit) return false;
      if (query.minMargin !== undefined && margin < query.minMargin) return false;
      return true;
    });

    items = this.applyDerivedSort(items, query.sort);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const start = (page - 1) * pageSize;

    return {
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(items.length / pageSize)),
      facets: result.facets,
    };
  }

  async getSupplierProduct(externalId: string): Promise<ResearchProductView> {
    const product = await this.supplier.getByExternalId(externalId);
    if (!product) {
      throw new NotFoundException(`Supplier product ${externalId} not found`);
    }

    const savedByExternalId = await this.savedLookup([externalId]);
    const savedId = savedByExternalId.get(externalId) ?? null;

    return {
      ...product,
      estimate: this.profit.estimate(product.costPrice, product.shippingCost),
      saved: savedId !== null,
      savedProductId: savedId,
    };
  }

  /** Copies a supplier product into the local catalog with status SAVED. */
  async saveFromSupplier(externalId: string): Promise<ProductView> {
    const source = await this.supplier.getByExternalId(externalId);
    if (!source) {
      throw new NotFoundException(`Supplier product ${externalId} not found`);
    }

    const user = await this.users.findCurrent();

    const existing = await this.prisma.product.findFirst({
      where: { userId: user.id, externalId },
      include: { variants: true, supplier: true },
    });
    if (existing) {
      return this.toView(existing);
    }

    const supplier = await this.prisma.supplier.upsert({
      where: { externalId: source.supplier.externalId },
      create: {
        externalId: source.supplier.externalId,
        name: source.supplier.name,
        score: source.supplier.score,
        platform: 'ALIEXPRESS',
      },
      update: { name: source.supplier.name, score: source.supplier.score },
    });

    const standardShipping = source.shippingOptions[0];
    const suggested = this.profit.suggestSellPrice(source.costPrice, source.shippingCost);

    const created = await this.prisma.product.create({
      data: {
        userId: user.id,
        supplierId: supplier.id,
        externalId: source.externalId,
        title: source.title,
        description: htmlToPlainText(source.description),
        imageUrl: source.images[0],
        images: JSON.stringify(source.images),
        sourceUrl: source.sourceUrl,
        category: source.category,
        currency: source.currency,
        costPrice: source.costPrice,
        shippingCost: source.shippingCost,
        sellPrice: suggested,
        stock: source.stock,
        rating: source.rating,
        ordersCount: source.orders,
        reviews: source.reviews,
        shippingMethod: standardShipping?.method ?? null,
        shippingEtaDays: source.shippingEtaDays,
        status: ProductStatus.SAVED,
        variants: {
          create: source.variants.map((variant) => ({
            externalId: variant.externalId,
            name: variant.name,
            attributes: variant.attributes,
            imageUrl: variant.imageUrl,
            costPrice: variant.costPrice,
            sellPrice: this.profit.suggestSellPrice(variant.costPrice, source.shippingCost),
            stock: variant.stock,
          })),
        },
      },
      include: { variants: true, supplier: true },
    });

    return this.toView(created);
  }

  /** Removes a saved product; importing it first is blocked to avoid surprises. */
  async removeSaved(id: string): Promise<{ id: string }> {
    const product = await this.findRecord(id);
    if (product.status !== ProductStatus.SAVED) {
      throw new BadRequestException(
        'Only saved products can be removed from the research list. Delete imported products from the product details page.',
      );
    }
    await this.prisma.product.delete({ where: { id } });
    return { id };
  }

  // -------------------------------------------------------------------------
  // Local catalog
  // -------------------------------------------------------------------------

  async findAll(query: ListProductsQueryDto): Promise<ProductView[]> {
    const [ebay, aliexpress] = await Promise.all([
      this.accounts.findConnected(Platform.EBAY),
      this.accounts.findConnected(Platform.ALIEXPRESS),
    ]);
    const live =
      (ebay?.status === LinkStatus.CONNECTED && !this.accounts.isExpired(ebay)) ||
      (aliexpress?.status === LinkStatus.CONNECTED && !this.accounts.isExpired(aliexpress));
    const products = await this.prisma.product.findMany({
      where: {
        ...(live ? liveProductWhere() : {}),
        status: query.status,
        ...(query.search ? { title: { contains: query.search } } : {}),
      },
      include: { variants: true, supplier: true },
      orderBy: { updatedAt: 'desc' },
    });
    return products.map((product) => this.toView(product));
  }

  async findOne(id: string): Promise<ProductView> {
    return this.toView(await this.findRecord(id));
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductView> {
    await this.findRecord(id);
    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.description != null ? { description: htmlToPlainText(dto.description) } : {}),
      },
      include: { variants: true, supplier: true },
    });
    return this.toView(updated);
  }

  async remove(id: string): Promise<Product> {
    await this.findRecord(id);
    return this.prisma.product.delete({ where: { id } });
  }

  async findRecord(id: string): Promise<ProductRecord> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: true, supplier: true },
    });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  /** Shared mapper so every module returns the same product shape. */
  toView(product: ProductRecord): ProductView {
    return {
      id: product.id,
      externalId: product.externalId,
      title: product.title,
      description: htmlToPlainText(product.description),
      images: parseImages(product.images, product.imageUrl),
      sourceUrl: product.sourceUrl,
      category: product.category,
      currency: product.currency,
      costPrice: product.costPrice,
      shippingCost: product.shippingCost,
      sellPrice: product.sellPrice,
      stock: product.stock,
      rating: product.rating,
      ordersCount: product.ordersCount,
      reviews: product.reviews,
      shippingMethod: product.shippingMethod,
      shippingEtaDays: product.shippingEtaDays,
      status: product.status,
      importedAt: product.importedAt?.toISOString() ?? null,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      supplier: product.supplier
        ? { id: product.supplier.id, name: product.supplier.name, score: product.supplier.score }
        : null,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        externalId: variant.externalId,
        sku: variant.sku,
        name: variant.name,
        attributes: variant.attributes,
        imageUrl: variant.imageUrl,
        costPrice: variant.costPrice,
        sellPrice: variant.sellPrice,
        stock: variant.stock,
        selected: variant.selected,
      })),
      estimate: this.profit.estimate(
        product.costPrice,
        product.shippingCost,
        product.sellPrice || undefined,
      ),
    };
  }

  getSupplierSnapshot(externalId: string | null): Promise<SupplierProduct | null> {
    return externalId ? this.supplier.getByExternalId(externalId) : Promise.resolve(null);
  }

  private supplierSort(sort?: ResearchSortOption): SupplierSortOption | undefined {
    return sort && SUPPLIER_SORTS.has(sort as SupplierSortOption)
      ? (sort as SupplierSortOption)
      : undefined;
  }

  private applyDerivedSort(
    items: ResearchProductView[],
    sort?: ResearchSortOption,
  ): ResearchProductView[] {
    switch (sort) {
      case 'profitDesc':
        return [...items].sort(
          (a, b) => b.estimate.breakdown.profit - a.estimate.breakdown.profit,
        );
      case 'marginDesc':
        return [...items].sort(
          (a, b) => b.estimate.breakdown.margin - a.estimate.breakdown.margin,
        );
      case 'sellPriceAsc':
        return [...items].sort(
          (a, b) => a.estimate.breakdown.sellPrice - b.estimate.breakdown.sellPrice,
        );
      case 'sellPriceDesc':
        return [...items].sort(
          (a, b) => b.estimate.breakdown.sellPrice - a.estimate.breakdown.sellPrice,
        );
      case 'ordersDesc':
        return [...items].sort((a, b) => b.orders - a.orders);
      case 'ratingDesc':
        return [...items].sort((a, b) => b.rating - a.rating);
      case 'costAsc':
        return [...items].sort((a, b) => a.costPrice - b.costPrice);
      case 'costDesc':
        return [...items].sort((a, b) => b.costPrice - a.costPrice);
      default:
        return items;
    }
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
}
