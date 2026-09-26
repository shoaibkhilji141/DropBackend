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
exports.ImporterController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const importer_dto_1 = require("./dto/importer.dto");
const importer_service_1 = require("./importer.service");
let ImporterController = class ImporterController {
    importerService;
    constructor(importerService) {
        this.importerService = importerService;
    }
    importable() {
        return this.importerService.listImportable();
    }
    preview(id) {
        return this.importerService.preview(id);
    }
    profit(id, dto) {
        return this.importerService.previewProfit(id, dto);
    }
    import(id, dto) {
        return this.importerService.import(id, dto);
    }
};
exports.ImporterController = ImporterController;
__decorate([
    (0, common_1.Get)('products'),
    (0, swagger_1.ApiOperation)({ summary: 'Saved products that can be imported' }),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ImporterController.prototype, "importable", null);
__decorate([
    (0, common_1.Get)('products/:id/preview'),
    (0, swagger_1.ApiOperation)({ summary: 'Review payload: product, images, variants, stock and shipping' }),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ImporterController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)('products/:id/profit'),
    (0, swagger_1.ApiOperation)({ summary: 'Recalculate estimated profit for the selected options' }),
    openapi.ApiResponse({ status: 201, type: require("../profit/dto/profit.dto").ProfitBreakdownDto }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, importer_dto_1.PreviewProfitDto]),
    __metadata("design:returntype", Promise)
], ImporterController.prototype, "profit", null);
__decorate([
    (0, common_1.Post)('products/:id/import'),
    (0, swagger_1.ApiOperation)({
        summary: 'Import the product and optionally create an internal listing draft',
        description: 'Nothing is published to eBay; the listing is stored locally as a DRAFT.',
    }),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, importer_dto_1.ImportProductDto]),
    __metadata("design:returntype", Promise)
], ImporterController.prototype, "import", null);
exports.ImporterController = ImporterController = __decorate([
    (0, swagger_1.ApiTags)('importer'),
    (0, common_1.Controller)('importer'),
    __metadata("design:paramtypes", [importer_service_1.ImporterService])
], ImporterController);
//# sourceMappingURL=importer.controller.js.map