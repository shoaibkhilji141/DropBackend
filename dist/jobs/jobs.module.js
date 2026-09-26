"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var JobsModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobsModule = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const monitoring_module_1 = require("../monitoring/monitoring.module");
const jobs_controller_1 = require("./jobs.controller");
const monitoring_scheduler_service_1 = require("./monitoring-scheduler.service");
const monitoring_processor_1 = require("./monitoring.processor");
const queues_1 = require("./queues");
const defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
};
let JobsModule = JobsModule_1 = class JobsModule {
    static register() {
        const redisEnabled = process.env.REDIS_ENABLED === 'true';
        if (!redisEnabled) {
            return { module: JobsModule_1 };
        }
        return {
            module: JobsModule_1,
            imports: [
                monitoring_module_1.MonitoringModule,
                bullmq_1.BullModule.forRootAsync({
                    inject: [config_1.ConfigService],
                    useFactory: (configService) => {
                        const redis = configService.get('redis');
                        return {
                            connection: {
                                host: redis.host,
                                port: redis.port,
                                password: redis.password || undefined,
                            },
                            defaultJobOptions,
                        };
                    },
                }),
                ...queues_1.ALL_QUEUES.map((name) => bullmq_1.BullModule.registerQueue({ name })),
            ],
            controllers: [jobs_controller_1.JobsController],
            providers: [
                monitoring_scheduler_service_1.MonitoringScheduler,
                monitoring_processor_1.PriceMonitoringProcessor,
                monitoring_processor_1.StockMonitoringProcessor,
                monitoring_processor_1.ShippingMonitoringProcessor,
            ],
            exports: [bullmq_1.BullModule, monitoring_scheduler_service_1.MonitoringScheduler],
        };
    }
};
exports.JobsModule = JobsModule;
exports.JobsModule = JobsModule = JobsModule_1 = __decorate([
    (0, common_1.Module)({})
], JobsModule);
//# sourceMappingURL=jobs.module.js.map