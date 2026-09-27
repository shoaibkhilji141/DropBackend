"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListingsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const demo_data_1 = require("../common/demo-data");
const json_1 = require("../common/json");
const prisma_service_1 = require("../common/prisma/prisma.service");
const ebay_service_1 = require("../integrations/ebay/ebay.service");
const users_service_1 = require("../users/users.service");
const LISTING_INCLUDE = {
    product: { include: { variants: true } },
    store: true,
};
let ListingsService = class ListingsService {
    prisma;
    ebay;
    users;
    constructor(prisma, ebay, users) {
        this.prisma = prisma;
        this.ebay = ebay;
        this.users = users;
    }
    async findAll(query, identity) {
        const user = await this.users.findCurrent(identity);
        const live = await this.ebay.isConnected(user.id);
        const listings = await this.prisma.listing.findMany({
            where: {
                ...(live ? (0, demo_data_1.liveListingWhere)() : {}),
                status: query.status,
                ...(query.search ? { title: { contains: query.search } } : {}),
            },
            include: LISTING_INCLUDE,
            orderBy: { updatedAt: 'desc' },
        });
        return listings.map((listing) => this.toView(listing));
    }
    async findOne(id) {
        return this.toView(await this.findRecord(id));
    }
    async create(dto) {
        const product = await this.prisma.product.findUnique({
            where: { id: dto.productId },
            include: { variants: true },
        });
        if (!product) {
            throw new common_1.NotFoundException(`Product ${dto.productId} not found`);
        }
        const store = await this.prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });
        const productImages = (0, json_1.parseStringArray)(product.images);
        const fallbackImages = product.imageUrl ? [product.imageUrl] : productImages;
        const selectedVariantIds = dto.selectedVariantIds ??
            product.variants.filter((variant) => variant.selected).map((variant) => variant.id);
        const status = dto.status ?? client_1.ListingStatus.DRAFT;
        const listing = await this.prisma.listing.create({
            data: {
                productId: dto.productId,
                storeId: store?.id ?? null,
                title: dto.title.slice(0, 80),
                description: dto.description ?? product.description,
                images: (0, json_1.stringifyStringArray)(dto.images ?? fallbackImages),
                category: dto.category ?? product.category,
                sku: dto.sku ?? product.variants.find((variant) => variant.sku)?.sku ?? product.externalId,
                price: dto.price ?? product.sellPrice,
                quantity: dto.quantity ?? Math.min(product.stock, 50),
                shippingMethod: dto.shippingMethod ?? product.shippingMethod,
                shippingCost: dto.shippingCost ?? product.shippingCost,
                shippingEtaDays: dto.shippingEtaDays ?? product.shippingEtaDays,
                selectedVariantIds: (0, json_1.stringifyStringArray)(selectedVariantIds),
                status,
                publishedAt: status === client_1.ListingStatus.PUBLISHED ? new Date() : null,
            },
            include: LISTING_INCLUDE,
        });
        return this.toView(listing);
    }
    async update(id, dto) {
        const current = await this.findRecord(id);
        const nextStatus = dto.status ?? current.status;
        const publishedAt = nextStatus === client_1.ListingStatus.PUBLISHED
            ? (current.publishedAt ?? new Date())
            : current.publishedAt;
        const listing = await this.prisma.listing.update({
            where: { id },
            data: {
                title: dto.title !== undefined ? dto.title.slice(0, 80) : undefined,
                description: dto.description,
                images: dto.images !== undefined ? (0, json_1.stringifyStringArray)(dto.images) : undefined,
                category: dto.category,
                sku: dto.sku,
                price: dto.price,
                quantity: dto.quantity,
                shippingMethod: dto.shippingMethod,
                shippingCost: dto.shippingCost,
                shippingEtaDays: dto.shippingEtaDays,
                selectedVariantIds: dto.selectedVariantIds !== undefined
                    ? (0, json_1.stringifyStringArray)(dto.selectedVariantIds)
                    : undefined,
                status: dto.status,
                publishedAt,
            },
            include: LISTING_INCLUDE,
        });
        return this.toView(listing);
    }
    async remove(id) {
        await this.findRecord(id);
        return this.prisma.listing.delete({ where: { id } });
    }
    async publish(id, identity) {
        const user = await this.users.findCurrent(identity);
        return this.toView(await this.ebay.publishListing(user.id, id));
    }
    async setAutoUpdate(id, enabled) {
        await this.findRecord(id);
        const listing = await this.prisma.listing.update({
            where: { id },
            data: { autoUpdateEnabled: enabled },
            include: LISTING_INCLUDE,
        });
        return this.toView(listing);
    }
    async maybeAutoUpdateFromProduct(productId) {
        const listings = await this.prisma.listing.findMany({
            where: { productId, autoUpdateEnabled: true, status: client_1.ListingStatus.PUBLISHED },
            include: { product: true, store: true },
        });
        for (const listing of listings) {
            if (!listing.sku || !listing.store?.userId)
                continue;
            try {
                await this.ebay.updateInventory(listing.store.userId, listing.sku, listing.price, listing.product?.stock ?? listing.quantity);
            }
            catch {
            }
        }
    }
    async findRecord(id) {
        const listing = await this.prisma.listing.findUnique({
            where: { id },
            include: LISTING_INCLUDE,
        });
        if (!listing) {
            throw new common_1.NotFoundException(`Listing ${id} not found`);
        }
        return listing;
    }
    toView(listing) {
        const productImages = listing.product
            ? (0, json_1.parseStringArray)(listing.product.images)
            : [];
        const listingImages = (0, json_1.parseStringArray)(listing.images);
        const images = listingImages.length > 0
            ? listingImages
            : listing.product?.imageUrl
                ? [listing.product.imageUrl]
                : productImages;
        return {
            id: listing.id,
            productId: listing.productId,
            externalId: listing.externalId,
            title: listing.title,
            description: listing.description,
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
            selectedVariantIds: (0, json_1.parseStringArray)(listing.selectedVariantIds),
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
};
exports.ListingsService = ListingsService;
exports.ListingsService = ListingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ebay_service_1.EbayService,
        users_service_1.UsersService])
], ListingsService);
//# sourceMappingURL=listings.service.js.map