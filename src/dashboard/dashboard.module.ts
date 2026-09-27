import { Module } from '@nestjs/common';
import { AliExpressModule } from '../integrations/aliexpress/aliexpress.module';
import { EbayModule } from '../integrations/ebay/ebay.module';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [OrdersModule, EbayModule, AliExpressModule, UsersModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
