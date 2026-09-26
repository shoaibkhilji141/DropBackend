import { Module } from '@nestjs/common';
import { SUPPLIER_PRODUCT_PROVIDER } from './aliexpress.types';
import { LocalAliExpressProvider } from './local-aliexpress.provider';

@Module({
  providers: [
    LocalAliExpressProvider,
    { provide: SUPPLIER_PRODUCT_PROVIDER, useExisting: LocalAliExpressProvider },
  ],
  exports: [SUPPLIER_PRODUCT_PROVIDER],
})
export class AliExpressModule {}
