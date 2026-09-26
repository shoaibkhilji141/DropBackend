import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ImportPreviewView, ProductView } from '../products/products.types';
import { ProfitBreakdownDto } from '../profit/dto/profit.dto';
import { ImportProductDto, PreviewProfitDto } from './dto/importer.dto';
import { ImporterService, ImportResultView } from './importer.service';

@ApiTags('importer')
@Controller('importer')
export class ImporterController {
  constructor(private readonly importerService: ImporterService) {}

  @Get('products')
  @ApiOperation({ summary: 'Saved products that can be imported' })
  importable(): Promise<ProductView[]> {
    return this.importerService.listImportable();
  }

  @Get('products/:id/preview')
  @ApiOperation({ summary: 'Review payload: product, images, variants, stock and shipping' })
  preview(@Param('id') id: string): Promise<ImportPreviewView> {
    return this.importerService.preview(id);
  }

  @Post('products/:id/profit')
  @ApiOperation({ summary: 'Recalculate estimated profit for the selected options' })
  profit(@Param('id') id: string, @Body() dto: PreviewProfitDto): Promise<ProfitBreakdownDto> {
    return this.importerService.previewProfit(id, dto);
  }

  @Post('products/:id/import')
  @ApiOperation({
    summary: 'Import the product and optionally create an internal listing draft',
    description: 'Nothing is published to eBay; the listing is stored locally as a DRAFT.',
  })
  import(@Param('id') id: string, @Body() dto: ImportProductDto): Promise<ImportResultView> {
    return this.importerService.import(id, dto);
  }
}
