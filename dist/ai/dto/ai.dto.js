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
exports.AiListResultDto = exports.AiTextResultDto = exports.AiStatusDto = exports.GenerateAiContentDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class GenerateAiContentDto {
    productTitle;
    description;
    category;
    keywords;
    tone;
    model;
    static _OPENAPI_METADATA_FACTORY() {
        return { productTitle: { required: true, type: () => String, maxLength: 200 }, description: { required: false, type: () => String, maxLength: 8000 }, category: { required: false, type: () => String, maxLength: 120 }, keywords: { required: false, type: () => [String] }, tone: { required: false, type: () => String, maxLength: 40 }, model: { required: false, type: () => String, maxLength: 80 } };
    }
}
exports.GenerateAiContentDto = GenerateAiContentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Current or source product title' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], GenerateAiContentDto.prototype, "productTitle", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(8000),
    __metadata("design:type", String)
], GenerateAiContentDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], GenerateAiContentDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], GenerateAiContentDto.prototype, "keywords", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Writing tone, e.g. Professional' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], GenerateAiContentDto.prototype, "tone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'OpenAI model override. Defaults to the configured model.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], GenerateAiContentDto.prototype, "model", void 0);
class AiStatusDto {
    configured;
    model;
    static _OPENAPI_METADATA_FACTORY() {
        return { configured: { required: true, type: () => Boolean }, model: { required: true, type: () => String } };
    }
}
exports.AiStatusDto = AiStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], AiStatusDto.prototype, "configured", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AiStatusDto.prototype, "model", void 0);
class AiTextResultDto {
    requestId;
    type;
    content;
    model;
    tokensUsed;
    static _OPENAPI_METADATA_FACTORY() {
        return { requestId: { required: true, type: () => String }, type: { required: true, type: () => String }, content: { required: true, type: () => String }, model: { required: true, type: () => String }, tokensUsed: { required: true, type: () => Number } };
    }
}
exports.AiTextResultDto = AiTextResultDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AiTextResultDto.prototype, "requestId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AiTextResultDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AiTextResultDto.prototype, "content", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AiTextResultDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], AiTextResultDto.prototype, "tokensUsed", void 0);
class AiListResultDto {
    requestId;
    type;
    content;
    model;
    tokensUsed;
    static _OPENAPI_METADATA_FACTORY() {
        return { requestId: { required: true, type: () => String }, type: { required: true, type: () => String }, content: { required: true, type: () => [String] }, model: { required: true, type: () => String }, tokensUsed: { required: true, type: () => Number } };
    }
}
exports.AiListResultDto = AiListResultDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AiListResultDto.prototype, "requestId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AiListResultDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], AiListResultDto.prototype, "content", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AiListResultDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], AiListResultDto.prototype, "tokensUsed", void 0);
//# sourceMappingURL=ai.dto.js.map