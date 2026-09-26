import { Module } from '@nestjs/common';
import { EbayModule } from '../integrations/ebay/ebay.module';
import { UsersModule } from '../users/users.module';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  imports: [EbayModule, UsersModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
