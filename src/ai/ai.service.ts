import { Injectable } from '@nestjs/common';
import { AIRequest, AIRequestType, AIStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { OpenAIService } from '../integrations/openai/openai.service';
import { UsersService } from '../users/users.service';
import {
  AiListResultDto,
  AiStatusDto,
  AiTextResultDto,
  GenerateAiContentDto,
} from './dto/ai.dto';

const SELLER_VOICE =
  'You write listing copy for an AliExpress-to-eBay dropshipping seller. Be accurate, commercial and specific. Never invent certifications, brand affiliations or measurements that are not in the source.';

@Injectable()
export class AiService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  status(): AiStatusDto {
    return {
      configured: this.openai.isConfigured(),
      model: this.openai.defaultModel(),
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

  generateHighlights(dto: GenerateAiContentDto): Promise<AiListResultDto> {
    return this.runList(AIRequestType.HIGHLIGHTS, dto, {
      system: `${SELLER_VOICE} Return JSON {"highlights":["..."]}. Provide 4 to 6 short product highlights, each under 90 characters.`,
      user: this.sourceBlock(dto, 'Generate short product highlights for the listing.'),
      extract: (payload) => this.openai.requireStringArray(payload, 'highlights').slice(0, 8),
    });
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
        model: dto.model || this.openai.defaultModel(),
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
