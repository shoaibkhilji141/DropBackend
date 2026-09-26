import { Module } from '@nestjs/common';
import { AliExpressModule } from '../integrations/aliexpress/aliexpress.module';
import { ListingsModule } from '../listings/listings.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [AliExpressModule, ListingsModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
