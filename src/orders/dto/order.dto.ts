import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FulfillmentStatus, OrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ListOrdersQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: FulfillmentStatus })
  @IsOptional()
  @IsEnum(FulfillmentStatus)
  fulfillmentStatus?: FulfillmentStatus;

  @ApiPropertyOptional({ description: 'Search by buyer name, email or order id' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'EBAY sales or ALIEXPRESS purchase history' })
  @IsOptional()
  @IsString()
  channel?: string;
}

export class CreateAliExpressPurchaseDto {
  @ApiProperty({ description: 'Item title from AliExpress My Orders' })
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: 'Shop / store name' })
  @IsOptional()
  @IsString()
  shopName?: string;

  @ApiPropertyOptional({ description: 'AliExpress order number' })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trackingCode?: string;

  @ApiPropertyOptional({ description: 'Courier / logistics company' })
  @IsOptional()
  @IsString()
  trackingCarrier?: string;

  @ApiPropertyOptional({ description: 'Purchase date YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  placedAt?: string;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount?: number;
}

export class UpdateOrderDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: FulfillmentStatus })
  @IsOptional()
  @IsEnum(FulfillmentStatus)
  fulfillmentStatus?: FulfillmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trackingCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trackingCarrier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buyerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buyerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buyerAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buyerCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buyerCountry?: string;
}
