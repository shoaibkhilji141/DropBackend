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
exports.AiController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const ai_service_1 = require("./ai.service");
const ai_dto_1 = require("./dto/ai.dto");
let AiController = class AiController {
    aiService;
    constructor(aiService) {
        this.aiService = aiService;
    }
    status() {
        return this.aiService.status();
    }
    history() {
        return this.aiService.history();
    }
    fromUrl(dto) {
        return this.aiService.generateFromUrl(dto.url);
    }
    generateTitle(dto) {
        return this.aiService.generateTitle(dto);
    }
    generateDescription(dto) {
        return this.aiService.generateDescription(dto);
    }
    improveDescription(dto) {
        return this.aiService.improveDescription(dto);
    }
    generateKeywords(dto) {
        return this.aiService.generateKeywords(dto);
    }
    generateHighlights(dto) {
        return this.aiService.generateHighlights(dto);
    }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Get)('status'),
    openapi.ApiResponse({ status: 200, type: require("./dto/ai.dto").AiStatusDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", ai_dto_1.AiStatusDto)
], AiController.prototype, "status", null);
__decorate([
    (0, common_1.Get)('history'),
    openapi.ApiResponse({ status: 200 }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiController.prototype, "history", null);
__decorate([
    (0, common_1.Post)('from-url'),
    openapi.ApiResponse({ status: 201, type: require("./dto/ai.dto").ListingCopyResultDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_dto_1.ListingFromUrlDto]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "fromUrl", null);
__decorate([
    (0, common_1.Post)('title'),
    openapi.ApiResponse({ status: 201, type: require("./dto/ai.dto").AiTextResultDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_dto_1.GenerateAiContentDto]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "generateTitle", null);
__decorate([
    (0, common_1.Post)('description'),
    openapi.ApiResponse({ status: 201, type: require("./dto/ai.dto").AiTextResultDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_dto_1.GenerateAiContentDto]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "generateDescription", null);
__decorate([
    (0, common_1.Post)('improve-description'),
    openapi.ApiResponse({ status: 201, type: require("./dto/ai.dto").AiTextResultDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_dto_1.GenerateAiContentDto]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "improveDescription", null);
__decorate([
    (0, common_1.Post)('keywords'),
    openapi.ApiResponse({ status: 201, type: require("./dto/ai.dto").AiListResultDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_dto_1.GenerateAiContentDto]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "generateKeywords", null);
__decorate([
    (0, common_1.Post)('highlights'),
    openapi.ApiResponse({ status: 201, type: require("./dto/ai.dto").AiListResultDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_dto_1.GenerateAiContentDto]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "generateHighlights", null);
exports.AiController = AiController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [ai_service_1.AiService])
], AiController);
//# sourceMappingURL=ai.controller.js.map