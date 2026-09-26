import { BadRequestException, Injectable } from '@nestjs/common';
import { Listing, ListingStatus, ProductStatus, ProfitType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { SupplierShippingOption } from '../integrations/aliexpress/aliexpress.types';
import { ProductsService } from '../products/products.service';
import { ImportPreviewView, ProductRecord, ProductView } from '../products/products.types';
import { ProfitBreakdownDto } from '../profit/dto/profit.dto';
import { ProfitService } from '../profit/profit.service';
import { ImportProductDto, PreviewProfitDto } from './dto/importer.dto';

export interface ImportResultView {
  product: ProductView;
  listing: Listing | null;
  breakdown: ProfitBreakdownDto;
}

/**
 * Internal importer: turns a saved product into a managed product plus an
 * internal eBay listing draft. Nothing is sent to eBay here.
 */
@Injectable()
export class ImporterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly profit: ProfitService,
  ) {}

  /** Saved products are the input of the importer. */
  listImportable(): Promise<ProductView[]> {
    return this.products.findAll({ status: ProductStatus.SAVED });
  }

  async preview(productId: string): Promise<ImportPreviewView> {
    const record = await this.products.findRecord(productId);
    const snapshot = await this.products.getSupplierSnapshot(record.externalId);

    return {
      product: this.products.toView(record),
      shippingOptions: snapshot?.shippingOptions ?? this.fallbackShipping(record),
      supplierSnapshot: snapshot,
    };
  }

  /** Recalculates profit while the user edits price, shipping and variants. */
  async previewProfit(productId: string, dto: PreviewProfitDto): Promise<ProfitBreakdownDto> {
    const record = await this.products.findRecord(productId);
    const productCost = this.costForVariants(record, dto.variantIds);
    const shippingCost = dto.shippingCost ?? record.shippingCost;
    return this.profit.breakdown(dto.sellPrice, productCost, shippingCost, dto);
  }

  async import(productId: string, dto: ImportProductDto): Promise<ImportResultView> {
    const record = await this.products.findRecord(productId);

    if (record.variants.length > 0 && dto.variantIds) {
      const known = new Set(record.variants.map((variant) => variant.id));
      const unknown = dto.variantIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new BadRequestException(`Unknown variant ids: ${unknown.join(', ')}`);
      }
    }

    const selectedIds = dto.variantIds ?? record.variants.map((variant) => variant.id);
    const productCost = this.costForVariants(record, selectedIds);
    const shippingCost = dto.shippingCost ?? record.shippingCost;
    const breakdown = this.profit.breakdown(dto.sellPrice, productCost, shippingCost, dto);

    const selectedVariants = record.variants.filter((variant) => selectedIds.includes(variant.id));
    const quantity = Math.min(
      selectedVariants.reduce((sum, variant) => sum + variant.stock, 0) || record.stock,
      100,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      if (record.variants.length > 0) {
        await tx.productVariant.updateMany({
          where: { productId },
          data: { selected: false },
        });
        await tx.productVariant.updateMany({
          where: { productId, id: { in: selectedIds } },
          data: { selected: true, sellPrice: dto.sellPrice },
        });
      }

      const product = await tx.product.update({
        where: { id: productId },
        data: {
          sellPrice: dto.sellPrice,
          shippingCost,
          shippingMethod: dto.shippingMethod ?? record.shippingMethod,
          status: ProductStatus.IMPORTED,
          importedAt: new Date(),
        },
        include: { variants: true, supplier: true },
      });

      let listing: Listing | null = null;
      if (dto.createListingDraft !== false) {
        const store = await tx.store.findFirst({ orderBy: { createdAt: 'asc' } });
        listing = await tx.listing.create({
          data: {
            productId,
            storeId: store?.id ?? null,
            title: (dto.listingTitle ?? product.title).slice(0, 80),
            description: product.description,
            images: product.images,
            category: product.category,
            sku: selectedVariants.find((variant) => variant.sku)?.sku ?? product.externalId,
            price: dto.sellPrice,
            quantity,
            shippingMethod: dto.shippingMethod ?? product.shippingMethod,
            shippingCost,
            shippingEtaDays: product.shippingEtaDays,
            selectedVariantIds: JSON.stringify(selectedIds),
            status: ListingStatus.DRAFT,
          },
        });
      }

      await tx.profitRecord.create({
        data: {
          productId,
          type: ProfitType.ESTIMATED,
          revenue: breakdown.revenue,
          cost: breakdown.productCost,
          fees: breakdown.fees,
          shippingCost: breakdown.shippingCost,
          profit: breakdown.profit,
          margin: breakdown.margin,
          currency: product.currency,
        },
      });

      return { product, listing };
    });

    return {
      product: this.products.toView(result.product),
      listing: result.listing,
      breakdown,
    };
  }

  /** Worst-case cost across the selected variants so margins are not overstated. */
  private costForVariants(record: ProductRecord, variantIds?: string[]): number {
    if (record.variants.length === 0) return record.costPrice;

    const selected = variantIds?.length
      ? record.variants.filter((variant) => variantIds.includes(variant.id))
      : record.variants;

    if (selected.length === 0) return record.costPrice;
    return Math.max(...selected.map((variant) => variant.costPrice));
  }

  private fallbackShipping(record: ProductRecord): SupplierShippingOption[] {
    return [
      {
        method: record.shippingMethod ?? 'Supplier Standard Shipping',
        cost: record.shippingCost,
        etaDaysMin: record.shippingEtaDays ?? 10,
        etaDaysMax: (record.shippingEtaDays ?? 10) + 6,
        trackingAvailable: true,
      },
    ];
  }
}
