import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { EbayRestClient } from './ebay-rest.client';
import { EbayService } from './ebay.service';

@Module({
  imports: [AccountsModule],
  providers: [EbayRestClient, EbayService],
  exports: [EbayService, EbayRestClient],
})
export class EbayModule {}
