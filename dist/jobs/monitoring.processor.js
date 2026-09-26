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
exports.ShippingMonitoringProcessor = exports.StockMonitoringProcessor = exports.PriceMonitoringProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const monitoring_service_1 = require("../monitoring/monitoring.service");
const queues_1 = require("./queues");
class MonitoringProcessor extends bullmq_1.WorkerHost {
    monitoring;
    type;
    logger = new common_1.Logger(this.constructor.name);
    constructor(monitoring, type) {
        super();
        this.monitoring = monitoring;
        this.type = type;
    }
    async process(job) {
        this.logger.log(`Processing ${this.type} job ${job.name} (${job.id})`);
        try {
            if (job.name === 'check' && job.data.ruleId) {
                return await this.monitoring.checkRule(job.data.ruleId);
            }
            return await this.monitoring.processDue(this.type, {
                productId: job.data.productId,
                force: job.data.force,
            });
        }
        catch (error) {
            this.logger.error(`${this.type} job ${job.id} failed: ${error instanceof Error ? error.message : error}`);
            throw error;
        }
    }
}
let PriceMonitoringProcessor = class PriceMonitoringProcessor extends MonitoringProcessor {
    constructor(monitoring) {
        super(monitoring, client_1.MonitoringType.PRICE);
    }
};
exports.PriceMonitoringProcessor = PriceMonitoringProcessor;
exports.PriceMonitoringProcessor = PriceMonitoringProcessor = __decorate([
    (0, bullmq_1.Processor)(queues_1.QUEUE_PRICE_MONITORING, { concurrency: 2 }),
    __metadata("design:paramtypes", [monitoring_service_1.MonitoringService])
], PriceMonitoringProcessor);
let StockMonitoringProcessor = class StockMonitoringProcessor extends MonitoringProcessor {
    constructor(monitoring) {
        super(monitoring, client_1.MonitoringType.STOCK);
    }
};
exports.StockMonitoringProcessor = StockMonitoringProcessor;
exports.StockMonitoringProcessor = StockMonitoringProcessor = __decorate([
    (0, bullmq_1.Processor)(queues_1.QUEUE_STOCK_MONITORING, { concurrency: 2 }),
    __metadata("design:paramtypes", [monitoring_service_1.MonitoringService])
], StockMonitoringProcessor);
let ShippingMonitoringProcessor = class ShippingMonitoringProcessor extends MonitoringProcessor {
    constructor(monitoring) {
        super(monitoring, client_1.MonitoringType.SHIPPING);
    }
};
exports.ShippingMonitoringProcessor = ShippingMonitoringProcessor;
exports.ShippingMonitoringProcessor = ShippingMonitoringProcessor = __decorate([
    (0, bullmq_1.Processor)(queues_1.QUEUE_SHIPPING_MONITORING, { concurrency: 2 }),
    __metadata("design:paramtypes", [monitoring_service_1.MonitoringService])
], ShippingMonitoringProcessor);
//# sourceMappingURL=monitoring.processor.js.map