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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../common/prisma/prisma.service");
const demo_data_1 = require("../common/demo-data");
const aliexpress_api_provider_1 = require("../integrations/aliexpress/aliexpress-api.provider");
const ebay_service_1 = require("../integrations/ebay/ebay.service");
const profit_service_1 = require("../profit/profit.service");
const users_service_1 = require("../users/users.service");
const ORDER_INCLUDE = {
    items: true,
    store: true,
    profitRecords: true,
};
let OrdersService = class OrdersService {
    prisma;
    profit;
    ebay;
    aliexpress;
    users;
    syncedAt = new Map();
    constructor(prisma, profit, ebay, aliexpress, users) {
        this.prisma = prisma;
        this.profit = profit;
        this.ebay = ebay;
        this.aliexpress = aliexpress;
        this.users = users;
    }
    async findAll(query, identity) {
        const user = await this.users.findCurrent(identity);
        const live = (await this.ebay.isConnected(user.id)) || (await this.aliexpress.hasLiveSession());
        const orders = await this.prisma.order.findMany({
            where: {
                ...(live ? (0, demo_data_1.liveOrderWhere)() : {}),
                ...(query.channel ? { channel: query.channel } : {}),
                status: query.status,
                fulfillmentStatus: query.fulfillmentStatus,
                ...(query.search
                    ? {
                        OR: [
                            { buyerName: { contains: query.search } },
                            { buyerEmail: { contains: query.search } },
                            { externalId: { contains: query.search } },
                        ],
                    }
                    : {}),
            },
            include: ORDER_INCLUDE,
            orderBy: { placedAt: 'desc' },
        });
        return orders.map((order) => this.toView(order));
    }
    async findOne(id) {
        return this.toView(await this.findRecord(id));
    }
    async update(id, dto) {
        const current = await this.findRecord(id);
        const nextStatus = dto.status ?? current.status;
        const fulfillmentStatus = dto.fulfillmentStatus ?? this.fulfillmentFromStatus(nextStatus, current.fulfillmentStatus);
        const shippedAt = fulfillmentStatus === client_1.FulfillmentStatus.SHIPPED ||
            fulfillmentStatus === client_1.FulfillmentStatus.DELIVERED
            ? (current.shippedAt ?? new Date())
            : current.shippedAt;
        const order = await this.prisma.order.update({
            where: { id },
            data: {
                status: dto.status,
                fulfillmentStatus,
                trackingCode: dto.trackingCode,
                trackingCarrier: dto.trackingCarrier,
                buyerName: dto.buyerName,
                buyerEmail: dto.buyerEmail,
                buyerAddress: dto.buyerAddress,
                buyerCity: dto.buyerCity,
                buyerCountry: dto.buyerCountry,
                shippedAt,
            },
            include: ORDER_INCLUDE,
        });
        return this.toView(order);
    }
    async syncFromEbay(identity, force = true) {
        return this.syncShops(identity, force);
    }
    async syncShops(identity, force = false) {
        const user = await this.users.findCurrent(identity);
        const last = this.syncedAt.get(user.id) ?? 0;
        if (!force && Date.now() - last < 90_000) {
            return {
                upserted: 0,
                listings: 0,
                aliexpressOrders: 0,
                listingError: null,
                aliexpressError: null,
                skipped: true,
            };
        }
        let listings = 0;
        let upserted = 0;
        let listingError = null;
        if (await this.ebay.isConnected(user.id)) {
            try {
                const ebay = await this.ebay.syncShop(user.id);
                listings = ebay.listings;
                upserted = ebay.orders;
                listingError = ebay.listingError;
            }
            catch (error) {
                listingError = error instanceof Error ? error.message : 'eBay sync failed';
            }
        }
        const aliexpress = await this.syncAliExpressOrders(user.id);
        this.syncedAt.set(user.id, Date.now());
        return {
            upserted,
            listings,
            aliexpressOrders: aliexpress.upserted,
            listingError,
            aliexpressError: aliexpress.error,
            skipped: false,
        };
    }
    async pushTracking(id, identity) {
        const user = await this.users.findCurrent(identity);
        try {
            await this.ebay.pushTracking(user.id, id);
            const order = await this.prisma.order.update({
                where: { id },
                data: { lastError: null },
                include: ORDER_INCLUDE,
            });
            return this.toView(order);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Could not push tracking to eBay';
            await this.prisma.order.update({ where: { id }, data: { lastError: message } });
            throw error;
        }
    }
    async summary() {
        const grouped = await this.prisma.order.groupBy({
            by: ['status'],
            _count: { _all: true },
        });
        return grouped.map((row) => ({ status: row.status, count: row._count._all }));
    }
    async syncAliExpressOrders(userId) {
        if (!(await this.aliexpress.hasLiveSession())) {
            return { upserted: 0, error: null };
        }
        let remote;
        try {
            remote = await this.aliexpress.listOrders();
        }
        catch (error) {
            return {
                upserted: 0,
                error: error instanceof Error ? error.message : 'AliExpress order sync failed',
            };
        }
        if (remote.error && remote.orders.length === 0) {
            return { upserted: 0, error: remote.error };
        }
        let store = await this.prisma.store.findFirst({
            where: { userId, platform: client_1.Platform.ALIEXPRESS },
        });
        if (!store) {
            store = await this.prisma.store.create({
                data: {
                    userId,
                    name: 'AliExpress',
                    platform: client_1.Platform.ALIEXPRESS,
                    status: 'CONNECTED',
                },
            });
        }
        let upserted = 0;
        for (const order of remote.orders) {
            if (!order.externalId)
                continue;
            const mapped = this.mapAliExpressStatus(order.status);
            const data = {
                storeId: store.id,
                channel: 'ALIEXPRESS',
                buyerName: order.shopName || order.buyerName || 'AliExpress shop',
                status: mapped.status,
                fulfillmentStatus: mapped.fulfillment,
                currency: order.currency || 'GBP',
                totalAmount: order.totalAmount,
                supplierCost: order.totalAmount,
                trackingCode: order.trackingCode,
                trackingCarrier: order.trackingCarrier,
                placedAt: order.placedAt,
                lastError: null,
            };
            const existing = await this.prisma.order.findFirst({
                where: { externalId: order.externalId, channel: 'ALIEXPRESS' },
            });
            const items = order.items.map((item) => ({
                title: item.title,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                unitCost: item.unitPrice,
            }));
            if (existing) {
                await this.prisma.orderItem.deleteMany({ where: { orderId: existing.id } });
                await this.prisma.order.update({
                    where: { id: existing.id },
                    data: { ...data, items: { create: items } },
                });
            }
            else {
                await this.prisma.order.create({
                    data: { ...data, externalId: order.externalId, items: { create: items } },
                });
            }
            upserted += 1;
        }
        return { upserted, error: remote.error ?? null };
    }
    mapAliExpressStatus(status) {
        const value = status.toUpperCase();
        if (value.includes('FINISH'))
            return { status: client_1.OrderStatus.DELIVERED, fulfillment: client_1.FulfillmentStatus.DELIVERED };
        if (value.includes('WAIT_BUYER_ACCEPT')) {
            return { status: client_1.OrderStatus.SHIPPED, fulfillment: client_1.FulfillmentStatus.SHIPPED };
        }
        if (value.includes('CANCEL') || value.includes('INVALID')) {
            return { status: client_1.OrderStatus.CANCELLED, fulfillment: client_1.FulfillmentStatus.UNFULFILLED };
        }
        if (value.includes('PLACE_ORDER')) {
            return { status: client_1.OrderStatus.PENDING, fulfillment: client_1.FulfillmentStatus.UNFULFILLED };
        }
        return { status: client_1.OrderStatus.PAID, fulfillment: client_1.FulfillmentStatus.PROCESSING };
    }
    async findRecord(id) {
        const order = await this.prisma.order.findUnique({
            where: { id },
            include: ORDER_INCLUDE,
        });
        if (!order) {
            throw new common_1.NotFoundException(`Order ${id} not found`);
        }
        return order;
    }
    fulfillmentFromStatus(status, current) {
        if (status === client_1.OrderStatus.SHIPPED)
            return client_1.FulfillmentStatus.SHIPPED;
        if (status === client_1.OrderStatus.DELIVERED)
            return client_1.FulfillmentStatus.DELIVERED;
        if (status === client_1.OrderStatus.PAID || status === client_1.OrderStatus.FULFILLED) {
            return current === client_1.FulfillmentStatus.UNFULFILLED ? client_1.FulfillmentStatus.PROCESSING : current;
        }
        return current;
    }
    toView(order) {
        const supplierCost = order.supplierCost ||
            order.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
        const estimate = this.profit.breakdown(order.totalAmount, supplierCost, order.shippingCost);
        return {
            id: order.id,
            externalId: order.externalId,
            channel: order.channel,
            shopName: order.channel === 'ALIEXPRESS' ? order.buyerName : (order.store?.name ?? null),
            buyerName: order.buyerName,
            buyer: {
                name: order.buyerName,
                email: order.buyerEmail,
                address: order.buyerAddress,
                city: order.buyerCity,
                country: order.buyerCountry,
            },
            status: order.status,
            fulfillmentStatus: order.fulfillmentStatus,
            currency: order.currency,
            totalAmount: order.totalAmount,
            supplierCost,
            shippingCost: order.shippingCost,
            trackingCode: order.trackingCode,
            trackingCarrier: order.trackingCarrier,
            lastError: order.lastError,
            shippedAt: order.shippedAt?.toISOString() ?? null,
            placedAt: order.placedAt.toISOString(),
            items: order.items.map((item) => ({
                id: item.id,
                title: item.title,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                unitCost: item.unitCost,
                productId: item.productId,
                listingId: item.listingId,
            })),
            store: order.store ? { id: order.store.id, name: order.store.name } : null,
            estimate,
        };
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        profit_service_1.ProfitService,
        ebay_service_1.EbayService,
        aliexpress_api_provider_1.AliExpressApiProvider,
        users_service_1.UsersService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map