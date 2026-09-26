import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AliExpressApiClient } from './aliexpress-api.client';
import { AliExpressApiProvider } from './aliexpress-api.provider';
import { SUPPLIER_PRODUCT_PROVIDER } from './aliexpress.types';
import { LocalAliExpressProvider } from './local-aliexpress.provider';
import { RoutingSupplierProvider } from './routing-supplier.provider';

@Module({
  imports: [AccountsModule],
  providers: [
    LocalAliExpressProvider,
    AliExpressApiClient,
    AliExpressApiProvider,
    RoutingSupplierProvider,
    { provide: SUPPLIER_PRODUCT_PROVIDER, useExisting: RoutingSupplierProvider },
  ],
  exports: [SUPPLIER_PRODUCT_PROVIDER, AliExpressApiProvider, AliExpressApiClient],
})
export class AliExpressModule {}
