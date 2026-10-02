import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AccountsModule } from '../integrations/accounts/accounts.module';
import { AliExpressModule } from '../integrations/aliexpress/aliexpress.module';
import { EbayModule } from '../integrations/ebay/ebay.module';
import { ListingsModule } from '../listings/listings.module';
import { ProfitModule } from '../profit/profit.module';
import { UsersModule } from '../users/users.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ResearchController } from './research.controller';
import { ResearchInsightsService } from './research-insights.service';

@Module({
  imports: [
    AliExpressModule,
    EbayModule,
    AccountsModule,
    UsersModule,
    ProfitModule,
    AiModule,
    ListingsModule,
  ],
  controllers: [ProductsController, ResearchController],
  providers: [ProductsService, ResearchInsightsService],
  exports: [ProductsService],
})
export class ProductsModule {}
