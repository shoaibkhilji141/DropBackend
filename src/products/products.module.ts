import { Module } from '@nestjs/common';
import { AccountsModule } from '../integrations/accounts/accounts.module';
import { AliExpressModule } from '../integrations/aliexpress/aliexpress.module';
import { EbayModule } from '../integrations/ebay/ebay.module';
import { ProfitModule } from '../profit/profit.module';
import { UsersModule } from '../users/users.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ResearchController } from './research.controller';

@Module({
  imports: [AliExpressModule, EbayModule, AccountsModule, UsersModule, ProfitModule],
  controllers: [ProductsController, ResearchController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
