import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SaveGoogleSheetDto {
  @ApiProperty({
    example: 'https://docs.google.com/spreadsheets/d/1WAJKwx-cWvZGeV5Z2kMpZ6eBHGoi7-FNljYMT_s8Pas/edit',
  })
  @IsString()
  spreadsheetUrl: string;

  @ApiPropertyOptional({ default: 'Product to Upload' })
  @IsOptional()
  @IsString()
  worksheetName?: string;

  @ApiPropertyOptional({ default: 2, description: '1-based column with AliExpress product links' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(26)
  supplierColumn?: number;

  @ApiPropertyOptional({ default: 3, description: '1-based column with eBay listing links' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(26)
  ebayColumn?: number;

  @ApiPropertyOptional({ default: 4, description: '1-based column with the product title' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(26)
  titleColumn?: number;
}
