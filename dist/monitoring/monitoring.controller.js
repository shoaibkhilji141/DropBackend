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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const redis_module_1 = require("../redis/redis.module");
const monitoring_dto_1 = require("./dto/monitoring.dto");
const monitoring_service_1 = require("./monitoring.service");
let MonitoringController = class MonitoringController {
    monitoringService;
    configService;
    redis;
    constructor(monitoringService, configService, redis) {
        this.monitoringService = monitoringService;
        this.configService = configService;
        this.redis = redis;
    }
    async overview() {
        const redis = this.configService.get('redis');
        const [rules, alerts] = await Promise.all([
            this.monitoringService.rules(),
            this.monitoringService.alerts(),
        ]);
        const lastChecked = rules
            .map((rule) => rule.lastRunAt)
            .filter((value) => Boolean(value))
            .sort()
            .at(-1) ?? null;
        return {
            redisEnabled: redis?.enabled ?? false,
            redisConnected: await this.redis.ping(),
            rulesEnabled: rules.filter((rule) => rule.enabled).length,
            rulesTotal: rules.length,
            unreadAlerts: alerts.filter((alert) => !alert.readAt).length,
            lastChecked,
            failedRules: rules.filter((rule) => rule.lastStatus === 'FAILED').length,
            queues: [],
            recentAlerts: alerts.slice(0, 8),
        };
    }
    price(productId) {
        return this.monitoringService.priceHistory(productId);
    }
    priceSnapshots() {
        return this.monitoringService.priceSnapshots();
    }
    stock(productId) {
        return this.monitoringService.stockHistory(productId);
    }
    stockSnapshots() {
        return this.monitoringService.stockSnapshots();
    }
    shipping(productId) {
        return this.monitoringService.shippingHistory(productId);
    }
    shippingSnapshots() {
        return this.monitoringService.shippingSnapshots();
    }
    alerts(query) {
        return this.monitoringService.alerts(query);
    }
    markRead(id) {
        return this.monitoringService.markAlertRead(id);
    }
    markAllRead() {
        return this.monitoringService.markAllAlertsRead();
    }
    rules(type) {
        return this.monitoringService.rules(type);
    }
    createRule(dto) {
        return this.monitoringService.createRule(dto);
    }
    updateRule(id, dto) {
        return this.monitoringService.updateRule(id, dto);
    }
    run(dto) {
        if (dto.type) {
            return this.monitoringService.processDue(dto.type, dto);
        }
        return Promise.all([
            this.monitoringService.processDue(client_1.MonitoringType.PRICE, dto),
            this.monitoringService.processDue(client_1.MonitoringType.STOCK, dto),
            this.monitoringService.processDue(client_1.MonitoringType.SHIPPING, dto),
        ]).then((groups) => groups.flat());
    }
};
exports.MonitoringController = MonitoringController;
__decorate([
    (0, common_1.Get)('overview'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('price'),
    (0, swagger_1.ApiQuery)({ name: 'productId', required: false }),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Query)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "price", null);
__decorate([
    (0, common_1.Get)('price/snapshots'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "priceSnapshots", null);
__decorate([
    (0, common_1.Get)('stock'),
    (0, swagger_1.ApiQuery)({ name: 'productId', required: false }),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Query)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "stock", null);
__decorate([
    (0, common_1.Get)('stock/snapshots'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "stockSnapshots", null);
__decorate([
    (0, common_1.Get)('shipping'),
    (0, swagger_1.ApiQuery)({ name: 'productId', required: false }),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Query)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "shipping", null);
__decorate([
    (0, common_1.Get)('shipping/snapshots'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "shippingSnapshots", null);
__decorate([
    (0, common_1.Get)('alerts'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [monitoring_dto_1.ListAlertsQueryDto]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "alerts", null);
__decorate([
    (0, common_1.Patch)('alerts/:id/read'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "markRead", null);
__decorate([
    (0, common_1.Post)('alerts/read-all'),
    openapi.ApiResponse({ status: 201 }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "markAllRead", null);
__decorate([
    (0, common_1.Get)('rules'),
    (0, swagger_1.ApiQuery)({ name: 'type', required: false, enum: client_1.MonitoringType }),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof client_1.MonitoringType !== "undefined" && client_1.MonitoringType) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "rules", null);
__decorate([
    (0, common_1.Post)('rules'),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [monitoring_dto_1.CreateMonitoringRuleDto]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "createRule", null);
__decorate([
    (0, common_1.Patch)('rules/:id'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, monitoring_dto_1.UpdateMonitoringRuleDto]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "updateRule", null);
__decorate([
    (0, common_1.Post)('run'),
    openapi.ApiResponse({ status: 201, type: [Object] }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [monitoring_dto_1.RunMonitoringDto]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "run", null);
exports.MonitoringController = MonitoringController = __decorate([
    (0, swagger_1.ApiTags)('monitoring'),
    (0, common_1.Controller)('monitoring'),
    __param(2, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [monitoring_service_1.MonitoringService, typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object, redis_module_1.RedisClientHost])
], MonitoringController);
//# sourceMappingURL=monitoring.controller.js.map