import { Module } from '@nestjs/common';
import { AccountsModule } from '../integrations/accounts/accounts.module';
import { AliExpressModule } from '../integrations/aliexpress/aliexpress.module';
import { EbayModule } from '../integrations/ebay/ebay.module';
import { GoogleSheetsClient } from '../integrations/google-sheets/google-sheets.client';
import { ListingsModule } from '../listings/listings.module';
import { UsersModule } from '../users/users.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { SheetMonitoringService } from './sheet-monitoring.service';

@Module({
  imports: [AliExpressModule, ListingsModule, AccountsModule, UsersModule, EbayModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, SheetMonitoringService, GoogleSheetsClient],
  exports: [MonitoringService, SheetMonitoringService],
})
export class MonitoringModule {}
