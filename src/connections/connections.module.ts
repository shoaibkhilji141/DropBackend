import { Module } from '@nestjs/common';
import { AccountsModule } from '../integrations/accounts/accounts.module';
import { AliExpressModule } from '../integrations/aliexpress/aliexpress.module';
import { EbayModule } from '../integrations/ebay/ebay.module';
import { UsersModule } from '../users/users.module';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { OAuthStateStore } from './oauth-state.store';

@Module({
  imports: [EbayModule, AliExpressModule, AccountsModule, UsersModule],
  controllers: [ConnectionsController],
  providers: [ConnectionsService, OAuthStateStore],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
