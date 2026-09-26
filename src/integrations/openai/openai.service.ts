import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { APIError } from 'openai';
import { OpenAIConfig } from '../../config/configuration';

export interface OpenAICompletion {
  text: string;
  model: string;
  tokensUsed: number;
}

/**
 * Thin OpenAI client. The API key is read from ConfigService and never leaves
 * this service. Callers in the AI module persist AIRequest rows around this.
 */
@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private client: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return this.configService.get<OpenAIConfig>('openai')?.configured ?? false;
  }

  defaultModel(): string {
    return this.configService.get<OpenAIConfig>('openai')?.model ?? 'gpt-4o-mini';
  }

  async completeJson(system: string, user: string, model?: string): Promise<OpenAICompletion> {
    const openai = this.configService.get<OpenAIConfig>('openai');
    if (!openai?.configured || !openai.apiKey) {
      throw new ServiceUnavailableException(
        'OpenAI is not configured. Set OPENAI_API_KEY in the backend environment.',
      );
    }

    const usedModel = model || openai.model || 'gpt-4o-mini';
    const client = this.getClient(openai.apiKey);

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await client.chat.completions.create({
        model: usedModel,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
    } catch (error) {
      this.logger.warn(`OpenAI request failed: ${error instanceof Error ? error.message : error}`);
      throw new BadGatewayException(this.publicOpenAiError(error));
    }

    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    if (!text) {
      throw new BadGatewayException('OpenAI returned an empty response.');
    }

    return {
      text,
      model: completion.model ?? usedModel,
      tokensUsed: completion.usage?.total_tokens ?? 0,
    };
  }

  parseJsonObject(text: string): Record<string, unknown> {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Fall through to a consistent invalid-response error.
    }
    throw new BadGatewayException('OpenAI returned a response that was not valid JSON.');
  }

  requireString(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadGatewayException(`OpenAI response is missing a valid "${key}" field.`);
    }
    return value.trim();
  }

  requireStringArray(payload: Record<string, unknown>, key: string): string[] {
    const value = payload[key];
    if (!Array.isArray(value)) {
      throw new BadGatewayException(`OpenAI response is missing a valid "${key}" array.`);
    }
    const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (items.length === 0) {
      throw new BadGatewayException(`OpenAI response "${key}" array was empty.`);
    }
    return items.map((item) => item.trim());
  }

  private getClient(apiKey: string): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  private publicOpenAiError(error: unknown): string {
    if (error instanceof APIError) {
      const detail = error.message ?? '';
      if (error.status === 401) return 'OpenAI rejected the configured API key.';
      if (error.status === 429 && /credit|quota|billing/i.test(detail)) {
        return 'OpenAI has no credits remaining on the configured API key.';
      }
      if (error.status === 429) return 'OpenAI rate limit reached. Try again shortly.';
      return `OpenAI request failed (${error.status ?? 'unknown status'}).`;
    }
    return 'OpenAI request failed.';
  }
}
