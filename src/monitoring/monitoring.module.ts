import { Module } from '@nestjs/common';
import { AccountsModule } from '../integrations/accounts/accounts.module';
import { AliExpressModule } from '../integrations/aliexpress/aliexpress.module';
import { ListingsModule } from '../listings/listings.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [AliExpressModule, ListingsModule, AccountsModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
