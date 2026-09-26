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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfitController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const profit_dto_1 = require("./dto/profit.dto");
const profit_service_1 = require("./profit.service");
let ProfitController = class ProfitController {
    profitService;
    constructor(profitService) {
        this.profitService = profitService;
    }
    settings() {
        return this.profitService.getSettings();
    }
    updateSettings(dto) {
        return this.profitService.updateSettings(dto);
    }
    calculate(dto) {
        return this.profitService.calculate(dto);
    }
    history(type) {
        return this.profitService.history(type);
    }
    totals() {
        return this.profitService.totals();
    }
};
exports.ProfitController = ProfitController;
__decorate([
    (0, common_1.Get)('settings'),
    openapi.ApiResponse({ status: 200, type: require("./dto/profit.dto").ProfitSettingsDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ProfitController.prototype, "settings", null);
__decorate([
    (0, common_1.Patch)('settings'),
    openapi.ApiResponse({ status: 200, type: require("./dto/profit.dto").ProfitSettingsDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [profit_dto_1.UpdateProfitSettingsDto]),
    __metadata("design:returntype", Promise)
], ProfitController.prototype, "updateSettings", null);
__decorate([
    (0, common_1.Post)('calculate'),
    openapi.ApiResponse({ status: 201, type: require("./dto/profit.dto").ProfitBreakdownDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [profit_dto_1.CalculateProfitDto]),
    __metadata("design:returntype", Promise)
], ProfitController.prototype, "calculate", null);
__decorate([
    (0, common_1.Get)('history'),
    (0, swagger_1.ApiQuery)({ name: 'type', required: false, enum: client_1.ProfitType }),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof client_1.ProfitType !== "undefined" && client_1.ProfitType) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], ProfitController.prototype, "history", null);
__decorate([
    (0, common_1.Get)('totals'),
    openapi.ApiResponse({ status: 200 }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ProfitController.prototype, "totals", null);
exports.ProfitController = ProfitController = __decorate([
    (0, swagger_1.ApiTags)('profit'),
    (0, common_1.Controller)('profit'),
    __metadata("design:paramtypes", [profit_service_1.ProfitService])
], ProfitController);
//# sourceMappingURL=profit.controller.js.map