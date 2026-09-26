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
exports.PreviewProfitDto = exports.ImportProductDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const profit_dto_1 = require("../../profit/dto/profit.dto");
const toBoolean = ({ value }) => value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;
class ImportProductDto extends profit_dto_1.ProfitCostOptionsDto {
    sellPrice;
    variantIds;
    shippingMethod;
    shippingCost;
    createListingDraft;
    listingTitle;
    static _OPENAPI_METADATA_FACTORY() {
        return { sellPrice: { required: true, type: () => Number, minimum: 0 }, variantIds: { required: false, type: () => [String], minItems: 1 }, shippingMethod: { required: false, type: () => String }, shippingCost: { required: false, type: () => Number, minimum: 0 }, createListingDraft: { required: false, type: () => Boolean }, listingTitle: { required: false, type: () => String } };
    }
}
exports.ImportProductDto = ImportProductDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Selling price to use on the marketplace listing' }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ImportProductDto.prototype, "sellPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Variant ids to include. Omit to keep every variant selected.',
        type: [String],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ImportProductDto.prototype, "variantIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Shipping method chosen from the supplier options' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportProductDto.prototype, "shippingMethod", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Shipping cost for the chosen method' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], ImportProductDto.prototype, "shippingCost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Create an internal eBay listing draft', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(toBoolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ImportProductDto.prototype, "createListingDraft", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Listing title override, max 80 characters' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportProductDto.prototype, "listingTitle", void 0);
class PreviewProfitDto extends profit_dto_1.ProfitCostOptionsDto {
    sellPrice;
    shippingCost;
    variantIds;
    static _OPENAPI_METADATA_FACTORY() {
        return { sellPrice: { required: true, type: () => Number, minimum: 0 }, shippingCost: { required: false, type: () => Number, minimum: 0 }, variantIds: { required: false, type: () => [String] } };
    }
}
exports.PreviewProfitDto = PreviewProfitDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PreviewProfitDto.prototype, "sellPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Shipping cost override for the preview' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PreviewProfitDto.prototype, "shippingCost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], PreviewProfitDto.prototype, "variantIds", void 0);
//# sourceMappingURL=importer.dto.js.map