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
exports.SearchEbayResearchDto = exports.UpdateProductDto = exports.ListProductsQueryDto = exports.SearchSupplierProductsDto = exports.DERIVED_SORTS = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const SUPPLIER_SORTS = [
    'relevance',
    'costAsc',
    'costDesc',
    'ratingDesc',
    'ordersDesc',
];
exports.DERIVED_SORTS = ['profitDesc', 'marginDesc', 'sellPriceAsc', 'sellPriceDesc'];
const toBoolean = ({ value }) => value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;
class SearchSupplierProductsDto {
    search;
    category;
    supplier;
    minCostPrice;
    maxCostPrice;
    minSellPrice;
    maxSellPrice;
    minProfit;
    minMargin;
    minRating;
    minOrders;
    inStockOnly;
    sort;
    page;
    pageSize;
    static _OPENAPI_METADATA_FACTORY() {
        return { search: { required: false, type: () => String }, category: { required: false, type: () => String }, supplier: { required: false, type: () => String }, minCostPrice: { required: false, type: () => Number, minimum: 0 }, maxCostPrice: { required: false, type: () => Number, minimum: 0 }, minSellPrice: { required: false, type: () => Number, minimum: 0 }, maxSellPrice: { required: false, type: () => Number, minimum: 0 }, minProfit: { required: false, type: () => Number }, minMargin: { required: false, type: () => Number }, minRating: { required: false, type: () => Number, minimum: 0, maximum: 5 }, minOrders: { required: false, type: () => Number, minimum: 0 }, inStockOnly: { required: false, type: () => Boolean }, sort: { required: false, enum: ["profitDesc", "marginDesc", "sellPriceAsc", "sellPriceDesc", "relevance", "costAsc", "costDesc", "ratingDesc", "ordersDesc"], enum: [...SUPPLIER_SORTS, ...exports.DERIVED_SORTS] }, page: { required: false, type: () => Number, minimum: 1 }, pageSize: { required: false, type: () => Number, minimum: 1, maximum: 60 } };
    }
}
exports.SearchSupplierProductsDto = SearchSupplierProductsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Free-text search over title, category and description' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchSupplierProductsDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchSupplierProductsDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Supplier name' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchSupplierProductsDto.prototype, "supplier", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Minimum supplier cost price' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SearchSupplierProductsDto.prototype, "minCostPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Maximum supplier cost price' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SearchSupplierProductsDto.prototype, "maxCostPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Minimum suggested selling price' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SearchSupplierProductsDto.prototype, "minSellPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Maximum suggested selling price' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SearchSupplierProductsDto.prototype, "maxSellPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Minimum estimated profit per unit' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchSupplierProductsDto.prototype, "minProfit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Minimum estimated profit margin percentage' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchSupplierProductsDto.prototype, "minMargin", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 5 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], SearchSupplierProductsDto.prototype, "minRating", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Minimum supplier order count' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SearchSupplierProductsDto.prototype, "minOrders", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Only products currently in stock' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(toBoolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SearchSupplierProductsDto.prototype, "inStockOnly", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: [...SUPPLIER_SORTS, ...exports.DERIVED_SORTS],
        default: 'relevance',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([...SUPPLIER_SORTS, ...exports.DERIVED_SORTS]),
    __metadata("design:type", String)
], SearchSupplierProductsDto.prototype, "sort", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1, minimum: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], SearchSupplierProductsDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 12, minimum: 1, maximum: 60 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(60),
    __metadata("design:type", Number)
], SearchSupplierProductsDto.prototype, "pageSize", void 0);
class ListProductsQueryDto {
    status;
    search;
    static _OPENAPI_METADATA_FACTORY() {
        return { status: { required: false, enum: ["SAVED", "IMPORTED", "LISTED", "ARCHIVED"] }, search: { required: false, type: () => String } };
    }
}
exports.ListProductsQueryDto = ListProductsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.ProductStatus }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.ProductStatus),
    __metadata("design:type", String)
], ListProductsQueryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListProductsQueryDto.prototype, "search", void 0);
class UpdateProductDto {
    title;
    description;
    sourceUrl;
    sellPrice;
    costPrice;
    shippingCost;
    stock;
    status;
    static _OPENAPI_METADATA_FACTORY() {
        return { title: { required: false, type: () => String }, description: { required: false, type: () => String }, sourceUrl: { required: false, type: () => String }, sellPrice: { required: false, type: () => Number, minimum: 0 }, costPrice: { required: false, type: () => Number, minimum: 0 }, shippingCost: { required: false, type: () => Number, minimum: 0 }, stock: { required: false, type: () => Number, minimum: 0 }, status: { required: false, enum: ["SAVED", "IMPORTED", "LISTED", "ARCHIVED"] } };
    }
}
exports.UpdateProductDto = UpdateProductDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateProductDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateProductDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'AliExpress product page used as the supply source' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateProductDto.prototype, "sourceUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateProductDto.prototype, "sellPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateProductDto.prototype, "costPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateProductDto.prototype, "shippingCost", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateProductDto.prototype, "stock", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: client_1.ProductStatus }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.ProductStatus),
    __metadata("design:type", String)
], UpdateProductDto.prototype, "status", void 0);
class SearchEbayResearchDto {
    q;
    categoryId;
    minPrice;
    maxPrice;
    condition;
    sort;
    limit;
    static _OPENAPI_METADATA_FACTORY() {
        return { q: { required: false, type: () => String }, categoryId: { required: false, type: () => String }, minPrice: { required: false, type: () => Number, minimum: 0 }, maxPrice: { required: false, type: () => Number, minimum: 0 }, condition: { required: false, type: () => String, enum: ['NEW', 'USED', ''] }, sort: { required: false, type: () => String, enum: ['sold', 'sold7', 'sold30', 'priceAsc', 'priceDesc', 'newest'] }, limit: { required: false, type: () => Number, minimum: 1, maximum: 100 } };
    }
}
exports.SearchEbayResearchDto = SearchEbayResearchDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchEbayResearchDto.prototype, "q", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'eBay category id' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchEbayResearchDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SearchEbayResearchDto.prototype, "minPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SearchEbayResearchDto.prototype, "maxPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['NEW', 'USED', '']),
    __metadata("design:type", String)
], SearchEbayResearchDto.prototype, "condition", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['sold', 'sold7', 'sold30', 'priceAsc', 'priceDesc', 'newest']),
    __metadata("design:type", String)
], SearchEbayResearchDto.prototype, "sort", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], SearchEbayResearchDto.prototype, "limit", void 0);
//# sourceMappingURL=product.dto.js.map