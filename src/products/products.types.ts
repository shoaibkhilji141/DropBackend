import { Prisma, ProductStatus } from '@prisma/client';
import {
  SupplierFacet,
  SupplierProduct,
  SupplierShippingOption,
} from '../integrations/aliexpress/aliexpress.types';
import { ProfitBreakdownDto } from '../profit/dto/profit.dto';

export type ProductRecord = Prisma.ProductGetPayload<{
  include: { variants: true; supplier: true };
}>;

export interface ProductEstimateView {
  suggestedSellPrice: number;
  breakdown: ProfitBreakdownDto;
}

/** A supplier catalog product enriched with our pricing and save state. */
export interface ResearchProductView extends SupplierProduct {
  estimate: ProductEstimateView;
  saved: boolean;
  savedProductId: string | null;
}

export interface ResearchSearchResultView {
  items: ResearchProductView[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  facets: {
    categories: SupplierFacet[];
    suppliers: SupplierFacet[];
  };
}

export interface ProductVariantView {
  id: string;
  externalId: string | null;
  sku: string | null;
  name: string;
  attributes: string | null;
  imageUrl: string | null;
  costPrice: number;
  sellPrice: number;
  stock: number;
  selected: boolean;
}

/** A stored product, with gallery images parsed and pricing attached. */
export interface ProductView {
  id: string;
  externalId: string | null;
  title: string;
  description: string | null;
  images: string[];
  sourceUrl: string | null;
  category: string | null;
  currency: string;
  costPrice: number;
  shippingCost: number;
  sellPrice: number;
  stock: number;
  rating: number | null;
  ordersCount: number | null;
  reviews: number | null;
  shippingMethod: string | null;
  shippingEtaDays: number | null;
  status: ProductStatus;
  importedAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: { id: string; name: string; score: number | null } | null;
  variants: ProductVariantView[];
  estimate: ProductEstimateView;
}

export interface ImportPreviewView {
  product: ProductView;
  shippingOptions: SupplierShippingOption[];
  /** Null when the product no longer exists in the supplier catalog. */
  supplierSnapshot: SupplierProduct | null;
}
