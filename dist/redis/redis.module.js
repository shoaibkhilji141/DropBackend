"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisModule = exports.RedisClientHost = exports.REDIS_CLIENT = exports.REDIS_CONNECTION = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
exports.REDIS_CONNECTION = Symbol('REDIS_CONNECTION');
exports.REDIS_CLIENT = Symbol('REDIS_CLIENT');
class RedisClientHost {
    client;
    constructor(client) {
        this.client = client;
    }
    get instance() {
        return this.client;
    }
    async ping() {
        if (!this.client)
            return false;
        try {
            return (await this.client.ping()) === 'PONG';
        }
        catch {
            return false;
        }
    }
    async onModuleDestroy() {
        if (this.client) {
            await this.client.quit().catch(() => this.client?.disconnect());
        }
    }
}
exports.RedisClientHost = RedisClientHost;
let RedisModule = class RedisModule {
};
exports.RedisModule = RedisModule;
exports.RedisModule = RedisModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: exports.REDIS_CONNECTION,
                inject: [config_1.ConfigService],
                useFactory: (configService) => {
                    const redis = configService.get('redis');
                    if (!redis.enabled) {
                        new common_1.Logger('RedisModule').log('Redis is disabled (REDIS_ENABLED=false). Background queues will not start.');
                    }
                    return {
                        host: redis.host,
                        port: redis.port,
                        password: redis.password,
                        enabled: redis.enabled,
                    };
                },
            },
            {
                provide: exports.REDIS_CLIENT,
                inject: [config_1.ConfigService],
                useFactory: async (configService) => {
                    const redis = configService.get('redis');
                    if (!redis.enabled)
                        return new RedisClientHost(null);
                    const logger = new common_1.Logger('RedisModule');
                    const client = new ioredis_1.default({
                        host: redis.host,
                        port: redis.port,
                        password: redis.password,
                        maxRetriesPerRequest: null,
                        lazyConnect: true,
                    });
                    try {
                        await client.connect();
                        const reply = await client.ping();
                        logger.log(`Redis connected at ${redis.host}:${redis.port} (${reply})`);
                    }
                    catch (error) {
                        logger.error(`Redis connection failed at ${redis.host}:${redis.port}: ${error instanceof Error ? error.message : error}`);
                    }
                    return new RedisClientHost(client);
                },
            },
        ],
        exports: [exports.REDIS_CONNECTION, exports.REDIS_CLIENT],
    })
], RedisModule);
//# sourceMappingURL=redis.module.js.map