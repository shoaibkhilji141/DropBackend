import { Injectable, NotFoundException } from '@nestjs/common';
import { Listing, ListingStatus, Prisma } from '@prisma/client';
import { liveListingWhere } from '../common/demo-data';
import { htmlToPlainText } from '../common/html';
import { parseStringArray, stringifyStringArray } from '../common/json';
import { PrismaService } from '../common/prisma/prisma.service';
import { EbayService } from '../integrations/ebay/ebay.service';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateListingDto, ListListingsQueryDto, UpdateListingDto } from './dto/listing.dto';
import { ListingRecord, ListingView } from './listings.types';

const LISTING_INCLUDE = {
  product: { include: { variants: true } },
  store: true,
} satisfies Prisma.ListingInclude;

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ebay: EbayService,
    private readonly users: UsersService,
  ) {}

  async findAll(query: ListListingsQueryDto, identity?: AuthenticatedUser): Promise<ListingView[]> {
    const user = await this.users.findCurrent(identity);
    const live = await this.ebay.isConnected(user.id);
    const listings = await this.prisma.listing.findMany({
      where: {
        ...(live ? liveListingWhere() : {}),
        status: query.status,
        ...(query.search ? { title: { contains: query.search } } : {}),
      },
      include: LISTING_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return listings.map((listing) => this.toView(listing));
  }

  async findOne(id: string): Promise<ListingView> {
    return this.toView(await this.findRecord(id));
  }

  async create(dto: CreateListingDto): Promise<ListingView> {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { variants: true },
    });
    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} not found`);
    }

    const store = await this.prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });
    const productImages = parseStringArray(product.images);
    const fallbackImages = product.imageUrl ? [product.imageUrl] : productImages;
    const selectedVariantIds =
      dto.selectedVariantIds ??
      product.variants.filter((variant) => variant.selected).map((variant) => variant.id);
    const status = dto.status ?? ListingStatus.DRAFT;

    const listing = await this.prisma.listing.create({
      data: {
        productId: dto.productId,
        storeId: store?.id ?? null,
        title: dto.title.slice(0, 80),
        description: htmlToPlainText(dto.description ?? product.description),
        images: stringifyStringArray(dto.images ?? fallbackImages),
        category: dto.category ?? product.category,
        sku: dto.sku ?? product.variants.find((variant) => variant.sku)?.sku ?? product.externalId,
        price: dto.price ?? product.sellPrice,
        quantity: dto.quantity ?? Math.min(product.stock, 50),
        shippingMethod: dto.shippingMethod ?? product.shippingMethod,
        shippingCost: dto.shippingCost ?? product.shippingCost,
        shippingEtaDays: dto.shippingEtaDays ?? product.shippingEtaDays,
        selectedVariantIds: stringifyStringArray(selectedVariantIds),
        status,
        publishedAt: status === ListingStatus.PUBLISHED ? new Date() : null,
      },
      include: LISTING_INCLUDE,
    });

    return this.toView(listing);
  }

  async update(id: string, dto: UpdateListingDto): Promise<ListingView> {
    const current = await this.findRecord(id);
    const nextStatus = dto.status ?? current.status;
    const publishedAt =
      nextStatus === ListingStatus.PUBLISHED
        ? (current.publishedAt ?? new Date())
        : current.publishedAt;

    const listing = await this.prisma.listing.update({
      where: { id },
      data: {
        title: dto.title !== undefined ? dto.title.slice(0, 80) : undefined,
        description: dto.description !== undefined ? htmlToPlainText(dto.description) : undefined,
        images: dto.images !== undefined ? stringifyStringArray(dto.images) : undefined,
        category: dto.category,
        sku: dto.sku,
        price: dto.price,
        quantity: dto.quantity,
        shippingMethod: dto.shippingMethod,
        shippingCost: dto.shippingCost,
        shippingEtaDays: dto.shippingEtaDays,
        selectedVariantIds:
          dto.selectedVariantIds !== undefined
            ? stringifyStringArray(dto.selectedVariantIds)
            : undefined,
        status: dto.status,
        publishedAt,
      },
      include: LISTING_INCLUDE,
    });

    return this.toView(listing);
  }

  async remove(id: string): Promise<Listing> {
    await this.findRecord(id);
    return this.prisma.listing.delete({ where: { id } });
  }

  async publish(id: string, identity?: AuthenticatedUser): Promise<ListingView> {
    const user = await this.users.findCurrent(identity);
    return this.toView(await this.ebay.publishListing(user.id, id));
  }

  async setAutoUpdate(id: string, enabled: boolean): Promise<ListingView> {
    await this.findRecord(id);
    const listing = await this.prisma.listing.update({
      where: { id },
      data: { autoUpdateEnabled: enabled },
      include: LISTING_INCLUDE,
    });
    return this.toView(listing);
  }

  async maybeAutoUpdateFromProduct(productId: string): Promise<void> {
    const listings = await this.prisma.listing.findMany({
      where: { productId, autoUpdateEnabled: true, status: ListingStatus.PUBLISHED },
      include: { product: true, store: true },
    });
    for (const listing of listings) {
      if (!listing.sku || !listing.store?.userId) continue;
      try {
        await this.ebay.updateInventory(
          listing.store.userId,
          listing.sku,
          listing.price,
          listing.product?.stock ?? listing.quantity,
        );
      } catch {
        // Auto-update is best-effort; listing.lastError is set by the caller if needed.
      }
    }
  }

  private async findRecord(id: string): Promise<ListingRecord> {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: LISTING_INCLUDE,
    });
    if (!listing) {
      throw new NotFoundException(`Listing ${id} not found`);
    }
    return listing;
  }

  toView(listing: ListingRecord): ListingView {
    const productImages = listing.product
      ? parseStringArray(listing.product.images)
      : [];
    const listingImages = parseStringArray(listing.images);
    const images =
      listingImages.length > 0
        ? listingImages
        : listing.product?.imageUrl
          ? [listing.product.imageUrl]
          : productImages;

    return {
      id: listing.id,
      productId: listing.productId,
      externalId: listing.externalId,
      title: listing.title,
      description: htmlToPlainText(listing.description),
      images,
      category: listing.category ?? listing.product?.category ?? null,
      sku: listing.sku,
      price: listing.price,
      quantity: listing.quantity,
      soldCount: listing.soldCount,
      ebayUrl: this.ebay.itemUrl(listing.externalId, listing.itemUrl),
      shippingMethod: listing.shippingMethod ?? listing.product?.shippingMethod ?? null,
      shippingCost: listing.shippingCost || listing.product?.shippingCost || 0,
      shippingEtaDays: listing.shippingEtaDays ?? listing.product?.shippingEtaDays ?? null,
      selectedVariantIds: parseStringArray(listing.selectedVariantIds),
      status: listing.status,
      publishedAt: listing.publishedAt?.toISOString() ?? null,
      offerId: listing.offerId,
      lastError: listing.lastError,
      autoUpdateEnabled: listing.autoUpdateEnabled,
      createdAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
      product: listing.product
        ? {
            id: listing.product.id,
            title: listing.product.title,
            imageUrl: listing.product.imageUrl ?? productImages[0] ?? null,
            images: productImages.length > 0 ? productImages : listing.product.imageUrl ? [listing.product.imageUrl] : [],
            costPrice: listing.product.costPrice,
            shippingCost: listing.product.shippingCost,
            sourceUrl: listing.product.sourceUrl,
            category: listing.product.category,
            variants: listing.product.variants.map((variant) => ({
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
          }
        : null,
      store: listing.store ? { id: listing.store.id, name: listing.store.name } : null,
    };
  }
}
