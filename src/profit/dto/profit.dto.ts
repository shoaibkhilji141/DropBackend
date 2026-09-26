import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Cost assumptions that can be overridden per calculation. */
export class ProfitCostOptionsDto {
  @ApiPropertyOptional({ description: 'Marketplace fee percentage', default: 12.9 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  marketplaceFeePercent?: number;

  @ApiPropertyOptional({ description: 'Payment processing fee percentage', default: 2.9 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paymentFeePercent?: number;

  @ApiPropertyOptional({ description: 'Fixed fee per order', default: 0.3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedFee?: number;

  @ApiPropertyOptional({
    description: 'Other configurable costs per order, such as packaging or ad spend',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  additionalCosts?: number;
}

export class CalculateProfitDto extends ProfitCostOptionsDto {
  @ApiProperty({ description: 'Selling price on the marketplace' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellPrice: number;

  @ApiProperty({ description: 'Supplier cost price' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingCost?: number;
}

export class ProfitBreakdownDto {
  @ApiProperty({ description: 'Selling price used for the calculation' }) sellPrice: number;
  @ApiProperty({ description: 'Revenue, equal to the selling price' }) revenue: number;
  @ApiProperty({ description: 'Supplier product cost' }) productCost: number;
  @ApiProperty() shippingCost: number;
  @ApiProperty({ description: 'Other configurable costs' }) additionalCosts: number;
  @ApiProperty({ description: 'Marketplace, payment and fixed fees combined' }) fees: number;
  @ApiProperty({ description: 'Product cost + shipping + additional costs + fees' })
  totalCost: number;
  @ApiProperty() profit: number;
  @ApiProperty({ description: 'Profit as a percentage of revenue' }) margin: number;
  @ApiProperty({ description: 'Profit relative to total cost' }) roi: number;
}

export class ProfitSettingsDto extends ProfitCostOptionsDto {
  @ApiProperty({ description: 'Multiplier applied to landed cost to suggest a selling price' })
  defaultMarkupMultiplier: number;

  @ApiProperty() currency: string;
}

export class UpdateProfitSettingsDto extends ProfitCostOptionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  defaultMarkupMultiplier?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;
}
