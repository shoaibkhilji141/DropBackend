import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  ListOnEbayDto,
  MatchAliExpressQueryDto,
  SearchEbayResearchDto,
  SearchSupplierProductsDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';
import { ProductView, ResearchProductView, ResearchSearchResultView } from './products.types';
import { ResearchInsightsService } from './research-insights.service';

@ApiTags('product-research')
@Controller('research')
export class ResearchController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly insights: ResearchInsightsService,
  ) {}

  @Get('ebay')
  @ApiOperation({ summary: 'Search live eBay UK listings for product research' })
  searchEbay(@Query() query: SearchEbayResearchDto) {
    return this.insights.searchMarketplaceCached({
      q: query.q,
      categoryId: query.categoryId,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      condition: query.condition,
      sort: query.sort,
      limit: query.limit,
      page: query.page,
    });
  }

  @Get('ebay/insight')
  @ApiOperation({ summary: 'Sales, keywords and SEO insight for one eBay UK listing' })
  getEbayInsight(@Query('itemId') itemId: string) {
    return this.insights.getInsight(itemId);
  }

  @Get('aliexpress/insight')
  @ApiOperation({
    summary: 'Keywords, similar products, eBay UK matches and policy for one AliExpress product',
  })
  getAliExpressInsight(@Query('externalId') externalId: string) {
    return this.insights.getAliExpressInsight(externalId);
  }

  @Get('aliexpress/match')
  @ApiOperation({ summary: 'Find AliExpress products that match an eBay listing by text or image' })
  matchAliExpress(@Query() query: MatchAliExpressQueryDto): Promise<ResearchSearchResultView> {
    return this.insights.matchAliExpress(query);
  }

  @Post('aliexpress/:externalId/list-on-ebay')
  @ApiOperation({ summary: 'Import an AliExpress product and list it on the connected eBay UK account' })
  listOnEbay(
    @Param('externalId') externalId: string,
    @Body() dto: ListOnEbayDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.insights.listOnEbay(externalId, dto, user);
  }

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
