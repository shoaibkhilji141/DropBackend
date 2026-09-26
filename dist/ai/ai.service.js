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
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../common/prisma/prisma.service");
const openai_service_1 = require("../integrations/openai/openai.service");
const users_service_1 = require("../users/users.service");
const SELLER_VOICE = 'You write listing copy for an AliExpress-to-eBay dropshipping seller. Be accurate, commercial and specific. Never invent certifications, brand affiliations or measurements that are not in the source.';
let AiService = class AiService {
    openai;
    prisma;
    users;
    constructor(openai, prisma, users) {
        this.openai = openai;
        this.prisma = prisma;
        this.users = users;
    }
    status() {
        return {
            configured: this.openai.isConfigured(),
            model: this.openai.defaultModel(),
        };
    }
    history() {
        return this.prisma.aIRequest.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }
    generateTitle(dto) {
        return this.runText(client_1.AIRequestType.TITLE, dto, {
            system: `${SELLER_VOICE} Return JSON {"title":"..."}. The title must be at most 80 characters, include the main product type and one differentiator, and avoid ALL CAPS or keyword stuffing.`,
            user: this.sourceBlock(dto, 'Write an eBay listing title.'),
            extract: (payload) => this.openai.requireString(payload, 'title').slice(0, 80),
        });
    }
    generateDescription(dto) {
        return this.runText(client_1.AIRequestType.DESCRIPTION, dto, {
            system: `${SELLER_VOICE} Return JSON {"description":"..."}. Write 2-4 short paragraphs plus a short bullet list of practical features. Use plain text, not HTML.`,
            user: this.sourceBlock(dto, 'Write a complete eBay product description.'),
            extract: (payload) => this.openai.requireString(payload, 'description'),
        });
    }
    improveDescription(dto) {
        return this.runText(client_1.AIRequestType.IMPROVE_DESCRIPTION, dto, {
            system: `${SELLER_VOICE} Return JSON {"description":"..."}. Improve clarity, scannability and selling power without changing the factual meaning.`,
            user: this.sourceBlock(dto, 'Improve this product description. Keep the same facts.'),
            extract: (payload) => this.openai.requireString(payload, 'description'),
        });
    }
    generateKeywords(dto) {
        return this.runList(client_1.AIRequestType.KEYWORDS, dto, {
            system: `${SELLER_VOICE} Return JSON {"keywords":["..."]}. Provide 8 to 14 short eBay search keywords or phrases. No hashtags.`,
            user: this.sourceBlock(dto, 'Generate SEO keywords for this listing.'),
            extract: (payload) => this.openai.requireStringArray(payload, 'keywords').slice(0, 16),
        });
    }
    generateHighlights(dto) {
        return this.runList(client_1.AIRequestType.HIGHLIGHTS, dto, {
            system: `${SELLER_VOICE} Return JSON {"highlights":["..."]}. Provide 4 to 6 short product highlights, each under 90 characters.`,
            user: this.sourceBlock(dto, 'Generate short product highlights for the listing.'),
            extract: (payload) => this.openai.requireStringArray(payload, 'highlights').slice(0, 8),
        });
    }
    sourceBlock(dto, task) {
        const lines = [
            `Task: ${task}`,
            `Tone: ${dto.tone?.trim() || 'Professional'}`,
            `Title: ${dto.productTitle.trim()}`,
        ];
        if (dto.category)
            lines.push(`Category: ${dto.category.trim()}`);
        if (dto.keywords?.length)
            lines.push(`Existing keywords: ${dto.keywords.join(', ')}`);
        if (dto.description)
            lines.push(`Existing description:\n${dto.description.trim()}`);
        return lines.join('\n');
    }
    async runText(type, dto, spec) {
        const { request, completion, payload } = await this.execute(type, dto, spec.system, spec.user);
        const content = spec.extract(payload);
        await this.complete(request.id, completion.text, completion.model, completion.tokensUsed);
        return {
            requestId: request.id,
            type,
            content,
            model: completion.model,
            tokensUsed: completion.tokensUsed,
        };
    }
    async runList(type, dto, spec) {
        const { request, completion, payload } = await this.execute(type, dto, spec.system, spec.user);
        const content = spec.extract(payload);
        await this.complete(request.id, completion.text, completion.model, completion.tokensUsed);
        return {
            requestId: request.id,
            type,
            content,
            model: completion.model,
            tokensUsed: completion.tokensUsed,
        };
    }
    async execute(type, dto, system, user) {
        const account = await this.users.findCurrent();
        const request = await this.prisma.aIRequest.create({
            data: {
                userId: account.id,
                type,
                prompt: user,
                model: dto.model || this.openai.defaultModel(),
                status: client_1.AIStatus.PENDING,
            },
        });
        try {
            const completion = await this.openai.completeJson(system, user, dto.model);
            const payload = this.openai.parseJsonObject(completion.text);
            return { request, completion, payload };
        }
        catch (error) {
            await this.prisma.aIRequest.update({
                where: { id: request.id },
                data: {
                    status: client_1.AIStatus.FAILED,
                    response: error instanceof Error ? error.message : 'AI request failed',
                },
            });
            throw error;
        }
    }
    complete(id, response, model, tokensUsed) {
        return this.prisma.aIRequest.update({
            where: { id },
            data: { status: client_1.AIStatus.COMPLETED, response, model, tokensUsed },
        });
    }
};
exports.AiService = AiService;
exports.AiService = AiService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [openai_service_1.OpenAIService,
        prisma_service_1.PrismaService,
        users_service_1.UsersService])
], AiService);
//# sourceMappingURL=ai.service.js.map