import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SupplierSortOption } from '../../integrations/aliexpress/aliexpress.types';

const SUPPLIER_SORTS: SupplierSortOption[] = [
  'relevance',
  'costAsc',
  'costDesc',
  'ratingDesc',
  'ordersDesc',
];

/** Sorts that depend on our own pricing rules rather than supplier fields. */
export const DERIVED_SORTS = ['profitDesc', 'marginDesc', 'sellPriceAsc', 'sellPriceDesc'] as const;
export type ResearchSortOption = SupplierSortOption | (typeof DERIVED_SORTS)[number];

const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;

export class SearchSupplierProductsDto {
  @ApiPropertyOptional({ description: 'Free-text search over title, category and description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Supplier name' })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional({ description: 'Minimum supplier cost price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minCostPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum supplier cost price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxCostPrice?: number;

  @ApiPropertyOptional({ description: 'Minimum suggested selling price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minSellPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum suggested selling price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxSellPrice?: number;

  @ApiPropertyOptional({ description: 'Minimum estimated profit per unit' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minProfit?: number;

  @ApiPropertyOptional({ description: 'Minimum estimated profit margin percentage' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minMargin?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ description: 'Minimum supplier order count' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrders?: number;

  @ApiPropertyOptional({ description: 'Only products currently in stock' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  inStockOnly?: boolean;

  @ApiPropertyOptional({
    enum: [...SUPPLIER_SORTS, ...DERIVED_SORTS],
    default: 'relevance',
  })
  @IsOptional()
  @IsIn([...SUPPLIER_SORTS, ...DERIVED_SORTS])
  sort?: ResearchSortOption;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  pageSize?: number;
}

export class ListProductsQueryDto {
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'AliExpress product page used as the supply source' })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}

export class SearchEbayResearchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'eBay category id' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['NEW', 'USED', ''])
  condition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['sold', 'sold7', 'sold30', 'priceAsc', 'priceDesc', 'newest'])
  sort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
