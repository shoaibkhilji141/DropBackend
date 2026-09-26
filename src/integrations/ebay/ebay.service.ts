import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EbayConfig } from '../../config/configuration';

export interface MarketplaceStatus {
  platform: 'EBAY';
  configured: boolean;
  connected: boolean;
  /** Credential keys still missing from the environment. */
  missing: string[];
}

/**
 * Placeholder for the eBay Sell APIs. Nothing is called externally yet; the
 * methods describe the surface the rest of the application will depend on.
 */
@Injectable()
export class EbayService {
  constructor(private readonly configService: ConfigService) {}

  getStatus(): MarketplaceStatus {
    const ebay = this.configService.get<EbayConfig>('ebay') as EbayConfig;
    const missing = (
      [
        ['EBAY_APP_ID', ebay.appId],
        ['EBAY_DEV_ID', ebay.devId],
        ['EBAY_CERT_ID', ebay.certId],
        ['EBAY_CLIENT_SECRET', ebay.clientSecret],
        ['EBAY_REDIRECT_URI', ebay.redirectUri],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([key]) => key);

    return {
      platform: 'EBAY',
      configured: ebay.configured,
      connected: false,
      missing,
    };
  }

  publishListing(): never {
    throw new NotImplementedException(
      'eBay publishing is not implemented yet. Configure eBay credentials and add the Sell API client.',
    );
  }
}
