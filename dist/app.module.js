"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const nestjs_pino_1 = require("nestjs-pino");
const auth_module_1 = require("./auth/auth.module");
const jwt_auth_guard_1 = require("./auth/jwt-auth.guard");
const cache_module_1 = require("./common/cache/cache.module");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const health_controller_1 = require("./common/health.controller");
const prisma_module_1 = require("./common/prisma/prisma.module");
const config_module_1 = require("./config/config.module");
const ai_module_1 = require("./ai/ai.module");
const connections_module_1 = require("./connections/connections.module");
const dashboard_module_1 = require("./dashboard/dashboard.module");
const importer_module_1 = require("./importer/importer.module");
const jobs_module_1 = require("./jobs/jobs.module");
const listings_module_1 = require("./listings/listings.module");
const monitoring_module_1 = require("./monitoring/monitoring.module");
const orders_module_1 = require("./orders/orders.module");
const products_module_1 = require("./products/products.module");
const profit_module_1 = require("./profit/profit.module");
const redis_module_1 = require("./redis/redis.module");
const users_module_1 = require("./users/users.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_module_1.AppConfigModule,
            nestjs_pino_1.LoggerModule.forRoot({
                pinoHttp: {
                    level: process.env.LOG_LEVEL ?? 'debug',
                    transport: process.env.NODE_ENV === 'production'
                        ? undefined
                        : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } },
                    autoLogging: { ignore: (req) => req.url?.startsWith('/docs') ?? false },
                },
            }),
            prisma_module_1.PrismaModule,
            cache_module_1.CacheModule,
            redis_module_1.RedisModule,
            jobs_module_1.JobsModule.register(),
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            products_module_1.ProductsModule,
            importer_module_1.ImporterModule,
            ai_module_1.AiModule,
            listings_module_1.ListingsModule,
            orders_module_1.OrdersModule,
            monitoring_module_1.MonitoringModule,
            profit_module_1.ProfitModule,
            connections_module_1.ConnectionsModule,
            dashboard_module_1.DashboardModule,
        ],
        controllers: [health_controller_1.HealthController],
        providers: [
            { provide: core_1.APP_FILTER, useClass: all_exceptions_filter_1.AllExceptionsFilter },
            { provide: core_1.APP_GUARD, useClass: jwt_auth_guard_1.JwtAuthGuard },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map