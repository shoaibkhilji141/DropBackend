import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LinkStatus, Platform } from '@prisma/client';
import { EbayConfig } from '../../config/configuration';
import { parseStringArray } from '../../common/json';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IntegrationAccountsService } from '../accounts/integration-accounts.service';
import { MarketplaceConnectionView } from '../marketplace/marketplace.types';
import { EbayRestClient } from './ebay-rest.client';

export interface MarketplaceStatus extends MarketplaceConnectionView {
  platform: 'EBAY';
}

@Injectable()
export class EbayService {
  private readonly logger = new Logger(EbayService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly accounts: IntegrationAccountsService,
    private readonly client: EbayRestClient,
  ) {}

  getStatus(accountPublic?: ReturnType<IntegrationAccountsService['toPublic']>): MarketplaceStatus {
    const ebay = this.configService.get<EbayConfig>('ebay') as EbayConfig;
    const missing = (
      [
        ['EBAY_APP_ID', ebay.appId],
        ['EBAY_DEV_ID', ebay.devId],
        ['EBAY_CERT_ID', ebay.certId],
        ['EBAY_CLIENT_SECRET', ebay.clientSecret],
        ['EBAY_RU_NAME', ebay.ruName],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([key]) => key);

    const connected = accountPublic?.status === LinkStatus.CONNECTED;
    const expired =
      connected &&
      accountPublic?.tokenExpiresAt &&
      accountPublic.tokenExpiresAt.getTime() <= Date.now();

    let authorizationStatus: MarketplaceStatus['authorizationStatus'] = 'not_configured';
    if (ebay.configured && !connected) authorizationStatus = 'ready';
    if (connected) authorizationStatus = expired ? 'expired' : 'connected';
    if (accountPublic?.status === LinkStatus.ERROR) authorizationStatus = 'error';

    return {
      platform: 'EBAY',
      configured: ebay.configured,
      connected: Boolean(connected && !expired),
      missing,
      displayName: accountPublic?.displayName ?? null,
      accountEmail: accountPublic?.accountEmail ?? null,
      externalUserId: accountPublic?.externalUserId ?? null,
      authorizationStatus,
      lastError: accountPublic?.lastError ?? null,
      scopes: accountPublic?.scopes ?? this.client.scopes().join(' '),
      expiresAt: accountPublic?.tokenExpiresAt?.toISOString() ?? null,
      capabilities: [
        'sell.inventory',
        'sell.fulfillment',
        'sell.account',
        'commerce.identity.readonly',
      ],
    };
  }

  authorizationUrl(state: string): string {
    const ebay = this.configService.get<EbayConfig>('ebay') as EbayConfig;
    if (!ebay.configured) {
      throw new BadRequestException(
        'eBay is not configured. Set EBAY_APP_ID, EBAY_CERT_ID / EBAY_CLIENT_SECRET, and EBAY_RU_NAME (the RuName from the eBay developer portal, not the HTTPS URL).',
      );
    }
    return this.client.authorizationUrl(state);
  }

  async completeOAuth(userId: string, code: string): Promise<MarketplaceStatus> {
    const tokens = await this.client.exchangeCode(code);
    const profile = await this.client.getAccountInfo(tokens.accessToken);
    const publicAccount = await this.accounts.upsertTokens(userId, Platform.EBAY, tokens, profile);

    const store = await this.prisma.store.findFirst({
      where: { userId, platform: Platform.EBAY },
    });
    if (store) {
      await this.prisma.store.update({
        where: { id: store.id },
        data: { status: LinkStatus.CONNECTED, name: profile.displayName || store.name },
      });
    } else {
      await this.prisma.store.create({
        data: {
          userId,
          name: profile.displayName || 'eBay store',
          platform: Platform.EBAY,
          status: LinkStatus.CONNECTED,
        },
      });
    }

    return this.getStatus(publicAccount);
  }

  async disconnect(userId: string): Promise<MarketplaceStatus> {
    await this.accounts.disconnect(userId, Platform.EBAY);
    await this.prisma.store.updateMany({
      where: { userId, platform: Platform.EBAY },
      data: { status: LinkStatus.DISCONNECTED },
    });
    return this.getStatus(await this.accounts.find(userId, Platform.EBAY).then((row) => this.accounts.toPublic(row)));
  }

  async accessToken(userId: string): Promise<string> {
    const account = await this.accounts.find(userId, Platform.EBAY);
    if (!account?.accessToken || account.status !== LinkStatus.CONNECTED) {
      throw new BadRequestException('eBay is not connected. Authorize the seller account first.');
    }
    if (this.accounts.isExpired(account) && account.refreshToken) {
      try {
        const refreshed = await this.client.refresh(account.refreshToken);
        await this.accounts.upsertTokens(userId, Platform.EBAY, {
          ...refreshed,
          refreshToken: refreshed.refreshToken ?? account.refreshToken,
        });
        return refreshed.accessToken;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'eBay token refresh failed';
        await this.accounts.markError(userId, Platform.EBAY, message);
        throw new BadRequestException('eBay access expired. Reconnect the seller account.');
      }
    }
    if (this.accounts.isExpired(account)) {
      throw new BadRequestException('eBay access expired. Reconnect the seller account.');
    }
    return account.accessToken;
  }

  async publishListing(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { product: true, store: true },
    });
    if (!listing) throw new NotFoundException(`Listing ${listingId} not found`);

