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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../auth/public.decorator");
const redis_module_1 = require("../redis/redis.module");
let HealthController = class HealthController {
    configService;
    redis;
    constructor(configService, redis) {
        this.configService = configService;
        this.redis = redis;
    }
    async check() {
        const app = this.configService.get('app');
        const redisConfig = this.configService.get('redis');
        return {
            status: 'ok',
            environment: app?.nodeEnv ?? 'development',
            integrations: {
                auth0: this.configService.get('auth0')?.enabled ?? false,
                redis: Boolean(redisConfig?.enabled && (await this.redis.ping())),
                openai: this.configService.get('openai')?.configured ?? false,
                ebay: this.configService.get('ebay')?.configured ?? false,
                aliexpress: this.configService.get('aliexpress')?.configured ?? false,
            },
        };
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200, type: Object }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "check", null);
exports.HealthController = HealthController = __decorate([
    (0, swagger_1.ApiTags)('health'),
    (0, common_1.Controller)('health'),
    __param(1, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        redis_module_1.RedisClientHost])
], HealthController);
//# sourceMappingURL=health.controller.js.map