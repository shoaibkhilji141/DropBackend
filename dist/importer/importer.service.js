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
exports.ImporterService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../common/prisma/prisma.service");
const products_service_1 = require("../products/products.service");
const profit_service_1 = require("../profit/profit.service");
let ImporterService = class ImporterService {
    prisma;
    products;
    profit;
    constructor(prisma, products, profit) {
        this.prisma = prisma;
        this.products = products;
        this.profit = profit;
    }
    listImportable() {
        return this.products.findAll({ status: client_1.ProductStatus.SAVED });
    }
    async preview(productId) {
        const record = await this.products.findRecord(productId);
        const snapshot = await this.products.getSupplierSnapshot(record.externalId);
        return {
            product: this.products.toView(record),
            shippingOptions: snapshot?.shippingOptions ?? this.fallbackShipping(record),
            supplierSnapshot: snapshot,
        };
    }
    async previewProfit(productId, dto) {
        const record = await this.products.findRecord(productId);
        const productCost = this.costForVariants(record, dto.variantIds);
        const shippingCost = dto.shippingCost ?? record.shippingCost;
        return this.profit.breakdown(dto.sellPrice, productCost, shippingCost, dto);
    }
    async import(productId, dto) {
        const record = await this.products.findRecord(productId);
        if (record.variants.length > 0 && dto.variantIds) {
            const known = new Set(record.variants.map((variant) => variant.id));
            const unknown = dto.variantIds.filter((id) => !known.has(id));
            if (unknown.length > 0) {
                throw new common_1.BadRequestException(`Unknown variant ids: ${unknown.join(', ')}`);
            }
        }
        const selectedIds = dto.variantIds ?? record.variants.map((variant) => variant.id);
        const productCost = this.costForVariants(record, selectedIds);
        const shippingCost = dto.shippingCost ?? record.shippingCost;
        const breakdown = this.profit.breakdown(dto.sellPrice, productCost, shippingCost, dto);
        const selectedVariants = record.variants.filter((variant) => selectedIds.includes(variant.id));
        const quantity = Math.min(selectedVariants.reduce((sum, variant) => sum + variant.stock, 0) || record.stock, 100);
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
                    status: client_1.ProductStatus.IMPORTED,
                    importedAt: new Date(),
                },
                include: { variants: true, supplier: true },
            });
            let listing = null;
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
                        status: client_1.ListingStatus.DRAFT,
                    },
                });
            }
            await tx.profitRecord.create({
                data: {
                    productId,
                    type: client_1.ProfitType.ESTIMATED,
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
    costForVariants(record, variantIds) {
        if (record.variants.length === 0)
            return record.costPrice;
        const selected = variantIds?.length
            ? record.variants.filter((variant) => variantIds.includes(variant.id))
            : record.variants;
        if (selected.length === 0)
            return record.costPrice;
        return Math.max(...selected.map((variant) => variant.costPrice));
    }
    fallbackShipping(record) {
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
};
exports.ImporterService = ImporterService;
exports.ImporterService = ImporterService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        products_service_1.ProductsService,
        profit_service_1.ProfitService])
], ImporterService);
//# sourceMappingURL=importer.service.js.map