    const token = await this.accessToken(userId);
    try {
      const published = await this.client.publishListing(token, {
        sku: listing.sku || listing.product?.externalId || listing.id,
        title: listing.title,
        description: listing.description || listing.title,
        images: parseStringArray(listing.images),
        price: listing.price,
        quantity: listing.quantity,
        category: listing.category ?? listing.product?.category,
      });

      return this.prisma.listing.update({
        where: { id: listing.id },
        data: {
          externalId: published.listingId,
          offerId: published.offerId,
          sku: published.sku,
          status: 'PUBLISHED',
          publishedAt: listing.publishedAt ?? new Date(),
          lastError: null,
        },
        include: { product: { include: { variants: true } }, store: true },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'eBay publish failed';
      this.logger.warn(message);
      await this.prisma.listing.update({
        where: { id: listing.id },
        data: { status: 'ERROR', lastError: message },
      });
      throw new BadRequestException(message);
    }
  }

  async updateInventory(userId: string, sku: string, price: number, quantity: number): Promise<void> {
    const token = await this.accessToken(userId);
    await this.client.updatePriceQuantity(token, sku, price, quantity);
  }

  async syncOrders(userId: string): Promise<number> {
    const token = await this.accessToken(userId);
    const store = await this.prisma.store.findFirst({
      where: { userId, platform: Platform.EBAY },
    });
    const remote = await this.client.listOrders(token);
    let upserted = 0;

    for (const order of remote) {
      if (!order.externalId) continue;
      const existing = await this.prisma.order.findFirst({ where: { externalId: order.externalId } });
      const mappedStatus = this.mapOrderStatus(order.status);
      const data = {
        storeId: store?.id ?? existing?.storeId,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        buyerAddress: order.buyerAddress,
        buyerCity: order.buyerCity,
        buyerCountry: order.buyerCountry,
        status: mappedStatus.status,
        fulfillmentStatus: mappedStatus.fulfillment,
        currency: order.currency,
        totalAmount: order.totalAmount,
        placedAt: order.placedAt,
        lineItemData: JSON.stringify(order.items.map((item) => item.lineItemId).filter(Boolean)),
        lastError: null,
      };

      if (existing) {
        await this.prisma.order.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.order.create({
          data: {
            ...data,
            externalId: order.externalId,
            items: {
              create: order.items.map((item) => ({
                title: item.title,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
              })),
            },
          },
        });
      }
      upserted += 1;
    }

    await this.prisma.integrationAccount.updateMany({
      where: { userId, platform: Platform.EBAY },
      data: { lastSyncedAt: new Date() },
    });
    return upserted;
  }

  async pushTracking(userId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (!order.externalId || !order.trackingCode || !order.trackingCarrier) {
      throw new BadRequestException('Order needs an eBay order id, tracking code, and carrier.');
    }
    let ids: string[] = [];
    try {
      ids = (JSON.parse(order.lineItemData ?? '[]') as unknown[]).filter(
        (item): item is string => typeof item === 'string' && item.length > 0,
      );
    } catch {
      ids = [];
    }
    if (ids.length === 0) {
      throw new BadRequestException(
        'No eBay lineItemId is stored for this order. Sync orders from eBay first.',
      );
    }
    const token = await this.accessToken(userId);
    await this.client.pushTracking(token, order.externalId, {
      carrier: order.trackingCarrier,
      number: order.trackingCode,
      lineItemIds: ids,
    });
  }

  private mapOrderStatus(status: string): {
    status: 'PENDING' | 'PAID' | 'FULFILLED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
    fulfillment: 'UNFULFILLED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED';
  } {
    const value = status.toUpperCase();
    if (value.includes('FULFILLED') || value === 'FULFILLED') {
      return { status: 'FULFILLED', fulfillment: 'SHIPPED' };
    }
    if (value.includes('IN_PROGRESS') || value.includes('NOT_STARTED')) {
      return { status: 'PAID', fulfillment: 'UNFULFILLED' };
    }
    return { status: 'PAID', fulfillment: 'PROCESSING' };
  }
}
