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
 * Chat-completions client. Uses Gemini, Groq, or OpenAI depending on which
 * key is configured. Gemini and Groq speak the OpenAI protocol.
 */
@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private client: OpenAI | null = null;
  private clientKey = '';

  constructor(private readonly configService: ConfigService) {}

  private config(): OpenAIConfig | undefined {
    return this.configService.get<OpenAIConfig>('openai');
  }

  isConfigured(): boolean {
    return this.config()?.configured ?? false;
  }

  defaultModel(): string {
    return this.config()?.model ?? 'gemini-2.0-flash';
  }

  provider(): string {
    return this.config()?.provider ?? 'openai';
  }

  async completeJson(system: string, user: string, model?: string): Promise<OpenAICompletion> {
    const openai = this.config();
    if (!openai?.configured || !openai.apiKey) {
      throw new ServiceUnavailableException(
        'No AI key is configured. Add GEMINI_API_KEY from https://aistudio.google.com/apikey (free) or GROQ_API_KEY / OPENAI_API_KEY.',
      );
    }

    const usedModel = model || openai.model;
    const client = this.getClient(openai);

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
      this.logger.warn(`AI request failed: ${error instanceof Error ? error.message : error}`);
      throw new BadGatewayException(this.publicError(error, openai.provider));
    }

    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    if (!text) {
      throw new BadGatewayException('The AI provider returned an empty response.');
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

  private getClient(config: OpenAIConfig): OpenAI {
    const identity = `${config.provider}:${config.apiKey}:${config.baseUrl ?? ''}`;
    if (!this.client || this.clientKey !== identity) {
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      this.clientKey = identity;
    }
    return this.client;
  }

  private publicError(error: unknown, provider: string): string {
    const name = provider === 'gemini' ? 'Gemini' : provider === 'groq' ? 'Groq' : 'OpenAI';
    if (error instanceof APIError) {
      const detail = error.message ?? '';
      if (error.status === 401) return `${name} rejected the configured API key.`;
      if (error.status === 429 && /credit|quota|billing/i.test(detail)) {
        return `${name} has no credits remaining. Switch to Gemini (free) at https://aistudio.google.com/apikey`;
      }
      if (error.status === 429) return `${name} rate limit reached. Try again shortly.`;
      return `${name} request failed (${error.status ?? 'unknown status'}).`;
    }
    return `${name} request failed.`;
  }
}
