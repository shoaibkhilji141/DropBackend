import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AIRequest, AIRequestType, AIStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AliExpressApiProvider } from '../integrations/aliexpress/aliexpress-api.provider';
import { SupplierProduct } from '../integrations/aliexpress/aliexpress.types';
import { OpenAIService } from '../integrations/openai/openai.service';
import { ProfitService } from '../profit/profit.service';
import { UsersService } from '../users/users.service';
import { mergePolicy, parseAiPolicy, policyReviewPrompt, scanEbayUkPolicy } from './ebay-listing-policy';
import {
  AiListResultDto,
  AiStatusDto,
  AiTextResultDto,
  GenerateAiContentDto,
  ListingCopyResultDto,
  ListingSeoResultDto,
} from './dto/ai.dto';

const SELLER_VOICE =
  'You write listing copy for an AliExpress-to-eBay dropshipping seller. Be accurate, commercial and specific. Never invent certifications, brand affiliations or measurements that are not in the source.';

@Injectable()
export class AiService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly aliexpress: AliExpressApiProvider,
    private readonly profit: ProfitService,
  ) {}

  status(): AiStatusDto {
    return {
      configured: this.openai.isConfigured(),
      model: this.openai.defaultModel(),
      provider: this.openai.provider(),
      models: this.openai.availableModels(),
    };
  }

  history(): Promise<AIRequest[]> {
    return this.prisma.aIRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  generateTitle(dto: GenerateAiContentDto): Promise<AiTextResultDto> {
    return this.runText(AIRequestType.TITLE, dto, {
      system: `${SELLER_VOICE} Return JSON {"title":"..."}. The title must be at most 80 characters, include the main product type and one differentiator, and avoid ALL CAPS or keyword stuffing.`,
      user: this.sourceBlock(dto, 'Write an eBay listing title.'),
      extract: (payload) => this.openai.requireString(payload, 'title').slice(0, 80),
    });
  }

  generateDescription(dto: GenerateAiContentDto): Promise<AiTextResultDto> {
    return this.runText(AIRequestType.DESCRIPTION, dto, {
      system: `${SELLER_VOICE} Return JSON {"description":"..."}. Write 2-4 short paragraphs plus a short bullet list of practical features. Use plain text, not HTML.`,
      user: this.sourceBlock(dto, 'Write a complete eBay product description.'),
      extract: (payload) => this.openai.requireString(payload, 'description'),
    });
  }

  improveDescription(dto: GenerateAiContentDto): Promise<AiTextResultDto> {
    return this.runText(AIRequestType.IMPROVE_DESCRIPTION, dto, {
      system: `${SELLER_VOICE} Return JSON {"description":"..."}. Improve clarity, scannability and selling power without changing the factual meaning.`,
      user: this.sourceBlock(dto, 'Improve this product description. Keep the same facts.'),
      extract: (payload) => this.openai.requireString(payload, 'description'),
    });
  }

  generateKeywords(dto: GenerateAiContentDto): Promise<AiListResultDto> {
    return this.runList(AIRequestType.KEYWORDS, dto, {
      system: `${SELLER_VOICE} Return JSON {"keywords":["..."]}. Provide 8 to 14 short eBay search keywords or phrases. No hashtags.`,
      user: this.sourceBlock(dto, 'Generate SEO keywords for this listing.'),
      extract: (payload) => this.openai.requireStringArray(payload, 'keywords').slice(0, 16),
    });
  }

  async generateFromUrl(url: string, model?: string): Promise<ListingCopyResultDto> {
    const externalId = this.productIdFromUrl(url);
    if (!externalId) {
      throw new BadRequestException(
        'Paste a full AliExpress product link, for example https://www.aliexpress.com/item/1005001234567890.html',
      );
    }
    if (!(await this.aliexpress.hasLiveSession())) {
      throw new BadRequestException('Connect AliExpress before generating listing copy from a product link.');
    }

    const product = await this.aliexpress.getByExternalId(externalId);
    if (!product) {
      throw new NotFoundException(`AliExpress product ${externalId} was not found.`);
    }

    const specs = (product.specs ?? []).map((spec) => `${spec.name}: ${spec.value}`);
    const variantLines = product.variants.slice(0, 8).map((variant) => variant.attributes || variant.name);
    const plainDescription = this.plainText(product.description).slice(0, 3500);
    const dto: GenerateAiContentDto = {
      productTitle: product.title,
      description: plainDescription,
      category: product.category,
      keywords: specs.slice(0, 8),
      tone: 'Sales',
      model,
    };

    const result = await this.runText(AIRequestType.TITLE, dto, {
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
    const policyInput = {
      title: product.title,
      description: plainDescription,
      category: product.category,
      specs,
      variants: variantLines,
      generatedTitle: title,
      generatedDescription: description,
      costPrice: product.costPrice,
      currency: product.currency,
    };
    const rules = scanEbayUkPolicy(policyInput);
    const aiPolicy = await this.reviewListingPolicy(dto, policyInput);
    const policy = mergePolicy(rules, aiPolicy ?? parseAiPolicy(payload));

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
      policy,
    };
  }

  /**
   * Builds a complete, SEO-oriented eBay UK listing from research data: the
   * mined competitor keywords, the phrases buyers search, and the item
   * specifics eBay wants for the category.
   */
  async generateListingSeo(input: {
    sourceTitle: string;
    categoryName?: string | null;
    description?: string | null;
    minedKeywords: string[];
    buyerSearches: string[];
    knownAspects: { name: string; value: string }[];
    requestedAspectNames: string[];
    priceHint?: number | null;
    currency?: string;
  }): Promise<ListingSeoResultDto> {
    const dto: GenerateAiContentDto = {
      productTitle: input.sourceTitle,
      description: input.description?.slice(0, 3500) || undefined,
      category: input.categoryName || undefined,
      keywords: input.minedKeywords.slice(0, 20),
      tone: 'Sales',
    };

    const result = await this.runText(AIRequestType.TITLE, dto, {
      system: `${SELLER_VOICE} You are optimising a listing for eBay UK (ebay.co.uk), so use British English spelling (colour, metre, aluminium) and GBP. Return JSON {"title":"...","descriptionHtml":"...","highlights":["..."],"keywords":["..."],"aspects":[{"name":"...","value":"..."}]}.
title: at most 80 characters and it must use as much of that budget as possible without stuffing. Lead with the exact phrase buyers search for, then the product type, then the one or two strongest differentiators (size, colour, quantity, compatibility). No ALL CAPS, no punctuation runs, no seller slogans, no quote characters.
descriptionHtml: valid simple HTML using only <p>, <h3>, <ul>, <li> and <strong>. Open with two sentences on the buyer outcome, then a <ul> of specific features, then a short dispatch and returns paragraph that promises no specific delivery date. Repeat the main keyword naturally two or three times. No inline styles, no scripts, no tables, no images.
highlights: 4 to 6 lines under 90 characters each.
keywords: 10 to 14 search phrases ordered by commercial value.
aspects: item specifics. Use every requested aspect name you can fill from the source data, keeping the requested name spelling exactly. Omit an aspect entirely rather than guessing a value.
Never invent brands, certifications, warranties or measurements that are absent from the source.`,
      user: [
        'Write an SEO-optimised eBay UK listing for this product.',
        `Source title: ${input.sourceTitle}`,
        input.categoryName ? `eBay category: ${input.categoryName}` : '',
        input.priceHint ? `Selling price: ${input.priceHint} ${input.currency ?? 'GBP'}` : '',
        input.minedKeywords.length
          ? `Keywords mined from the best selling competing listings, strongest first:\n${input.minedKeywords.slice(0, 20).join('\n')}`
          : '',
        input.buyerSearches.length
          ? `Phrases eBay's search box suggests for this product:\n${input.buyerSearches.slice(0, 15).join('\n')}`
          : '',
        input.knownAspects.length
          ? `Known item specifics from the source listing:\n${input.knownAspects
              .map((aspect) => `${aspect.name}: ${aspect.value}`)
              .join('\n')}`
          : '',
        input.requestedAspectNames.length
          ? `Item specific names eBay asks for in this category: ${input.requestedAspectNames.slice(0, 30).join(', ')}`
          : '',
        input.description ? `Source description:\n${input.description.slice(0, 3000)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      extract: (payload) => JSON.stringify(payload),
    });

    const payload = this.openai.parseJsonObject(result.content);
    return {
      title: this.openai.requireString(payload, 'title').replace(/\s+/g, ' ').trim().slice(0, 80),
      descriptionHtml: this.openai.requireString(payload, 'descriptionHtml'),
      highlights: this.stringList(payload, 'highlights').slice(0, 8),
      keywords: this.stringList(payload, 'keywords').slice(0, 16),
      aspects: this.aspectList(payload),
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }

  private aspectList(payload: Record<string, unknown>): { name: string; value: string }[] {
    const value = payload.aspects;
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({ name: String(item.name ?? '').trim(), value: String(item.value ?? '').trim() }))
      .filter((item) => item.name && item.value)
      .slice(0, 30);
  }

  generateHighlights(dto: GenerateAiContentDto): Promise<AiListResultDto> {
    return this.runList(AIRequestType.HIGHLIGHTS, dto, {
      system: `${SELLER_VOICE} Return JSON {"highlights":["..."]}. Provide 4 to 6 short product highlights, each under 90 characters.`,
      user: this.sourceBlock(dto, 'Generate short product highlights for the listing.'),
      extract: (payload) => this.openai.requireStringArray(payload, 'highlights').slice(0, 8),
    });
  }

  private productIdFromUrl(input: string): string | null {
    const trimmed = input.trim();
    if (/^\d{6,20}$/.test(trimmed)) return trimmed;
    const item = trimmed.match(/\/item\/(\d{6,20})(?:\.html)?/i);
    if (item) return item[1];
    const query = trimmed.match(/[?&](?:productId|itemId|product_id)=(\d{6,20})/i);
    return query?.[1] ?? null;
  }

  private plainText(value: string): string {
    return value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private stringList(payload: Record<string, unknown>, key: string): string[] {
    const value = payload[key];
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  private copyProduct(product: SupplierProduct, suggestedSellPrice: number): ListingCopyResultDto['product'] {
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

  private sourceBlock(dto: GenerateAiContentDto, task: string): string {
    const lines = [
      `Task: ${task}`,
      `Tone: ${dto.tone?.trim() || 'Professional'}`,
      `Title: ${dto.productTitle.trim()}`,
    ];
    if (dto.category) lines.push(`Category: ${dto.category.trim()}`);
    if (dto.keywords?.length) lines.push(`Existing keywords: ${dto.keywords.join(', ')}`);
    if (dto.description) lines.push(`Existing description:\n${dto.description.trim()}`);
    return lines.join('\n');
  }

  private async reviewListingPolicy(
    dto: GenerateAiContentDto,
    input: Parameters<typeof policyReviewPrompt>[0],
  ) {
    try {
      const prompt = policyReviewPrompt(input);
      const result = await this.runText(AIRequestType.IMPROVE_DESCRIPTION, dto, {
        system: prompt.system,
        user: prompt.user,
        extract: (payload) => JSON.stringify(payload),
      });
      return parseAiPolicy(this.openai.parseJsonObject(result.content));
    } catch {
      return null;
    }
  }

  private async runText(
    type: AIRequestType,
    dto: GenerateAiContentDto,
    spec: {
      system: string;
      user: string;
      extract: (payload: Record<string, unknown>) => string;
    },
  ): Promise<AiTextResultDto> {
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

  private async runList(
    type: AIRequestType,
    dto: GenerateAiContentDto,
    spec: {
      system: string;
      user: string;
      extract: (payload: Record<string, unknown>) => string[];
    },
  ): Promise<AiListResultDto> {
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

  private async execute(
    type: AIRequestType,
    dto: GenerateAiContentDto,
    system: string,
    user: string,
  ) {
    const account = await this.users.findCurrent();
    const request = await this.prisma.aIRequest.create({
      data: {
        userId: account.id,
        type,
        prompt: user,
        model: dto.model?.trim() || this.openai.defaultModel(),
        status: AIStatus.PENDING,
      },
    });

    try {
      const completion = await this.openai.completeJson(system, user, dto.model);
      const payload = this.openai.parseJsonObject(completion.text);
      return { request, completion, payload };
    } catch (error) {
      await this.prisma.aIRequest.update({
        where: { id: request.id },
        data: {
          status: AIStatus.FAILED,
          response: error instanceof Error ? error.message : 'AI request failed',
        },
      });
      throw error;
    }
  }

  private complete(id: string, response: string, model: string, tokensUsed: number) {
    return this.prisma.aIRequest.update({
      where: { id },
      data: { status: AIStatus.COMPLETED, response, model, tokensUsed },
    });
  }
}
