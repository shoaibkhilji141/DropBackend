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
let OpenAIService = OpenAIService_1 = class OpenAIService {
    configService;
    logger = new common_1.Logger(OpenAIService_1.name);
    client = null;
    clientKey = '';
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
        return this.config()?.model ?? 'gemini-2.0-flash';
    }
    provider() {
        return this.config()?.provider ?? 'openai';
    }
    async completeJson(system, user, model) {
        const openai = this.config();
        if (!openai?.configured || !openai.apiKey) {
            throw new common_1.ServiceUnavailableException('No AI key is configured. Add GEMINI_API_KEY from https://aistudio.google.com/apikey (free) or GROQ_API_KEY / OPENAI_API_KEY.');
        }
        const usedModel = model || openai.model;
        const client = this.getClient(openai);
        let completion;
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
        }
        catch (error) {
            this.logger.warn(`AI request failed: ${error instanceof Error ? error.message : error}`);
            throw new common_1.BadGatewayException(this.publicError(error, openai.provider));
        }
        const text = completion.choices[0]?.message?.content?.trim() ?? '';
        if (!text) {
            throw new common_1.BadGatewayException('The AI provider returned an empty response.');
        }
        return {
            text,
            model: completion.model ?? usedModel,
            tokensUsed: completion.usage?.total_tokens ?? 0,
        };
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
    getClient(config) {
        const identity = `${config.provider}:${config.apiKey}:${config.baseUrl ?? ''}`;
        if (!this.client || this.clientKey !== identity) {
            this.client = new openai_1.default({
                apiKey: config.apiKey,
                baseURL: config.baseUrl,
            });
            this.clientKey = identity;
        }
        return this.client;
    }
    publicError(error, provider) {
        const name = provider === 'gemini' ? 'Gemini' : provider === 'groq' ? 'Groq' : 'OpenAI';
        if (error instanceof openai_1.APIError) {
            const detail = error.message ?? '';
            if (error.status === 401)
                return `${name} rejected the configured API key.`;
            if (error.status === 429 && /credit|quota|billing/i.test(detail)) {
                return `${name} has no credits remaining. Switch to Gemini (free) at https://aistudio.google.com/apikey`;
            }
            if (error.status === 429)
                return `${name} rate limit reached. Try again shortly.`;
            return `${name} request failed (${error.status ?? 'unknown status'}).`;
        }
        return `${name} request failed.`;
    }
};
exports.OpenAIService = OpenAIService;
exports.OpenAIService = OpenAIService = OpenAIService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenAIService);
//# sourceMappingURL=openai.service.js.map