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

const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o'];

export interface AiModelOption {
  id: string;
  label: string;
  provider: string;
}

/**
 * Tries Groq, then Gemini, then OpenAI. OpenAI is last because the configured
 * key currently has no credits; Groq and Gemini still produce listing copy.
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
    return this.config()?.model ?? 'openai/gpt-oss-20b';
  }

  provider(): string {
    const names = this.config()?.providers.map((item) => item.name) ?? [];
    return names.length > 1 ? `auto (${names.join(' → ')})` : (this.config()?.provider ?? 'groq');
  }

  availableModels(): AiModelOption[] {
    const models: AiModelOption[] = [{ id: 'auto', label: 'Auto (first available)', provider: 'auto' }];
    for (const provider of this.config()?.providers ?? []) {
      for (const model of this.modelsFor(provider.name, provider.model)) {
        models.push({
          id: `${provider.name}:${model}`,
          label: `${this.providerLabel(provider.name)} · ${model}`,
          provider: provider.name,
        });
      }
    }
    return models;
  }

  async completeJson(system: string, user: string, model?: string): Promise<OpenAICompletion> {
    const openai = this.config();
    const providers = openai?.providers ?? [];
    if (!openai?.configured || providers.length === 0) {
      throw new ServiceUnavailableException(
        'No AI key is configured. Add GROQ_API_KEY from https://console.groq.com/keys or GEMINI_API_KEY from https://aistudio.google.com/apikey.',
      );
    }

    const selected = this.resolveSelection(model, providers);
    if (selected) {
      return this.completeWith(selected.provider, system, user, selected.model);
    }

    let lastError = '';
    for (const provider of providers) {
      try {
        return await this.completeWith(provider, system, user);
      } catch (error) {
        lastError = this.publicError(error, provider.name);
        this.logger.warn(`${provider.name} failed, trying the next AI provider: ${lastError}`);
      }
    }

    throw new BadGatewayException(lastError || 'All configured AI providers failed.');
  }

  private resolveSelection(
    model: string | undefined,
    providers: AiProviderConfig[],
  ): { provider: AiProviderConfig; model: string } | null {
    const raw = model?.trim();
    if (!raw || raw === 'auto') return null;

    const colon = raw.indexOf(':');
    const providerName = (colon >= 0 ? raw.slice(0, colon) : '').toLowerCase();
    const modelName = (colon >= 0 ? raw.slice(colon + 1) : raw).trim();

    const provider =
      providers.find((item) => item.name === providerName) ??
      providers.find((item) => this.modelsFor(item.name, item.model).includes(modelName)) ??
      providers.find((item) => item.model === modelName);

    if (!provider || !modelName) {
      throw new ServiceUnavailableException(
        `Unknown AI model "${raw}". Choose one of: ${this.availableModels()
          .map((item) => item.id)
          .join(', ')}`,
      );
    }

    return { provider, model: modelName };
  }

  private modelsFor(provider: AiProviderConfig['name'], configured?: string): string[] {
    const extras =
      provider === 'groq' ? GROQ_MODELS : provider === 'gemini' ? GEMINI_MODELS : OPENAI_MODELS;
    return Array.from(new Set([configured, ...extras].filter((item): item is string => Boolean(item))));
  }

  private providerLabel(provider: AiProviderConfig['name']): string {
    if (provider === 'groq') return 'Groq';
    if (provider === 'gemini') return 'Gemini';
    return 'OpenAI';
  }

  parseJsonObject(text: string): Record<string, unknown> {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
        } catch {
          // Fall through.
        }
      }
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
    modelOverride?: string,
  ): Promise<OpenAICompletion> {
    if (provider.name === 'gemini') {
      return this.completeGemini(provider, system, user, modelOverride);
    }

    const models = modelOverride
      ? [modelOverride]
      : provider.name === 'groq'
        ? Array.from(new Set([provider.model, ...GROQ_MODELS]))
        : [provider.model];

    let lastError: unknown;
    for (const model of models) {
      for (const jsonMode of [true, false]) {
        try {
          return await this.completeOpenAiCompatible(provider, model, system, user, jsonMode);
        } catch (error) {
          lastError = error;
          this.logger.warn(
            `${provider.name}:${model} ${jsonMode ? 'json' : 'text'} failed: ${this.publicError(error, provider.name)}`,
          );
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`${provider.name} request failed.`);
  }

  private async completeOpenAiCompatible(
    provider: AiProviderConfig,
    model: string,
    system: string,
    user: string,
    jsonMode: boolean,
  ): Promise<OpenAICompletion> {
    const completion = await this.getClient(provider).chat.completions.create({
      model,
      temperature: 0.6,
      ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
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
      model: `${provider.name}:${completion.model ?? model}`,
      tokensUsed: completion.usage?.total_tokens ?? 0,
    };
  }

  private async completeGemini(
    provider: AiProviderConfig,
    system: string,
    user: string,
    modelOverride?: string,
  ): Promise<OpenAICompletion> {
    const models = modelOverride
      ? [modelOverride]
      : Array.from(new Set([provider.model, ...GEMINI_MODELS]));
    let lastError: unknown;
    for (const model of models) {
      try {
        return await this.completeGeminiNative(provider.apiKey, model, system, user);
      } catch (error) {
        lastError = error;
        this.logger.warn(`gemini native ${model} failed: ${this.publicError(error, 'gemini')}`);
      }
      try {
        return await this.completeOpenAiCompatible(provider, model, system, user, true);
      } catch (error) {
        lastError = error;
        this.logger.warn(`gemini openai-compat ${model} failed: ${this.publicError(error, 'gemini')}`);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Gemini request failed.');
  }

  private async completeGeminiNative(
    apiKey: string,
    model: string,
    system: string,
    user: string,
  ): Promise<OpenAICompletion> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.6, responseMimeType: 'application/json' },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number };
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { totalTokenCount?: number };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message || `Gemini request failed (${response.status}).`);
    }
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }
    return {
      text,
      model: `gemini:${model}`,
      tokensUsed: payload.usageMetadata?.totalTokenCount ?? 0,
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
      if (error.status === 404) return `${name} model was not found.`;
      if (error.status === 429 && /credit|quota|billing/i.test(detail)) {
        return `${name} has no credits remaining.`;
      }
      if (error.status === 429) return `${name} rate limit reached.`;
      return `${name} request failed (${error.status ?? 'unknown status'}).`;
    }
    return error instanceof Error ? error.message : `${name} request failed.`;
  }
}
