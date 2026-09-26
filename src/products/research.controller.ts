import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchSupplierProductsDto } from './dto/product.dto';
import { ProductsService } from './products.service';
import { ProductView, ResearchProductView, ResearchSearchResultView } from './products.types';

@ApiTags('product-research')
@Controller('research')
export class ResearchController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('products')
  @ApiOperation({
    summary: 'Search the supplier catalog with filters, sorting and pagination',
    description:
      'Reads from the configured SupplierProductProvider. Selling price, profit and margin are calculated by the backend profit service.',
  })
  search(@Query() query: SearchSupplierProductsDto): Promise<ResearchSearchResultView> {
    return this.productsService.searchSupplier(query);
  }

  @Get('products/:externalId')
  findOne(@Param('externalId') externalId: string): Promise<ResearchProductView> {
    return this.productsService.getSupplierProduct(externalId);
  }

  @Post('products/:externalId/save')
  @ApiOperation({ summary: 'Save a supplier product to the local research list' })
  save(@Param('externalId') externalId: string): Promise<ProductView> {
    return this.productsService.saveFromSupplier(externalId);
  }

  @Get('saved')
  @ApiOperation({ summary: 'List saved products' })
  saved(): Promise<ProductView[]> {
    return this.productsService.findAll({ status: 'SAVED' });
  }

  @Delete('saved/:id')
  @ApiOperation({ summary: 'Remove a product from the saved list' })
  removeSaved(@Param('id') id: string): Promise<{ id: string }> {
    return this.productsService.removeSaved(id);
  }
}
