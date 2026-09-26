import { Module } from '@nestjs/common';
import { EbayService } from './ebay.service';

@Module({
  providers: [EbayService],
  exports: [EbayService],
})
export class EbayModule {}
