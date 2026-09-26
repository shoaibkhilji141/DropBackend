import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MarketplaceStatus } from '../integrations/ebay/ebay.service';
import {
  ConnectionsOverview,
  ConnectionsService,
  SupplierConnectionStatus,
} from './connections.service';

@ApiTags('connections')
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  overview(): ConnectionsOverview {
    return this.connectionsService.getOverview();
  }

  @Get('ebay')
  ebay(): MarketplaceStatus {
    return this.connectionsService.getEbayStatus();
  }

  @Get('aliexpress')
  aliexpress(): SupplierConnectionStatus {
    return this.connectionsService.getAliExpressStatus();
  }
}
