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
    constructor(configService) {
        this.configService = configService;
    }
    isConfigured() {
        return this.configService.get('openai')?.configured ?? false;
    }
    defaultModel() {
        return this.configService.get('openai')?.model ?? 'gpt-4o-mini';
    }
    async completeJson(system, user, model) {
        const openai = this.configService.get('openai');
        if (!openai?.configured || !openai.apiKey) {
            throw new common_1.ServiceUnavailableException('OpenAI is not configured. Set OPENAI_API_KEY in the backend environment.');
        }
        const usedModel = model || openai.model || 'gpt-4o-mini';
        const client = this.getClient(openai.apiKey);
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
            this.logger.warn(`OpenAI request failed: ${error instanceof Error ? error.message : error}`);
            throw new common_1.BadGatewayException(this.publicOpenAiError(error));
        }
        const text = completion.choices[0]?.message?.content?.trim() ?? '';
        if (!text) {
            throw new common_1.BadGatewayException('OpenAI returned an empty response.');
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
        throw new common_1.BadGatewayException('OpenAI returned a response that was not valid JSON.');
    }
    requireString(payload, key) {
        const value = payload[key];
        if (typeof value !== 'string' || !value.trim()) {
            throw new common_1.BadGatewayException(`OpenAI response is missing a valid "${key}" field.`);
        }
        return value.trim();
    }
    requireStringArray(payload, key) {
        const value = payload[key];
        if (!Array.isArray(value)) {
            throw new common_1.BadGatewayException(`OpenAI response is missing a valid "${key}" array.`);
        }
        const items = value.filter((item) => typeof item === 'string' && item.trim().length > 0);
        if (items.length === 0) {
            throw new common_1.BadGatewayException(`OpenAI response "${key}" array was empty.`);
        }
        return items.map((item) => item.trim());
    }
    getClient(apiKey) {
        if (!this.client) {
            this.client = new openai_1.default({ apiKey });
        }
        return this.client;
    }
    publicOpenAiError(error) {
        if (error instanceof openai_1.APIError) {
            const detail = error.message ?? '';
            if (error.status === 401)
                return 'OpenAI rejected the configured API key.';
            if (error.status === 429 && /credit|quota|billing/i.test(detail)) {
                return 'OpenAI has no credits remaining on the configured API key.';
            }
            if (error.status === 429)
                return 'OpenAI rate limit reached. Try again shortly.';
            return `OpenAI request failed (${error.status ?? 'unknown status'}).`;
        }
        return 'OpenAI request failed.';
    }
};
exports.OpenAIService = OpenAIService;
exports.OpenAIService = OpenAIService = OpenAIService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenAIService);
//# sourceMappingURL=openai.service.js.map