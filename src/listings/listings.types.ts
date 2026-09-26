import { ListingStatus, Prisma } from '@prisma/client';
import { ProductVariantView } from '../products/products.types';

export type ListingRecord = Prisma.ListingGetPayload<{
  include: { product: { include: { variants: true } }; store: true };
}>;

export interface ListingView {
  id: string;
  productId: string;
  externalId: string | null;
  title: string;
  description: string | null;
  images: string[];
  category: string | null;
  sku: string | null;
  price: number;
  quantity: number;
  shippingMethod: string | null;
  shippingCost: number;
  shippingEtaDays: number | null;
  selectedVariantIds: string[];
  status: ListingStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    title: string;
    imageUrl: string | null;
    images: string[];
    costPrice: number;
    shippingCost: number;
    category: string | null;
    variants: ProductVariantView[];
  } | null;
  store: { id: string; name: string } | null;
}
