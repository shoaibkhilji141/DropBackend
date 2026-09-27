import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { APIError } from 'openai';
import { AiProviderConfig, OpenAIConfig } from '../../config/configuration';

export interface OpenAICompletion {
  text: string;
  model: string;
  tokensUsed: number;
}

/**
 * Tries OpenAI first, then Groq, then Gemini. A quota or auth failure on one
 * provider does not stop listing copy if another key is configured.
 */
@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly clients = new Map<string, OpenAI>();

  constructor(private readonly configService: ConfigService) {}

  private config(): OpenAIConfig | undefined {
    return this.configService.get<OpenAIConfig>('openai');
  }

  isConfigured(): boolean {
    return this.config()?.configured ?? false;
  }

  defaultModel(): string {
    return this.config()?.model ?? 'gpt-4o-mini';
  }

  provider(): string {
    const names = this.config()?.providers.map((item) => item.name) ?? [];
    return names.length > 1 ? `auto (${names.join(' → ')})` : (this.config()?.provider ?? 'openai');
  }

  async completeJson(system: string, user: string, model?: string): Promise<OpenAICompletion> {
    const openai = this.config();
    const providers = openai?.providers ?? [];
    if (!openai?.configured || providers.length === 0) {
      throw new ServiceUnavailableException(
        'No AI key is configured. Add GEMINI_API_KEY from https://aistudio.google.com/apikey (free) or GROQ_API_KEY / OPENAI_API_KEY.',
      );
    }

    let lastError = '';
    for (const provider of providers) {
      try {
        return await this.completeWith(provider, system, user, model);
      } catch (error) {
        lastError = this.publicError(error, provider.name);
        this.logger.warn(`${provider.name} failed, trying the next AI provider: ${lastError}`);
      }
    }

    throw new BadGatewayException(lastError || 'All configured AI providers failed.');
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
    throw new BadGatewayException('The AI provider returned a response that was not valid JSON.');
  }

  requireString(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadGatewayException(`AI response is missing a valid "${key}" field.`);
    }
    return value.trim();
  }

  requireStringArray(payload: Record<string, unknown>, key: string): string[] {
    const value = payload[key];
    if (!Array.isArray(value)) {
      throw new BadGatewayException(`AI response is missing a valid "${key}" array.`);
    }
    const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (items.length === 0) {
      throw new BadGatewayException(`AI response "${key}" array was empty.`);
    }
    return items.map((item) => item.trim());
  }

  private async completeWith(
    provider: AiProviderConfig,
    system: string,
    user: string,
    model?: string,
  ): Promise<OpenAICompletion> {
    const usedModel = model && provider.name === 'openai' ? model : provider.model;
    const completion = await this.getClient(provider).chat.completions.create({
      model: usedModel,
      temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    if (!text) {
      throw new Error('The AI provider returned an empty response.');
    }

    return {
      text,
      model: `${provider.name}:${completion.model ?? usedModel}`,
      tokensUsed: completion.usage?.total_tokens ?? 0,
    };
  }

  private getClient(provider: AiProviderConfig): OpenAI {
    const identity = `${provider.name}:${provider.apiKey}:${provider.baseUrl ?? ''}`;
    const existing = this.clients.get(identity);
    if (existing) return existing;
    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl,
    });
    this.clients.set(identity, client);
    return client;
  }

  private publicError(error: unknown, provider: string): string {
    const name = provider === 'gemini' ? 'Gemini' : provider === 'groq' ? 'Groq' : 'OpenAI';
    if (error instanceof APIError) {
      const detail = error.message ?? '';
      if (error.status === 401) return `${name} rejected the configured API key.`;
      if (error.status === 429 && /credit|quota|billing/i.test(detail)) {
        return `${name} has no credits remaining.`;
      }
      if (error.status === 429) return `${name} rate limit reached.`;
      return `${name} request failed (${error.status ?? 'unknown status'}).`;
    }
    return error instanceof Error ? error.message : `${name} request failed.`;
  }
}
