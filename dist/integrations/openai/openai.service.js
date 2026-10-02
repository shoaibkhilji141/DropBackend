"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OpenAIService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = __importStar(require("openai"));
const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o'];
let OpenAIService = OpenAIService_1 = class OpenAIService {
    configService;
    logger = new common_1.Logger(OpenAIService_1.name);
    clients = new Map();
    constructor(configService) {
        this.configService = configService;
    }
    config() {
        return this.configService.get('openai');
    }
    isConfigured() {
        return this.config()?.configured ?? false;
    }
    defaultModel() {
        return this.config()?.model ?? 'openai/gpt-oss-20b';
    }
    provider() {
        const names = this.config()?.providers.map((item) => item.name) ?? [];
        return names.length > 1 ? `auto (${names.join(' → ')})` : (this.config()?.provider ?? 'groq');
    }
    availableModels() {
        const models = [{ id: 'auto', label: 'Auto (first available)', provider: 'auto' }];
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
    async completeJson(system, user, model) {
        const openai = this.config();
        const providers = openai?.providers ?? [];
        if (!openai?.configured || providers.length === 0) {
            throw new common_1.ServiceUnavailableException('No AI key is configured. Add GROQ_API_KEY from https://console.groq.com/keys or GEMINI_API_KEY from https://aistudio.google.com/apikey.');
        }
        const selected = this.resolveSelection(model, providers);
        if (selected) {
            return this.completeWith(selected.provider, system, user, selected.model);
        }
        let lastError = '';
        for (const provider of providers) {
            try {
                return await this.completeWith(provider, system, user);
            }
            catch (error) {
                lastError = this.publicError(error, provider.name);
                this.logger.warn(`${provider.name} failed, trying the next AI provider: ${lastError}`);
            }
        }
        throw new common_1.BadGatewayException(lastError || 'All configured AI providers failed.');
    }
    resolveSelection(model, providers) {
        const raw = model?.trim();
        if (!raw || raw === 'auto')
            return null;
        const colon = raw.indexOf(':');
        const providerName = (colon >= 0 ? raw.slice(0, colon) : '').toLowerCase();
        const modelName = (colon >= 0 ? raw.slice(colon + 1) : raw).trim();
        const provider = providers.find((item) => item.name === providerName) ??
            providers.find((item) => this.modelsFor(item.name, item.model).includes(modelName)) ??
            providers.find((item) => item.model === modelName);
        if (!provider || !modelName) {
            throw new common_1.ServiceUnavailableException(`Unknown AI model "${raw}". Choose one of: ${this.availableModels()
                .map((item) => item.id)
                .join(', ')}`);
        }
        return { provider, model: modelName };
    }
    modelsFor(provider, configured) {
        const extras = provider === 'groq' ? GROQ_MODELS : provider === 'gemini' ? GEMINI_MODELS : OPENAI_MODELS;
        return Array.from(new Set([configured, ...extras].filter((item) => Boolean(item))));
    }
    providerLabel(provider) {
        if (provider === 'groq')
            return 'Groq';
        if (provider === 'gemini')
            return 'Gemini';
        return 'OpenAI';
    }
    parseJsonObject(text) {
        const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
        try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            const match = cleaned.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    const parsed = JSON.parse(match[0]);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        return parsed;
                    }
                }
                catch {
                }
            }
        }
        throw new common_1.BadGatewayException('The AI provider returned a response that was not valid JSON.');
    }
    requireString(payload, key) {
        const value = payload[key];
        if (typeof value !== 'string' || !value.trim()) {
            throw new common_1.BadGatewayException(`AI response is missing a valid "${key}" field.`);
        }
        return value.trim();
    }
    requireStringArray(payload, key) {
        const value = payload[key];
        if (!Array.isArray(value)) {
            throw new common_1.BadGatewayException(`AI response is missing a valid "${key}" array.`);
        }
        const items = value.filter((item) => typeof item === 'string' && item.trim().length > 0);
        if (items.length === 0) {
            throw new common_1.BadGatewayException(`AI response "${key}" array was empty.`);
        }
        return items.map((item) => item.trim());
    }
    async completeWith(provider, system, user, modelOverride) {
        if (provider.name === 'gemini') {
            return this.completeGemini(provider, system, user, modelOverride);
        }
        const models = modelOverride
            ? [modelOverride]
            : provider.name === 'groq'
                ? Array.from(new Set([provider.model, ...GROQ_MODELS]))
                : [provider.model];
        let lastError;
        for (const model of models) {
            for (const jsonMode of [true, false]) {
                try {
                    return await this.completeOpenAiCompatible(provider, model, system, user, jsonMode);
                }
                catch (error) {
                    lastError = error;
                    this.logger.warn(`${provider.name}:${model} ${jsonMode ? 'json' : 'text'} failed: ${this.publicError(error, provider.name)}`);
                }
            }
        }
        throw lastError instanceof Error ? lastError : new Error(`${provider.name} request failed.`);
    }
    async completeOpenAiCompatible(provider, model, system, user, jsonMode) {
        const completion = await this.getClient(provider).chat.completions.create({
            model,
            temperature: 0.6,
            ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
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
    async completeGemini(provider, system, user, modelOverride) {
        const models = modelOverride
            ? [modelOverride]
            : Array.from(new Set([provider.model, ...GEMINI_MODELS]));
        let lastError;
        for (const model of models) {
            try {
                return await this.completeGeminiNative(provider.apiKey, model, system, user);
            }
            catch (error) {
                lastError = error;
                this.logger.warn(`gemini native ${model} failed: ${this.publicError(error, 'gemini')}`);
            }
            try {
                return await this.completeOpenAiCompatible(provider, model, system, user, true);
            }
            catch (error) {
                lastError = error;
                this.logger.warn(`gemini openai-compat ${model} failed: ${this.publicError(error, 'gemini')}`);
            }
        }
        throw lastError instanceof Error ? lastError : new Error('Gemini request failed.');
    }
    async completeGeminiNative(apiKey, model, system, user) {
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
        const payload = (await response.json().catch(() => ({})));
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
    getClient(provider) {
        const identity = `${provider.name}:${provider.apiKey}:${provider.baseUrl ?? ''}`;
        const existing = this.clients.get(identity);
        if (existing)
            return existing;
        const client = new openai_1.default({
            apiKey: provider.apiKey,
            baseURL: provider.baseUrl,
        });
        this.clients.set(identity, client);
        return client;
    }
    publicError(error, provider) {
        const name = provider === 'gemini' ? 'Gemini' : provider === 'groq' ? 'Groq' : 'OpenAI';
        if (error instanceof openai_1.APIError) {
            const detail = error.message ?? '';
            if (error.status === 401)
                return `${name} rejected the configured API key.`;
            if (error.status === 404)
                return `${name} model was not found.`;
            if (error.status === 429 && /credit|quota|billing/i.test(detail)) {
                return `${name} has no credits remaining.`;
            }
            if (error.status === 429)
                return `${name} rate limit reached.`;
            return `${name} request failed (${error.status ?? 'unknown status'}).`;
        }
        return error instanceof Error ? error.message : `${name} request failed.`;
    }
};
exports.OpenAIService = OpenAIService;
exports.OpenAIService = OpenAIService = OpenAIService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenAIService);
//# sourceMappingURL=openai.service.js.map