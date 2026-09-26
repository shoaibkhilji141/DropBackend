import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { ProfitModule } from '../profit/profit.module';
import { ImporterController } from './importer.controller';
import { ImporterService } from './importer.service';

@Module({
  imports: [ProductsModule, ProfitModule],
  controllers: [ImporterController],
  providers: [ImporterService],
})
export class ImporterModule {}
