import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ProfitCostOptionsDto } from '../../profit/dto/profit.dto';

const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;

export class ImportProductDto extends ProfitCostOptionsDto {
  @ApiProperty({ description: 'Selling price to use on the marketplace listing' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellPrice: number;

  @ApiPropertyOptional({
    description: 'Variant ids to include. Omit to keep every variant selected.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  variantIds?: string[];

  @ApiPropertyOptional({ description: 'Shipping method chosen from the supplier options' })
  @IsOptional()
  @IsString()
  shippingMethod?: string;

  @ApiPropertyOptional({ description: 'Shipping cost for the chosen method' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @ApiPropertyOptional({ description: 'Create an internal eBay listing draft', default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  createListingDraft?: boolean;

  @ApiPropertyOptional({ description: 'Listing title override, max 80 characters' })
  @IsOptional()
  @IsString()
  listingTitle?: string;
}

export class PreviewProfitDto extends ProfitCostOptionsDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellPrice: number;

  @ApiPropertyOptional({ description: 'Shipping cost override for the preview' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variantIds?: string[];
}
