import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { IntegrationAccountsService } from '../integrations/accounts/integration-accounts.service';
import { AliExpressApiProvider } from '../integrations/aliexpress/aliexpress-api.provider';
import { EbayService, MarketplaceStatus } from '../integrations/ebay/ebay.service';
import { MarketplaceConnectionView } from '../integrations/marketplace/marketplace.types';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { OAuthStateStore } from './oauth-state.store';

export interface ConnectionsOverview {
  ebay: MarketplaceStatus;
  aliexpress: MarketplaceConnectionView;
}

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly ebayService: EbayService,
    private readonly aliExpress: AliExpressApiProvider,
    private readonly accounts: IntegrationAccountsService,
    private readonly users: UsersService,
    private readonly oauthState: OAuthStateStore,
  ) {}

  async getOverview(identity?: AuthenticatedUser): Promise<ConnectionsOverview> {
    const user = await this.users.findCurrent(identity);
    const [ebayAccount, aliAccount] = await Promise.all([
      this.accounts.find(user.id, Platform.EBAY),
      this.accounts.find(user.id, Platform.ALIEXPRESS),
    ]);
    return {
      ebay: this.ebayService.getStatus(this.accounts.toPublic(ebayAccount)),
      aliexpress: this.aliExpress.getStatus(
        this.accounts.toPublic(aliAccount),
        this.accounts.capabilitiesOf(aliAccount),
      ),
    };
  }

  async startUrl(platform: 'ebay' | 'aliexpress', identity?: AuthenticatedUser): Promise<{ url: string }> {
    const user = await this.users.findCurrent(identity);
    const state = this.oauthState.create(user.id, platform);
    if (platform === 'ebay') {
      return { url: this.ebayService.authorizationUrl(state) };
    }
    if (!this.aliExpress.isConfigured()) {
      throw new BadRequestException('AliExpress app credentials are not configured.');
    }
    return { url: this.aliExpress.authorizationUrl(state) };
  }

  async handleCallback(
    platform: 'ebay' | 'aliexpress',
    code: string | undefined,
    state: string | undefined,
    error?: string,
  ): Promise<string> {
    const frontend = (this.configService.get<AppConfig>('app') as AppConfig).frontendUrl;
    const dest = platform === 'ebay' ? '/connections/ebay' : '/connections/aliexpress';
    if (error) return `${frontend}${dest}?error=${encodeURIComponent(error)}`;
    if (!code || !state) return `${frontend}${dest}?error=${encodeURIComponent('Missing authorization code')}`;

    try {
      const userId = this.oauthState.read(state, platform);
      if (platform === 'ebay') {
        await this.ebayService.completeOAuth(userId, code);
      } else {
        await this.aliExpress.completeOAuth(userId, code);
      }
      return `${frontend}${dest}?connected=1`;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Authorization failed';
      return `${frontend}${dest}?error=${encodeURIComponent(message)}`;
    }
  }

  async disconnect(platform: 'ebay' | 'aliexpress', identity?: AuthenticatedUser) {
    const user = await this.users.findCurrent(identity);
    if (platform === 'ebay') return this.ebayService.disconnect(user.id);
    return this.aliExpress.disconnect(user.id);
  }
}
