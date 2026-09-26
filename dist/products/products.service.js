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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../common/prisma/prisma.service");
const aliexpress_types_1 = require("../integrations/aliexpress/aliexpress.types");
const profit_service_1 = require("../profit/profit.service");
const users_service_1 = require("../users/users.service");
const SUPPLIER_SORTS = new Set([
    'relevance',
    'costAsc',
    'costDesc',
    'ratingDesc',
    'ordersDesc',
]);
const parseImages = (value, fallback) => {
    if (value) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.filter((item) => typeof item === 'string');
            }
        }
        catch {
        }
    }
    return fallback ? [fallback] : [];
};
let ProductsService = class ProductsService {
    prisma;
    users;
    profit;
    supplier;
    constructor(prisma, users, profit, supplier) {
        this.prisma = prisma;
        this.users = users;
        this.profit = profit;
        this.supplier = supplier;
    }
    async searchSupplier(query) {
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
        const savedByExternalId = await this.savedLookup(result.items.map((product) => product.externalId));
        let items = result.items.map((product) => {
            const estimate = this.profit.estimate(product.costPrice, product.shippingCost);
            const savedId = savedByExternalId.get(product.externalId) ?? null;
            return { ...product, estimate, saved: savedId !== null, savedProductId: savedId };
        });
        items = items.filter((item) => {
            const { sellPrice, profit, margin } = item.estimate.breakdown;
            if (query.minSellPrice !== undefined && sellPrice < query.minSellPrice)
                return false;
            if (query.maxSellPrice !== undefined && sellPrice > query.maxSellPrice)
                return false;
            if (query.minProfit !== undefined && profit < query.minProfit)
                return false;
            if (query.minMargin !== undefined && margin < query.minMargin)
                return false;
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
    async getSupplierProduct(externalId) {
        const product = await this.supplier.getByExternalId(externalId);
        if (!product) {
            throw new common_1.NotFoundException(`Supplier product ${externalId} not found`);
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
    async saveFromSupplier(externalId) {
        const source = await this.supplier.getByExternalId(externalId);
        if (!source) {
            throw new common_1.NotFoundException(`Supplier product ${externalId} not found`);
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
                description: source.description,
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
                status: client_1.ProductStatus.SAVED,
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
    async removeSaved(id) {
        const product = await this.findRecord(id);
        if (product.status !== client_1.ProductStatus.SAVED) {
            throw new common_1.BadRequestException('Only saved products can be removed from the research list. Delete imported products from the product details page.');
        }
        await this.prisma.product.delete({ where: { id } });
        return { id };
    }
    async findAll(query) {
        const products = await this.prisma.product.findMany({
            where: {
                status: query.status,
                ...(query.search ? { title: { contains: query.search } } : {}),
            },
            include: { variants: true, supplier: true },
            orderBy: { updatedAt: 'desc' },
        });
        return products.map((product) => this.toView(product));
    }
    async findOne(id) {
        return this.toView(await this.findRecord(id));
    }
    async update(id, dto) {
        await this.findRecord(id);
        const updated = await this.prisma.product.update({
            where: { id },
            data: dto,
            include: { variants: true, supplier: true },
        });
        return this.toView(updated);
    }
    async remove(id) {
        await this.findRecord(id);
        return this.prisma.product.delete({ where: { id } });
    }
    async findRecord(id) {
        const product = await this.prisma.product.findUnique({
            where: { id },
            include: { variants: true, supplier: true },
        });
        if (!product) {
            throw new common_1.NotFoundException(`Product ${id} not found`);
        }
        return product;
    }
    toView(product) {
        return {
            id: product.id,
            externalId: product.externalId,
            title: product.title,
            description: product.description,
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
            estimate: this.profit.estimate(product.costPrice, product.shippingCost, product.sellPrice || undefined),
        };
    }
    getSupplierSnapshot(externalId) {
        return externalId ? this.supplier.getByExternalId(externalId) : Promise.resolve(null);
    }
    supplierSort(sort) {
        return sort && SUPPLIER_SORTS.has(sort)
            ? sort
            : undefined;
    }
    applyDerivedSort(items, sort) {
        switch (sort) {
            case 'profitDesc':
                return [...items].sort((a, b) => b.estimate.breakdown.profit - a.estimate.breakdown.profit);
            case 'marginDesc':
                return [...items].sort((a, b) => b.estimate.breakdown.margin - a.estimate.breakdown.margin);
            case 'sellPriceAsc':
                return [...items].sort((a, b) => a.estimate.breakdown.sellPrice - b.estimate.breakdown.sellPrice);
            case 'sellPriceDesc':
                return [...items].sort((a, b) => b.estimate.breakdown.sellPrice - a.estimate.breakdown.sellPrice);
            default:
                return items;
        }
    }
    async savedLookup(externalIds) {
        if (externalIds.length === 0)
            return new Map();
        const saved = await this.prisma.product.findMany({
            where: { externalId: { in: externalIds } },
            select: { id: true, externalId: true },
        });
        return new Map(saved
            .filter((product) => product.externalId !== null)
            .map((product) => [product.externalId, product.id]));
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)(aliexpress_types_1.SUPPLIER_PRODUCT_PROVIDER)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        users_service_1.UsersService,
        profit_service_1.ProfitService, Object])
], ProductsService);
//# sourceMappingURL=products.service.js.map