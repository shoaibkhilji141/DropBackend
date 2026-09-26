import { Module } from '@nestjs/common';
import { EbayModule } from '../integrations/ebay/ebay.module';
import { ProfitModule } from '../profit/profit.module';
import { UsersModule } from '../users/users.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [ProfitModule, EbayModule, UsersModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
