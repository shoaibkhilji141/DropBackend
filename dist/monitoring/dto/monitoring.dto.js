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
exports.RunMonitoringDto = exports.ListAlertsQueryDto = exports.UpdateMonitoringRuleDto = exports.CreateMonitoringRuleDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class CreateMonitoringRuleDto {
    productId;
    type;
    threshold;
    intervalMinutes;
    enabled;
    static _OPENAPI_METADATA_FACTORY() {
        return { productId: { required: true, type: () => String }, type: { required: true, enum: ["PRICE", "STOCK", "SHIPPING"] }, threshold: { required: false, type: () => Number }, intervalMinutes: { required: false, type: () => Number, minimum: 1 }, enabled: { required: false, type: () => Boolean } };
    }
}
exports.CreateMonitoringRuleDto = CreateMonitoringRuleDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateMonitoringRuleDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.MonitoringType }),
    (0, class_validator_1.IsEnum)(client_1.MonitoringType),
    __metadata("design:type", String)
], CreateMonitoringRuleDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Change threshold. Price/shipping are percent, stock is units.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateMonitoringRuleDto.prototype, "threshold", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Check frequency in minutes', default: 15 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateMonitoringRuleDto.prototype, "intervalMinutes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateMonitoringRuleDto.prototype, "enabled", void 0);
class UpdateMonitoringRuleDto {
    threshold;
    intervalMinutes;
    enabled;
    static _OPENAPI_METADATA_FACTORY() {
        return { threshold: { required: false, type: () => Number }, intervalMinutes: { required: false, type: () => Number, minimum: 1 }, enabled: { required: false, type: () => Boolean } };
    }
}
exports.UpdateMonitoringRuleDto = UpdateMonitoringRuleDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdateMonitoringRuleDto.prototype, "threshold", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], UpdateMonitoringRuleDto.prototype, "intervalMinutes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateMonitoringRuleDto.prototype, "enabled", void 0);
class ListAlertsQueryDto {
    unreadOnly;
    static _OPENAPI_METADATA_FACTORY() {
        return { unreadOnly: { required: false, type: () => Boolean } };
    }
}
exports.ListAlertsQueryDto = ListAlertsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === true || value === 'true'),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ListAlertsQueryDto.prototype, "unreadOnly", void 0);
class RunMonitoringDto {
    type;
    productId;
    force;
    static _OPENAPI_METADATA_FACTORY() {
        return { type: { required: false, enum: ["PRICE", "STOCK", "SHIPPING"] }, productId: { required: false, type: () => String }, force: { required: false, type: () => Boolean } };
    }
}
exports.RunMonitoringDto = RunMonitoringDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.MonitoringType }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.MonitoringType),
    __metadata("design:type", String)
], RunMonitoringDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RunMonitoringDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Ignore nextRunAt and check immediately' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RunMonitoringDto.prototype, "force", void 0);
//# sourceMappingURL=monitoring.dto.js.map