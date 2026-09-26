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
exports.UpdateProfitSettingsDto = exports.ProfitSettingsDto = exports.ProfitBreakdownDto = exports.CalculateProfitDto = exports.ProfitCostOptionsDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class ProfitCostOptionsDto {
    marketplaceFeePercent;
    paymentFeePercent;
    fixedFee;
    additionalCosts;
    static _OPENAPI_METADATA_FACTORY() {
        return { marketplaceFeePercent: { required: false, type: () => Number, minimum: 0 }, paymentFeePercent: { required: false, type: () => Number, minimum: 0 }, fixedFee: { required: false, type: () => Number, minimum: 0 }, additionalCosts: { required: false, type: () => Number, minimum: 0 } };
    }
}
exports.ProfitCostOptionsDto = ProfitCostOptionsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Marketplace fee percentage', default: 12.9 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ProfitCostOptionsDto.prototype, "marketplaceFeePercent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Payment processing fee percentage', default: 2.9 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ProfitCostOptionsDto.prototype, "paymentFeePercent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Fixed fee per order', default: 0.3 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ProfitCostOptionsDto.prototype, "fixedFee", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Other configurable costs per order, such as packaging or ad spend',
        default: 0,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ProfitCostOptionsDto.prototype, "additionalCosts", void 0);
class CalculateProfitDto extends ProfitCostOptionsDto {
    sellPrice;
    costPrice;
    shippingCost;
    static _OPENAPI_METADATA_FACTORY() {
        return { sellPrice: { required: true, type: () => Number, minimum: 0 }, costPrice: { required: true, type: () => Number, minimum: 0 }, shippingCost: { required: false, type: () => Number, minimum: 0 } };
    }
}
exports.CalculateProfitDto = CalculateProfitDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Selling price on the marketplace' }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CalculateProfitDto.prototype, "sellPrice", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Supplier cost price' }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CalculateProfitDto.prototype, "costPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CalculateProfitDto.prototype, "shippingCost", void 0);
class ProfitBreakdownDto {
    sellPrice;
    revenue;
    productCost;
    shippingCost;
    additionalCosts;
    fees;
    totalCost;
    profit;
    margin;
    roi;
    static _OPENAPI_METADATA_FACTORY() {
        return { sellPrice: { required: true, type: () => Number }, revenue: { required: true, type: () => Number }, productCost: { required: true, type: () => Number }, shippingCost: { required: true, type: () => Number }, additionalCosts: { required: true, type: () => Number }, fees: { required: true, type: () => Number }, totalCost: { required: true, type: () => Number }, profit: { required: true, type: () => Number }, margin: { required: true, type: () => Number }, roi: { required: true, type: () => Number } };
    }
}
exports.ProfitBreakdownDto = ProfitBreakdownDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Selling price used for the calculation' }),
    __metadata("design:type", Number)
], ProfitBreakdownDto.prototype, "sellPrice", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Revenue, equal to the selling price' }),
    __metadata("design:type", Number)
], ProfitBreakdownDto.prototype, "revenue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Supplier product cost' }),
    __metadata("design:type", Number)
], ProfitBreakdownDto.prototype, "productCost", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ProfitBreakdownDto.prototype, "shippingCost", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Other configurable costs' }),
    __metadata("design:type", Number)
], ProfitBreakdownDto.prototype, "additionalCosts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Marketplace, payment and fixed fees combined' }),
    __metadata("design:type", Number)
], ProfitBreakdownDto.prototype, "fees", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Product cost + shipping + additional costs + fees' }),
    __metadata("design:type", Number)
], ProfitBreakdownDto.prototype, "totalCost", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ProfitBreakdownDto.prototype, "profit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Profit as a percentage of revenue' }),
    __metadata("design:type", Number)
], ProfitBreakdownDto.prototype, "margin", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Profit relative to total cost' }),
    __metadata("design:type", Number)
], ProfitBreakdownDto.prototype, "roi", void 0);
class ProfitSettingsDto extends ProfitCostOptionsDto {
    defaultMarkupMultiplier;
    currency;
    static _OPENAPI_METADATA_FACTORY() {
        return { defaultMarkupMultiplier: { required: true, type: () => Number }, currency: { required: true, type: () => String } };
    }
}
exports.ProfitSettingsDto = ProfitSettingsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Multiplier applied to landed cost to suggest a selling price' }),
    __metadata("design:type", Number)
], ProfitSettingsDto.prototype, "defaultMarkupMultiplier", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ProfitSettingsDto.prototype, "currency", void 0);
class UpdateProfitSettingsDto extends ProfitCostOptionsDto {
    defaultMarkupMultiplier;
    currency;
    static _OPENAPI_METADATA_FACTORY() {
        return { defaultMarkupMultiplier: { required: false, type: () => Number, minimum: 1 }, currency: { required: false, type: () => String } };
    }
}
exports.UpdateProfitSettingsDto = UpdateProfitSettingsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], UpdateProfitSettingsDto.prototype, "defaultMarkupMultiplier", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateProfitSettingsDto.prototype, "currency", void 0);
//# sourceMappingURL=profit.dto.js.map