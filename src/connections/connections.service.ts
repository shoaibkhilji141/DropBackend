import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AliExpressConfig } from '../config/configuration';
import { EbayService, MarketplaceStatus } from '../integrations/ebay/ebay.service';

export interface SupplierConnectionStatus {
  platform: 'ALIEXPRESS';
  configured: boolean;
  connected: boolean;
  missing: string[];
}

export interface ConnectionsOverview {
  ebay: MarketplaceStatus;
  aliexpress: SupplierConnectionStatus;
}

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly ebayService: EbayService,
  ) {}

  getEbayStatus(): MarketplaceStatus {
    return this.ebayService.getStatus();
  }

  getAliExpressStatus(): SupplierConnectionStatus {
    const config = this.configService.get<AliExpressConfig>('aliexpress') as AliExpressConfig;
    const missing = (
      [
        ['ALIEXPRESS_APP_KEY', config.appKey],
        ['ALIEXPRESS_APP_SECRET', config.appSecret],
        ['ALIEXPRESS_CALLBACK_URL', config.callbackUrl],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([key]) => key);

    return {
      platform: 'ALIEXPRESS',
      configured: config.configured,
      connected: false,
      missing,
    };
  }

  getOverview(): ConnectionsOverview {
    return {
      ebay: this.getEbayStatus(),
      aliexpress: this.getAliExpressStatus(),
    };
  }
}
