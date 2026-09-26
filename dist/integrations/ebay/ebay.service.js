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
    async publishListing(userId, listingId) {
        const listing = await this.prisma.listing.findUnique({
            where: { id: listingId },
            include: { product: true, store: true },
        });
        if (!listing)
            throw new common_1.NotFoundException(`Listing ${listingId} not found`);
        const token = await this.accessToken(userId);
        try {
            const published = await this.client.publishListing(token, {
                sku: listing.sku || listing.product?.externalId || listing.id,
                title: listing.title,
                description: listing.description || listing.title,
                images: (0, json_1.parseStringArray)(listing.images),
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
    async syncOrders(userId) {
        const token = await this.accessToken(userId);
        const store = await this.prisma.store.findFirst({
            where: { userId, platform: client_1.Platform.EBAY },
        });
        const remote = await this.client.listOrders(token);
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
                lineItemData: JSON.stringify(order.items.map((item) => item.lineItemId).filter(Boolean)),
                lastError: null,
            };
            if (existing) {
                await this.prisma.order.update({ where: { id: existing.id }, data });
            }
            else {
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
//# sourceMappingURL=ebay.service.js.map