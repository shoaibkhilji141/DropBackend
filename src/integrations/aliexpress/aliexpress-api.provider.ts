import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LinkStatus, Platform } from '@prisma/client';
import { AliExpressConfig } from '../../config/configuration';
import { IntegrationAccountsService } from '../accounts/integration-accounts.service';
import { MarketplaceConnectionView, MarketplaceOrder } from '../marketplace/marketplace.types';
import { AliExpressApiClient } from './aliexpress-api.client';
import {
  SupplierProduct,
  SupplierProductProvider,
  SupplierSearchQuery,
  SupplierSearchResult,
} from './aliexpress.types';

@Injectable()
export class AliExpressApiProvider implements SupplierProductProvider {
  readonly name = 'aliexpress-api';
  private readonly logger = new Logger(AliExpressApiProvider.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly accounts: IntegrationAccountsService,
    private readonly client: AliExpressApiClient,
  ) {}

  isConfigured(): boolean {
    return this.configService.get<AliExpressConfig>('aliexpress')?.configured ?? false;
  }

  authorizationUrl(state: string): string {
    return this.client.authorizationUrl(state);
  }

  async completeOAuth(userId: string, code: string): Promise<MarketplaceConnectionView> {
    const tokens = await this.client.exchangeCode(code);
    const publicAccount = await this.accounts.upsertTokens(userId, Platform.ALIEXPRESS, tokens, {
      displayName: tokens.userNick,
      externalUserId: tokens.userId,
    });
    const capabilities: string[] = [];
    if (tokens.accessToken) {
      const probe = await this.client.call('aliexpress.ds.product.get', tokens.accessToken, {
        product_id: '0',
        ship_to_country: 'GB',
        target_currency: 'GBP',
        target_language: 'EN',
      });
      if (!probe.error || !/isv\.permission|insufficient|not authorized/i.test(probe.error)) {
        capabilities.push('aliexpress.ds.product.get');
      }
      const searchProbe = await this.client.call('aliexpress.ds.text.search', tokens.accessToken, {
        keyWord: 'phone',
        local: 'en_GB',
        countryCode: 'GB',
        currency: 'GBP',
        pageIndex: 1,
        pageSize: 1,
      });
      if (searchProbe.ok) capabilities.push('aliexpress.ds.text.search');
      await this.accounts.setCapabilities(userId, Platform.ALIEXPRESS, capabilities);
    }
    return this.getStatus(publicAccount, capabilities);
  }

  async disconnect(userId: string): Promise<MarketplaceConnectionView> {
    await this.accounts.disconnect(userId, Platform.ALIEXPRESS);
    return this.getStatus(null);
  }

  getStatus(
    accountPublic?: ReturnType<IntegrationAccountsService['toPublic']>,
    capabilities?: string[],
  ): MarketplaceConnectionView {
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

    const connected = accountPublic?.status === LinkStatus.CONNECTED;
    const expired =
      connected &&
      accountPublic?.tokenExpiresAt &&
      accountPublic.tokenExpiresAt.getTime() <= Date.now();

    let authorizationStatus: MarketplaceConnectionView['authorizationStatus'] = 'not_configured';
    if (config.configured && !connected) authorizationStatus = 'ready';
    if (connected) authorizationStatus = expired ? 'expired' : 'connected';
    if (accountPublic?.status === LinkStatus.ERROR) authorizationStatus = 'error';

    return {
      platform: 'ALIEXPRESS',
      configured: config.configured,
      connected: Boolean(connected && !expired),
      missing,
      displayName: accountPublic?.displayName ?? null,
      accountEmail: accountPublic?.accountEmail ?? null,
      externalUserId: accountPublic?.externalUserId ?? null,
      authorizationStatus,
      lastError: accountPublic?.lastError ?? null,
      expiresAt: accountPublic?.tokenExpiresAt?.toISOString() ?? null,
      capabilities: capabilities ?? [],
      dataSource: connected && !expired ? 'live' : 'local',
    };
  }

  async hasLiveSession(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const account = await this.accounts.findConnected(Platform.ALIEXPRESS);
    return Boolean(account?.accessToken && !this.accounts.isExpired(account));
  }

  async search(query: SupplierSearchQuery): Promise<SupplierSearchResult> {
    const token = await this.requireToken();
    return this.client.search(token, query);
  }

  async listOrders(): Promise<{ orders: MarketplaceOrder[]; error?: string }> {
    const token = await this.requireToken();
    return this.client.listOrders(token);
  }

  async getByExternalId(externalId: string): Promise<SupplierProduct | null> {
    const token = await this.requireToken();
    const product = await this.client.getProduct(token, externalId);
    if (!product) return null;
    try {
      const freight = await this.client.getFreight(token, externalId);
      if (freight.length > 0) {
        product.shippingOptions = freight;
        product.shippingCost = freight[0].cost;
        product.shippingEtaDays = freight[0].etaDaysMax;
      }
    } catch (error) {
      this.logger.warn(
        `Freight query unavailable: ${error instanceof Error ? error.message : error}`,
      );
    }
    return product;
  }

  private async requireToken(): Promise<string> {
    const account = await this.accounts.findConnected(Platform.ALIEXPRESS);
    if (!account?.accessToken) {
      throw new Error('AliExpress is not connected.');
    }
    if (this.accounts.isExpired(account)) {
      await this.accounts.markError(
        account.userId,
        Platform.ALIEXPRESS,
        'AliExpress access token expired. Official docs state refresh tokens are not usable; reconnect the account.',
      );
      throw new Error(
        'AliExpress access token expired. Official AliExpress OAuth does not support refresh; reconnect the account.',
      );
    }
    return account.accessToken;
  }
}
