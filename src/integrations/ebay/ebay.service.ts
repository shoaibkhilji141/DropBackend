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
import {
  MarketplaceConnectionView,
  MarketplaceOrder,
  MarketplaceOrderItem,
  SellerListing,
} from '../marketplace/marketplace.types';
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

  async isConnected(userId: string): Promise<boolean> {
    const account = await this.accounts.find(userId, Platform.EBAY);
    return Boolean(
      account?.accessToken &&
        account.status === LinkStatus.CONNECTED &&
        !this.accounts.isExpired(account),
    );
  }

  itemUrl(itemId: string | null | undefined, stored?: string | null): string | null {
    if (!itemId) return stored ?? null;
    return this.client.itemUrl(itemId, stored);
  }

  /**
   * Pulls the seller's active listings (with photos and sold counts) and recent
   * orders, then removes the seeded demo catalog so the UI shows the live shop.
   */
  async syncShop(userId: string): Promise<{ listings: number; orders: number; listingError: string | null }> {
    const token = await this.accessToken(userId);
    let listingError: string | null = null;
    let remote: SellerListing[] = [];

    try {
      remote = await this.client.listActiveListings(token);
    } catch (error) {
      listingError = error instanceof Error ? error.message : 'Could not load eBay listings';
      this.logger.warn(listingError);
    }

    const orderRemote = await this.client.listOrders(token);
    if (remote.length === 0) {
      const fromOrders = this.listingsFromOrders(orderRemote);
      if (fromOrders.length > 0) {
        remote = fromOrders;
        listingError = null;
      }
    }

    const listingCount = remote.length > 0 ? await this.upsertSellerListings(userId, remote) : 0;
    if (remote.length > 0 || listingError === null) {
      await this.purgeDemoCatalog();
    }

    const orders = await this.syncOrders(userId, orderRemote);
    if (listingError && orders > 0) {
      await this.prisma.order.deleteMany({ where: { externalId: { startsWith: 'EB-' } } });
    }
    return { listings: listingCount, orders, listingError };
  }

  async syncOrders(userId: string, prefetched?: MarketplaceOrder[]): Promise<number> {
    const store = await this.prisma.store.findFirst({
      where: { userId, platform: Platform.EBAY },
    });
    const remote = prefetched ?? (await this.client.listOrders(await this.accessToken(userId)));
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
        channel: 'EBAY',
        lineItemData: JSON.stringify(order.items.map((item) => item.lineItemId).filter(Boolean)),
        lastError: null,
      };
      const items = await Promise.all(order.items.map((item) => this.linkedOrderItem(item)));

      if (existing) {
        await this.prisma.orderItem.deleteMany({ where: { orderId: existing.id } });
        await this.prisma.order.update({
          where: { id: existing.id },
          data: { ...data, items: { create: items } },
        });
      } else {
        await this.prisma.order.create({
          data: {
            ...data,
            externalId: order.externalId,
            items: { create: items },
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

  private listingsFromOrders(orders: MarketplaceOrder[]): SellerListing[] {
    const grouped = new Map<string, SellerListing>();
    for (const order of orders) {
      for (const item of order.items) {
        if (!item.legacyItemId) continue;
        const current = grouped.get(item.legacyItemId);
        if (current) {
          current.soldCount += item.quantity;
          if (!current.images.length && item.imageUrl) current.images = [item.imageUrl];
          if (!current.price && item.unitPrice) current.price = item.unitPrice;
          continue;
        }
        grouped.set(item.legacyItemId, {
          itemId: item.legacyItemId,
          title: item.title,
          description: '',
          images: item.imageUrl ? [item.imageUrl] : [],
          price: item.unitPrice,
          currency: order.currency,
          quantity: 0,
          soldCount: item.quantity,
          sku: item.sku,
          itemUrl: this.client.itemUrl(item.legacyItemId) ?? '',
        });
      }
    }
    return [...grouped.values()].sort((a, b) => b.soldCount - a.soldCount);
  }

  private async upsertSellerListings(
    userId: string,
    remote: Awaited<ReturnType<EbayRestClient['listActiveListings']>>,
  ): Promise<number> {
    const store = await this.prisma.store.findFirst({
      where: { userId, platform: Platform.EBAY },
    });
    let upserted = 0;

    for (const item of remote) {
      const externalProductId = `ebay-item-${item.itemId}`;
      const images = JSON.stringify(item.images);
      const existingProduct = await this.prisma.product.findFirst({
        where: { userId, externalId: externalProductId },
      });
      const product = existingProduct
        ? await this.prisma.product.update({
            where: { id: existingProduct.id },
            data: {
              title: item.title,
              description: item.description || existingProduct.description,
              imageUrl: item.images[0] ?? existingProduct.imageUrl,
              images,
              category: item.category ?? existingProduct.category,
              currency: item.currency || existingProduct.currency,
              sellPrice: item.price,
              stock: item.quantity,
              ordersCount: item.soldCount,
              status: 'LISTED',
            },
          })
        : await this.prisma.product.create({
            data: {
              userId,
              externalId: externalProductId,
              title: item.title,
              description: item.description || null,
              imageUrl: item.images[0] ?? null,
              images,
              category: item.category,
              currency: item.currency || 'USD',
              sellPrice: item.price,
              stock: item.quantity,
              ordersCount: item.soldCount,
              status: 'LISTED',
            },
          });

      const existingListing = await this.prisma.listing.findFirst({
        where: { externalId: item.itemId },
      });
      const listingData = {
        productId: product.id,
        storeId: store?.id ?? existingListing?.storeId,
        title: item.title.slice(0, 80),
        description: item.description || item.title,
        images,
        category: item.category,
        sku: item.sku || item.itemId,
        price: item.price,
        quantity: item.quantity,
        soldCount: item.soldCount,
        itemUrl: item.itemUrl || this.client.itemUrl(item.itemId),
        status: 'PUBLISHED' as const,
        publishedAt: existingListing?.publishedAt ?? new Date(),
        lastError: null,
      };

      if (existingListing) {
        await this.prisma.listing.update({ where: { id: existingListing.id }, data: listingData });
      } else {
        await this.prisma.listing.create({
          data: { ...listingData, externalId: item.itemId },
        });
      }
      upserted += 1;
    }

    return upserted;
  }

  private async linkedOrderItem(item: MarketplaceOrderItem) {
    const listing = item.legacyItemId
      ? await this.prisma.listing.findFirst({
          where: { externalId: item.legacyItemId },
          select: { id: true, productId: true },
        })
      : null;
    if (listing && item.imageUrl) {
      const product = await this.prisma.product.findUnique({ where: { id: listing.productId } });
      if (product && !product.imageUrl) {
        await this.prisma.product.update({
          where: { id: product.id },
          data: { imageUrl: item.imageUrl, images: JSON.stringify([item.imageUrl]) },
        });
      }
    }
    return {
      title: item.title,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      listingId: listing?.id,
      productId: listing?.productId,
    };
  }

  /** Removes the local seed catalog once a real eBay sync has succeeded. */
  private async purgeDemoCatalog(): Promise<void> {
    await this.prisma.order.deleteMany({ where: { externalId: { startsWith: 'EB-' } } });
    await this.prisma.listing.deleteMany({ where: { externalId: { startsWith: 'ebay-' } } });
    await this.prisma.product.deleteMany({ where: { externalId: { startsWith: 'ae-' } } });
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
