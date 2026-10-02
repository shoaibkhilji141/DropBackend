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
exports.ResearchController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const product_dto_1 = require("./dto/product.dto");
const products_service_1 = require("./products.service");
const research_insights_service_1 = require("./research-insights.service");
let ResearchController = class ResearchController {
    productsService;
    insights;
    constructor(productsService, insights) {
        this.productsService = productsService;
        this.insights = insights;
    }
    searchEbay(query) {
        return this.insights.searchMarketplaceCached({
            q: query.q,
            categoryId: query.categoryId,
            minPrice: query.minPrice,
            maxPrice: query.maxPrice,
            condition: query.condition,
            sort: query.sort,
            limit: query.limit,
        });
    }
    getEbayInsight(itemId) {
        return this.insights.getInsight(itemId);
    }
    matchAliExpress(query) {
        return this.insights.matchAliExpress(query);
    }
    listOnEbay(externalId, dto, user) {
        return this.insights.listOnEbay(externalId, dto, user);
    }
    search(query) {
        return this.productsService.searchSupplier(query);
    }
    findOne(externalId) {
        return this.productsService.getSupplierProduct(externalId);
    }
    save(externalId) {
        return this.productsService.saveFromSupplier(externalId);
    }
    saved() {
        return this.productsService.findAll({ status: 'SAVED' });
    }
    removeSaved(id) {
        return this.productsService.removeSaved(id);
    }
};
exports.ResearchController = ResearchController;
__decorate([
    (0, common_1.Get)('ebay'),
    (0, swagger_1.ApiOperation)({ summary: 'Search live eBay UK listings for product research' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [product_dto_1.SearchEbayResearchDto]),
    __metadata("design:returntype", void 0)
], ResearchController.prototype, "searchEbay", null);
__decorate([
    (0, common_1.Get)('ebay/insight'),
    (0, swagger_1.ApiOperation)({ summary: 'Sales, keywords and SEO insight for one eBay UK listing' }),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Query)('itemId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ResearchController.prototype, "getEbayInsight", null);
__decorate([
    (0, common_1.Get)('aliexpress/match'),
    (0, swagger_1.ApiOperation)({ summary: 'Find AliExpress products that match an eBay listing by text or image' }),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [product_dto_1.MatchAliExpressQueryDto]),
    __metadata("design:returntype", Promise)
], ResearchController.prototype, "matchAliExpress", null);
__decorate([
    (0, common_1.Post)('aliexpress/:externalId/list-on-ebay'),
    (0, swagger_1.ApiOperation)({ summary: 'Import an AliExpress product and list it on the connected eBay UK account' }),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Param)('externalId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, product_dto_1.ListOnEbayDto, Object]),
    __metadata("design:returntype", void 0)
], ResearchController.prototype, "listOnEbay", null);
__decorate([
    (0, common_1.Get)('products'),
    (0, swagger_1.ApiOperation)({
        summary: 'Search the supplier catalog with filters, sorting and pagination',
        description: 'Reads from the configured SupplierProductProvider. Selling price, profit and margin are calculated by the backend profit service.',
    }),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [product_dto_1.SearchSupplierProductsDto]),
    __metadata("design:returntype", Promise)
], ResearchController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('products/:externalId'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('externalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ResearchController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)('products/:externalId/save'),
    (0, swagger_1.ApiOperation)({ summary: 'Save a supplier product to the local research list' }),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Param)('externalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ResearchController.prototype, "save", null);
__decorate([
    (0, common_1.Get)('saved'),
    (0, swagger_1.ApiOperation)({ summary: 'List saved products' }),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ResearchController.prototype, "saved", null);
__decorate([
    (0, common_1.Delete)('saved/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove a product from the saved list' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ResearchController.prototype, "removeSaved", null);
exports.ResearchController = ResearchController = __decorate([
    (0, swagger_1.ApiTags)('product-research'),
    (0, common_1.Controller)('research'),
    __metadata("design:paramtypes", [products_service_1.ProductsService,
        research_insights_service_1.ResearchInsightsService])
], ResearchController);
//# sourceMappingURL=research.controller.js.map