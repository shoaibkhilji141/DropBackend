"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalAliExpressProvider = void 0;
const common_1 = require("@nestjs/common");
const development_market_1 = require("./development-market");
const local_catalog_1 = require("./local-catalog");
let LocalAliExpressProvider = class LocalAliExpressProvider {
    name = 'aliexpress-local';
    isConfigured() {
        return true;
    }
    async search(query) {
        const term = query.search?.trim().toLowerCase();
        const matches = local_catalog_1.LOCAL_SUPPLIER_CATALOG.filter((product) => {
            if (term) {
                const haystack = `${product.title} ${product.category} ${product.description}`.toLowerCase();
                const words = term.split(/\s+/).filter((word) => word.length > 2);
                const hit = haystack.includes(term) ||
                    (words.length > 0 && words.filter((word) => haystack.includes(word)).length >= Math.min(2, words.length));
                if (!hit)
                    return false;
            }
            if (query.category && product.category !== query.category)
                return false;
            if (query.supplier && product.supplier.name !== query.supplier)
                return false;
            if (query.minCostPrice !== undefined && product.costPrice < query.minCostPrice)
                return false;
            if (query.maxCostPrice !== undefined && product.costPrice > query.maxCostPrice)
                return false;
            if (query.minRating !== undefined && product.rating < query.minRating)
                return false;
            if (query.minOrders !== undefined && product.orders < query.minOrders)
                return false;
            if (query.inStockOnly && product.stock <= 0)
                return false;
            return true;
        });
        const sorted = this.sort(matches, query.sort);
        const page = Math.max(query.page ?? 1, 1);
        const pageSize = Math.min(Math.max(query.pageSize ?? 24, 1), 60);
        const start = (page - 1) * pageSize;
        return {
            items: sorted.slice(start, start + pageSize),
            total: sorted.length,
            page,
            pageSize,
            facets: {
                categories: this.facet(matches, (product) => product.category),
                suppliers: this.facet(matches, (product) => product.supplier.name),
            },
        };
    }
    async getByExternalId(externalId) {
        const found = local_catalog_1.LOCAL_SUPPLIER_CATALOG.find((product) => product.externalId === externalId);
        return found ? (0, development_market_1.applyDevelopmentDrift)(found) : null;
    }
    sort(products, sort) {
        const sorted = [...products];
        switch (sort) {
            case 'costAsc':
                return sorted.sort((a, b) => a.costPrice - b.costPrice);
            case 'costDesc':
                return sorted.sort((a, b) => b.costPrice - a.costPrice);
            case 'ratingDesc':
                return sorted.sort((a, b) => b.rating - a.rating);
            case 'ordersDesc':
                return sorted.sort((a, b) => b.orders - a.orders);
            default:
                return sorted;
        }
    }
    facet(products, pick) {
        const counts = new Map();
        products.forEach((product) => {
            const value = pick(product);
            counts.set(value, (counts.get(value) ?? 0) + 1);
        });
        return [...counts.entries()]
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => a.value.localeCompare(b.value));
    }
};
exports.LocalAliExpressProvider = LocalAliExpressProvider;
exports.LocalAliExpressProvider = LocalAliExpressProvider = __decorate([
    (0, common_1.Injectable)()
], LocalAliExpressProvider);
//# sourceMappingURL=local-aliexpress.provider.js.map