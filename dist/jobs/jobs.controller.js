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
exports.JobsController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const monitoring_dto_1 = require("../monitoring/dto/monitoring.dto");
const monitoring_scheduler_service_1 = require("./monitoring-scheduler.service");
let JobsController = class JobsController {
    scheduler;
    constructor(scheduler) {
        this.scheduler = scheduler;
    }
    queues() {
        return this.scheduler.queueStats();
    }
    async enqueue(dto) {
        const types = dto.type
            ? [dto.type]
            : [client_1.MonitoringType.PRICE, client_1.MonitoringType.STOCK, client_1.MonitoringType.SHIPPING];
        const jobs = [];
        for (const type of types) {
            jobs.push(await this.scheduler.enqueue(type, { productId: dto.productId, force: true }));
        }
        return jobs.map((job) => ({ id: job.id, name: job.name, queue: job.queueName }));
    }
};
exports.JobsController = JobsController;
__decorate([
    (0, common_1.Get)('queues'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], JobsController.prototype, "queues", null);
__decorate([
    (0, common_1.Post)('enqueue'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [monitoring_dto_1.RunMonitoringDto]),
    __metadata("design:returntype", Promise)
], JobsController.prototype, "enqueue", null);
exports.JobsController = JobsController = __decorate([
    (0, swagger_1.ApiTags)('monitoring'),
    (0, common_1.Controller)('monitoring'),
    __metadata("design:paramtypes", [monitoring_scheduler_service_1.MonitoringScheduler])
], JobsController);
//# sourceMappingURL=jobs.controller.js.map