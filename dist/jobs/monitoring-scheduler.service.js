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
var MonitoringScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringScheduler = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const bullmq_2 = require("bullmq");
const queues_1 = require("./queues");
const TICK_EVERY_MS = 60_000;
let MonitoringScheduler = MonitoringScheduler_1 = class MonitoringScheduler {
    priceQueue;
    stockQueue;
    shippingQueue;
    logger = new common_1.Logger(MonitoringScheduler_1.name);
    constructor(priceQueue, stockQueue, shippingQueue) {
        this.priceQueue = priceQueue;
        this.stockQueue = stockQueue;
        this.shippingQueue = shippingQueue;
    }
    async onModuleInit() {
        await this.ensureTick(this.priceQueue, 'price-monitoring-tick');
        await this.ensureTick(this.stockQueue, 'stock-monitoring-tick');
        await this.ensureTick(this.shippingQueue, 'shipping-monitoring-tick');
        this.logger.log('BullMQ monitoring ticks registered (every 60s)');
    }
    async enqueue(type, data) {
        const queue = this.queueFor(type);
        return queue.add('run', data, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 50,
            removeOnFail: 50,
        });
    }
    async queueStats() {
        return Promise.all([
            this.stats(this.priceQueue),
            this.stats(this.stockQueue),
            this.stats(this.shippingQueue),
        ]);
    }
    async overviewBase() {
        return { queues: await this.queueStats() };
    }
    async ensureTick(queue, jobId) {
        const existing = await queue.getRepeatableJobs();
        const already = existing.some((job) => job.id === jobId || job.name === 'tick');
        if (already)
            return;
        await queue.add('tick', {}, {
            repeat: { every: TICK_EVERY_MS },
            jobId,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 20,
            removeOnFail: 20,
        });
    }
    queueFor(type) {
        if (type === 'PRICE')
            return this.priceQueue;
        if (type === 'STOCK')
            return this.stockQueue;
        return this.shippingQueue;
    }
    async stats(queue) {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
        return {
            name: queue.name,
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            delayed: counts.delayed ?? 0,
            failed: counts.failed ?? 0,
            completed: counts.completed ?? 0,
        };
    }
};
exports.MonitoringScheduler = MonitoringScheduler;
exports.MonitoringScheduler = MonitoringScheduler = MonitoringScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(queues_1.QUEUE_PRICE_MONITORING)),
    __param(1, (0, bullmq_1.InjectQueue)(queues_1.QUEUE_STOCK_MONITORING)),
    __param(2, (0, bullmq_1.InjectQueue)(queues_1.QUEUE_SHIPPING_MONITORING)),
    __metadata("design:paramtypes", [bullmq_2.Queue,
        bullmq_2.Queue,
        bullmq_2.Queue])
], MonitoringScheduler);
//# sourceMappingURL=monitoring-scheduler.service.js.map