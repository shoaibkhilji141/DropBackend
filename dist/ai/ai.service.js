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
const aliexpress_api_provider_1 = require("../integrations/aliexpress/aliexpress-api.provider");
const openai_service_1 = require("../integrations/openai/openai.service");
const profit_service_1 = require("../profit/profit.service");
const users_service_1 = require("../users/users.service");
const SELLER_VOICE = 'You write listing copy for an AliExpress-to-eBay dropshipping seller. Be accurate, commercial and specific. Never invent certifications, brand affiliations or measurements that are not in the source.';
let AiService = class AiService {
    openai;
    prisma;
    users;
    aliexpress;
    profit;
    constructor(openai, prisma, users, aliexpress, profit) {
        this.openai = openai;
        this.prisma = prisma;
        this.users = users;
        this.aliexpress = aliexpress;
        this.profit = profit;
    }
    status() {
        return {
            configured: this.openai.isConfigured(),
            model: this.openai.defaultModel(),
            provider: this.openai.provider(),
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
    async generateFromUrl(url) {
        const externalId = this.productIdFromUrl(url);
        if (!externalId) {
            throw new common_1.BadRequestException('Paste a full AliExpress product link, for example https://www.aliexpress.com/item/1005001234567890.html');
        }
        if (!(await this.aliexpress.hasLiveSession())) {
            throw new common_1.BadRequestException('Connect AliExpress before generating listing copy from a product link.');
        }
        const product = await this.aliexpress.getByExternalId(externalId);
        if (!product) {
            throw new common_1.NotFoundException(`AliExpress product ${externalId} was not found.`);
        }
        const specs = (product.specs ?? []).map((spec) => `${spec.name}: ${spec.value}`);
        const variantLines = product.variants.slice(0, 8).map((variant) => variant.attributes || variant.name);
        const plainDescription = this.plainText(product.description).slice(0, 3500);
        const dto = {
            productTitle: product.title,
            description: plainDescription,
            category: product.category,
            keywords: specs.slice(0, 8),
            tone: 'Sales',
        };
        const result = await this.runText(client_1.AIRequestType.TITLE, dto, {
            system: `${SELLER_VOICE} Return JSON {"title":"...","description":"...","specs":["Name: value"],"keywords":["..."],"highlights":["..."]}. title is a ready-to-paste eBay title of at most 80 characters that leads with what the buyer is searching for, then the main benefit or spec. It should be specific enough to win the click and the sale. No ALL CAPS, no keyword stuffing, no quotes. description is plain text: a short opening that sells the outcome, then a feature bullet list, then a short shipping note that does not invent delivery times. specs are factual Name: value lines taken only from the source. keywords are 8 to 12 search phrases. highlights are 4 to 6 lines under 90 characters.`,
            user: [
                'Write eBay listing copy a seller can paste without editing.',
                `Source title: ${product.title}`,
                `Category: ${product.category}`,
                `Supplier price: ${product.costPrice} ${product.currency}`,
                `Orders on AliExpress: ${product.orders}`,
                `Rating: ${product.rating} (${product.reviews} reviews)`,
                specs.length ? `Source specs:\n${specs.join('\n')}` : 'Source specs: none provided',
                variantLines.length ? `Variants: ${variantLines.join('; ')}` : '',
                plainDescription ? `Source description:\n${plainDescription}` : '',
            ]
                .filter(Boolean)
                .join('\n'),
            extract: (payload) => JSON.stringify(payload),
        });
        const payload = this.openai.parseJsonObject(result.content);
        const title = this.openai.requireString(payload, 'title').replace(/\s+/g, ' ').trim().slice(0, 80);
        const description = this.openai.requireString(payload, 'description');
        const suggested = this.profit.suggestSellPrice(product.costPrice, product.shippingCost);
        return {
            requestId: result.requestId,
            model: result.model,
            tokensUsed: result.tokensUsed,
            title,
            description,
            specs: this.stringList(payload, 'specs').slice(0, 16),
            keywords: this.stringList(payload, 'keywords').slice(0, 16),
            highlights: this.stringList(payload, 'highlights').slice(0, 8),
            product: this.copyProduct(product, suggested),
        };
    }
    generateHighlights(dto) {
        return this.runList(client_1.AIRequestType.HIGHLIGHTS, dto, {
            system: `${SELLER_VOICE} Return JSON {"highlights":["..."]}. Provide 4 to 6 short product highlights, each under 90 characters.`,
            user: this.sourceBlock(dto, 'Generate short product highlights for the listing.'),
            extract: (payload) => this.openai.requireStringArray(payload, 'highlights').slice(0, 8),
        });
    }
    productIdFromUrl(input) {
        const trimmed = input.trim();
        if (/^\d{6,20}$/.test(trimmed))
            return trimmed;
        const item = trimmed.match(/\/item\/(\d{6,20})(?:\.html)?/i);
        if (item)
            return item[1];
        const query = trimmed.match(/[?&](?:productId|itemId|product_id)=(\d{6,20})/i);
        return query?.[1] ?? null;
    }
    plainText(value) {
        return value
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim();
    }
    stringList(payload, key) {
        const value = payload[key];
        if (!Array.isArray(value))
            return [];
        return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
    }
    copyProduct(product, suggestedSellPrice) {
        return {
            externalId: product.externalId,
            title: product.title,
            images: product.images,
            sourceUrl: product.sourceUrl,
            costPrice: product.costPrice,
            currency: product.currency,
            category: product.category,
            suggestedSellPrice,
            specs: product.specs ?? [],
        };
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
        users_service_1.UsersService,
        aliexpress_api_provider_1.AliExpressApiProvider,
        profit_service_1.ProfitService])
], AiService);
//# sourceMappingURL=ai.service.js.map