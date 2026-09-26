import { Module } from '@nestjs/common';
import { IntegrationAccountsService } from './integration-accounts.service';

@Module({
  providers: [IntegrationAccountsService],
  exports: [IntegrationAccountsService],
})
export class AccountsModule {}
