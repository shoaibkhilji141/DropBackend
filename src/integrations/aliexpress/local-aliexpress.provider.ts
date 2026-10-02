import { Injectable } from '@nestjs/common';
import { applyDevelopmentDrift } from './development-market';
import { LOCAL_SUPPLIER_CATALOG } from './local-catalog';
import {
  SupplierFacet,
  SupplierProduct,
  SupplierProductProvider,
  SupplierSearchQuery,
  SupplierSearchResult,
} from './aliexpress.types';

/**
 * Serves the local development catalog. Replace the registration in
 * AliExpressModule with a real API-backed provider once credentials exist.
 */
@Injectable()
export class LocalAliExpressProvider implements SupplierProductProvider {
  readonly name = 'aliexpress-local';

  isConfigured(): boolean {
    return true;
  }

  async search(query: SupplierSearchQuery): Promise<SupplierSearchResult> {
    const term = query.search?.trim().toLowerCase();

    const matches = LOCAL_SUPPLIER_CATALOG.filter((product) => {
      if (term) {
        const haystack = `${product.title} ${product.category} ${product.description}`.toLowerCase();
        const words = term.split(/\s+/).filter((word) => word.length > 2);
        const hit =
          haystack.includes(term) ||
          (words.length > 0 && words.filter((word) => haystack.includes(word)).length >= Math.min(2, words.length));
        if (!hit) return false;
      }
      if (query.category && product.category !== query.category) return false;
      if (query.supplier && product.supplier.name !== query.supplier) return false;
      if (query.minCostPrice !== undefined && product.costPrice < query.minCostPrice) return false;
      if (query.maxCostPrice !== undefined && product.costPrice > query.maxCostPrice) return false;
      if (query.minRating !== undefined && product.rating < query.minRating) return false;
      if (query.minOrders !== undefined && product.orders < query.minOrders) return false;
      if (query.inStockOnly && product.stock <= 0) return false;
      return true;
    });

    return {
      items: this.sort(matches, query.sort),
      facets: {
        categories: this.facet(matches, (product) => product.category),
        suppliers: this.facet(matches, (product) => product.supplier.name),
      },
    };
  }

  async getByExternalId(externalId: string): Promise<SupplierProduct | null> {
    const found = LOCAL_SUPPLIER_CATALOG.find((product) => product.externalId === externalId);
    return found ? applyDevelopmentDrift(found) : null;
  }

  private sort(products: SupplierProduct[], sort: SupplierSearchQuery['sort']): SupplierProduct[] {
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

  private facet(
    products: SupplierProduct[],
    pick: (product: SupplierProduct) => string,
  ): SupplierFacet[] {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      const value = pick(product);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }
}
