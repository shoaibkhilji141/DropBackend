"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EbayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EbayService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const json_1 = require("../../common/json");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const integration_accounts_service_1 = require("../accounts/integration-accounts.service");
const ebay_rest_client_1 = require("./ebay-rest.client");
let EbayService = EbayService_1 = class EbayService {
    configService;
    prisma;
    accounts;
    client;
    logger = new common_1.Logger(EbayService_1.name);
    constructor(configService, prisma, accounts, client) {
        this.configService = configService;
        this.prisma = prisma;
        this.accounts = accounts;
        this.client = client;
    }
    getStatus(accountPublic) {
        const ebay = this.configService.get('ebay');
        const missing = [
            ['EBAY_APP_ID', ebay.appId],
            ['EBAY_DEV_ID', ebay.devId],
            ['EBAY_CERT_ID', ebay.certId],
            ['EBAY_CLIENT_SECRET', ebay.clientSecret],
            ['EBAY_RU_NAME', ebay.ruName],
        ]
            .filter(([, value]) => !value)
            .map(([key]) => key);
        const connected = accountPublic?.status === client_1.LinkStatus.CONNECTED;
        const expired = connected &&
            accountPublic?.tokenExpiresAt &&
            accountPublic.tokenExpiresAt.getTime() <= Date.now();
        let authorizationStatus = 'not_configured';
        if (ebay.configured && !connected)
            authorizationStatus = 'ready';
        if (connected)
            authorizationStatus = expired ? 'expired' : 'connected';
        if (accountPublic?.status === client_1.LinkStatus.ERROR)
            authorizationStatus = 'error';
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
    authorizationUrl(state) {
        const ebay = this.configService.get('ebay');
        if (!ebay.configured) {
            throw new common_1.BadRequestException('eBay is not configured. Set EBAY_APP_ID, EBAY_CERT_ID / EBAY_CLIENT_SECRET, and EBAY_RU_NAME (the RuName from the eBay developer portal, not the HTTPS URL).');
        }
        return this.client.authorizationUrl(state);
    }
    async completeOAuth(userId, code) {
        const tokens = await this.client.exchangeCode(code);
        const profile = await this.client.getAccountInfo(tokens.accessToken);
        const publicAccount = await this.accounts.upsertTokens(userId, client_1.Platform.EBAY, tokens, profile);
        const store = await this.prisma.store.findFirst({
            where: { userId, platform: client_1.Platform.EBAY },
        });
        if (store) {
            await this.prisma.store.update({
                where: { id: store.id },
                data: { status: client_1.LinkStatus.CONNECTED, name: profile.displayName || store.name },
            });
        }
        else {
            await this.prisma.store.create({
                data: {
                    userId,
                    name: profile.displayName || 'eBay store',
                    platform: client_1.Platform.EBAY,
                    status: client_1.LinkStatus.CONNECTED,
                },
            });
        }
        return this.getStatus(publicAccount);
    }
    async disconnect(userId) {
        await this.accounts.disconnect(userId, client_1.Platform.EBAY);
        await this.prisma.store.updateMany({
            where: { userId, platform: client_1.Platform.EBAY },
            data: { status: client_1.LinkStatus.DISCONNECTED },
        });
        return this.getStatus(await this.accounts.find(userId, client_1.Platform.EBAY).then((row) => this.accounts.toPublic(row)));
    }
    async accessToken(userId) {
        const account = await this.accounts.find(userId, client_1.Platform.EBAY);
        if (!account?.accessToken || account.status !== client_1.LinkStatus.CONNECTED) {
            throw new common_1.BadRequestException('eBay is not connected. Authorize the seller account first.');
        }
        if (this.accounts.isExpired(account) && account.refreshToken) {
            try {
                const refreshed = await this.client.refresh(account.refreshToken);
                await this.accounts.upsertTokens(userId, client_1.Platform.EBAY, {
                    ...refreshed,
                    refreshToken: refreshed.refreshToken ?? account.refreshToken,
                });
                return refreshed.accessToken;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'eBay token refresh failed';
                await this.accounts.markError(userId, client_1.Platform.EBAY, message);
                throw new common_1.BadRequestException('eBay access expired. Reconnect the seller account.');
            }
        }
        if (this.accounts.isExpired(account)) {
            throw new common_1.BadRequestException('eBay access expired. Reconnect the seller account.');
        }
        return account.accessToken;
    }
    async searchMarketplace(query) {
        const result = await this.client.searchMarketplace(query ?? {});
        const pageSize = result.limit;
        const page = Math.floor(result.offset / pageSize) + 1;
        return {
            items: result.items,
            marketplace: this.configService.get('ebay')?.marketplaceId ?? 'EBAY_GB',
            page,
            pageSize,
            total: result.total,
            pageCount: Math.max(1, Math.ceil(result.total / pageSize)),
        };
    }
    async publishListing(userId, listingId, extras) {
        const listing = await this.prisma.listing.findUnique({
            where: { id: listingId },
            include: { product: { include: { variants: true } }, store: true },
        });
        if (!listing)
            throw new common_1.NotFoundException(`Listing ${listingId} not found`);
        const token = await this.accessToken(userId);
        const images = (0, json_1.parseStringArray)(listing.images);
        const description = listing.description || listing.title;
        const selectedIds = (0, json_1.parseStringArray)(listing.selectedVariantIds);
        const selectedVariants = (listing.product?.variants ?? []).filter((variant) => selectedIds.length === 0 || selectedIds.includes(variant.id));
        const variationInput = this.variationInput(listing, selectedVariants, extras?.aspects);
        try {
            const published = variationInput
                ? await this.client.publishVariationListing(token, variationInput)
                : await this.client.publishListing(token, {
                    sku: listing.sku || listing.product?.externalId || listing.id,
                    title: listing.title,
                    description,
                    images,
                    price: listing.price,
                    quantity: listing.quantity,
                    category: listing.category ?? listing.product?.category,
                    aspects: extras?.aspects,
                });
            await this.prisma.product.update({
                where: { id: listing.productId },
                data: { status: 'LISTED' },
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'eBay publish failed';
            this.logger.warn(message);
            await this.prisma.listing.update({
                where: { id: listing.id },
                data: { status: 'ERROR', lastError: message },
            });
            throw new common_1.BadRequestException(message);
        }
    }
    async updateInventory(userId, sku, price, quantity) {
        const token = await this.accessToken(userId);
        await this.client.updatePriceQuantity(token, sku, price, quantity);
    }
    async isConnected(userId) {
        const account = await this.accounts.find(userId, client_1.Platform.EBAY);
        return Boolean(account?.accessToken &&
            account.status === client_1.LinkStatus.CONNECTED &&
            !this.accounts.isExpired(account));
    }
    itemUrl(itemId, stored) {
        if (!itemId)
            return stored ?? null;
        return this.client.itemUrl(itemId, stored);
    }
    async syncShop(userId) {
        const token = await this.accessToken(userId);
        await this.purgeDemoCatalog();
        let listingError = null;
        let remote = [];
        try {
            remote = await this.client.listActiveListings(token);
        }
        catch (error) {
            listingError = error instanceof Error ? error.message : 'Could not load eBay listings';
            this.logger.warn(listingError);
        }
        let orderRemote = [];
        try {
            orderRemote = await this.client.listOrders(token);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Could not load eBay orders';
            this.logger.warn(message);
            listingError = [listingError, message].filter(Boolean).join(' ');
        }
        if (remote.length === 0) {
            const fromOrders = this.listingsFromOrders(orderRemote);
            if (fromOrders.length > 0) {
                remote = fromOrders;
                listingError = null;
            }
        }
        else {
            const sold = new Map();
            for (const listing of this.listingsFromOrders(orderRemote)) {
                sold.set(listing.itemId, listing.soldCount);
            }
            for (const listing of remote) {
                listing.soldCount = Math.max(listing.soldCount, sold.get(listing.itemId) ?? 0);
            }
        }
        const listingCount = remote.length > 0 ? await this.upsertSellerListings(userId, remote) : 0;
        const orders = await this.syncOrders(userId, orderRemote);
        return { listings: listingCount, orders, listingError };
    }
    async syncOrders(userId, prefetched) {
        const store = await this.prisma.store.findFirst({
            where: { userId, platform: client_1.Platform.EBAY },
        });
        const remote = prefetched ?? (await this.client.listOrders(await this.accessToken(userId)));
        let upserted = 0;
        for (const order of remote) {
            if (!order.externalId)
                continue;
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
            }
            else {
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
            where: { userId, platform: client_1.Platform.EBAY },
            data: { lastSyncedAt: new Date() },
        });
        return upserted;
    }
    async pushTracking(userId, orderId) {
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order)
            throw new common_1.NotFoundException(`Order ${orderId} not found`);
        if (!order.externalId || !order.trackingCode || !order.trackingCarrier) {
            throw new common_1.BadRequestException('Order needs an eBay order id, tracking code, and carrier.');
        }
        let ids = [];
        try {
            ids = JSON.parse(order.lineItemData ?? '[]').filter((item) => typeof item === 'string' && item.length > 0);
        }
        catch {
            ids = [];
        }
        if (ids.length === 0) {
            throw new common_1.BadRequestException('No eBay lineItemId is stored for this order. Sync orders from eBay first.');
        }
        const token = await this.accessToken(userId);
        await this.client.pushTracking(token, order.externalId, {
            carrier: order.trackingCarrier,
            number: order.trackingCode,
            lineItemIds: ids,
        });
    }
    listingsFromOrders(orders) {
        const grouped = new Map();
        for (const order of orders) {
            for (const item of order.items) {
                if (!item.legacyItemId)
                    continue;
                const current = grouped.get(item.legacyItemId);
                if (current) {
                    current.soldCount += item.quantity;
                    if (!current.images.length && item.imageUrl)
                        current.images = [item.imageUrl];
                    if (!current.price && item.unitPrice)
                        current.price = item.unitPrice;
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
    async upsertSellerListings(userId, remote) {
        const store = await this.prisma.store.findFirst({
            where: { userId, platform: client_1.Platform.EBAY },
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
                        currency: item.currency || 'GBP',
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
                status: 'PUBLISHED',
                publishedAt: existingListing?.publishedAt ?? new Date(),
                lastError: null,
            };
            if (existingListing) {
                await this.prisma.listing.update({ where: { id: existingListing.id }, data: listingData });
            }
            else {
                await this.prisma.listing.create({
                    data: { ...listingData, externalId: item.itemId },
                });
            }
            upserted += 1;
        }
        return upserted;
    }
    async linkedOrderItem(item) {
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
    variationInput(listing, variants, sharedAspects) {
        if (variants.length < 2)
            return null;
        const parsed = variants.map((variant) => ({
            variant,
            aspects: parseVariantAspects(variant.attributes, variant.name),
        }));
        const nameCounts = new Map();
        for (const row of parsed) {
            for (const aspect of row.aspects) {
                const values = nameCounts.get(aspect.name) ?? new Set();
                aspect.values.forEach((value) => values.add(value));
                nameCounts.set(aspect.name, values);
            }
        }
        const variesBy = [...nameCounts.entries()]
            .filter(([, values]) => values.size > 1)
            .map(([name]) => name);
        if (variesBy.length === 0)
            return null;
        return {
            groupKey: listing.id,
            title: listing.title,
            description: listing.description || listing.title,
            images: (0, json_1.parseStringArray)(listing.images),
            category: listing.category ?? listing.product?.category,
            aspects: sharedAspects,
            variesBy,
            variations: parsed.map((row) => ({
                sku: row.variant.sku || row.variant.externalId || row.variant.id,
                aspects: row.aspects,
                price: row.variant.sellPrice || listing.price,
                quantity: Math.max(row.variant.stock, 0),
                imageUrl: row.variant.imageUrl,
            })),
        };
    }
    async purgeDemoCatalog() {
        await this.prisma.order.deleteMany({ where: { externalId: { startsWith: 'EB-' } } });
        await this.prisma.listing.deleteMany({ where: { externalId: { startsWith: 'ebay-' } } });
        await this.prisma.product.deleteMany({ where: { externalId: { startsWith: 'ae-' } } });
    }
    mapOrderStatus(status) {
        const value = status.toUpperCase();
        if (value.includes('FULFILLED') || value === 'FULFILLED') {
            return { status: 'FULFILLED', fulfillment: 'SHIPPED' };
        }
        if (value.includes('IN_PROGRESS') || value.includes('NOT_STARTED')) {
            return { status: 'PAID', fulfillment: 'UNFULFILLED' };
        }
        return { status: 'PAID', fulfillment: 'PROCESSING' };
    }
};
exports.EbayService = EbayService;
exports.EbayService = EbayService = EbayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        integration_accounts_service_1.IntegrationAccountsService,
        ebay_rest_client_1.EbayRestClient])
], EbayService);
function parseVariantAspects(attributes, fallbackName) {
    const pairs = [];
    if (attributes?.trim()) {
        for (const part of attributes.split(/[;|]/)) {
            const trimmed = part.trim();
            if (!trimmed)
                continue;
            const hash = trimmed.match(/#(.+)$/);
            const colon = trimmed.indexOf(':');
            if (hash && colon > 0) {
                pairs.push({ name: trimmed.slice(0, colon).trim() || 'Option', values: [hash[1].trim()] });
            }
            else if (colon > 0) {
                pairs.push({
                    name: trimmed.slice(0, colon).trim(),
                    values: [trimmed.slice(colon + 1).trim()],
                });
            }
        }
    }
    if (pairs.length === 0 && fallbackName) {
        return [{ name: 'Variation', values: [fallbackName] }];
    }
    return pairs.filter((aspect) => aspect.name && aspect.values[0]);
}
//# sourceMappingURL=ebay.service.js.map