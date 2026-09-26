"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configuration = void 0;
const str = (value, fallback = '') => value === undefined || value === '' ? fallback : value;
const num = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const configuration = () => {
    const auth0 = {
        domain: str(process.env.AUTH0_DOMAIN),
        clientId: str(process.env.AUTH0_CLIENT_ID),
        clientSecret: str(process.env.AUTH0_CLIENT_SECRET),
        audience: str(process.env.AUTH0_AUDIENCE),
    };
    const redisPassword = str(process.env.REDIS_PASSWORD);
    const ebay = {
        appId: str(process.env.EBAY_APP_ID),
        devId: str(process.env.EBAY_DEV_ID),
        certId: str(process.env.EBAY_CERT_ID),
        clientSecret: str(process.env.EBAY_CLIENT_SECRET),
        redirectUri: str(process.env.EBAY_REDIRECT_URI),
    };
    const aliexpress = {
        appKey: str(process.env.ALIEXPRESS_APP_KEY),
        appSecret: str(process.env.ALIEXPRESS_APP_SECRET),
        callbackUrl: str(process.env.ALIEXPRESS_CALLBACK_URL),
    };
    const openaiApiKey = str(process.env.OPENAI_API_KEY);
    return {
        app: {
            nodeEnv: str(process.env.NODE_ENV, 'development'),
            port: num(process.env.PORT, 3000),
            apiPrefix: str(process.env.API_PREFIX, 'api'),
            corsOrigin: str(process.env.CORS_ORIGIN, 'http://localhost:5173'),
            logLevel: str(process.env.LOG_LEVEL, 'debug'),
        },
        auth0: {
            ...auth0,
            enabled: Boolean(auth0.domain && auth0.audience),
        },
        redis: {
            host: str(process.env.REDIS_HOST, 'localhost'),
            port: num(process.env.REDIS_PORT, 6379),
            password: redisPassword || undefined,
            enabled: str(process.env.REDIS_ENABLED, 'false') === 'true',
        },
        ebay: {
            ...ebay,
            configured: Boolean(ebay.appId && ebay.certId && ebay.clientSecret),
        },
        aliexpress: {
            ...aliexpress,
            configured: Boolean(aliexpress.appKey && aliexpress.appSecret),
        },
        openai: {
            apiKey: openaiApiKey,
            model: str(process.env.OPENAI_MODEL, 'gpt-4o-mini'),
            configured: Boolean(openaiApiKey),
        },
    };
};
exports.configuration = configuration;
//# sourceMappingURL=configuration.js.map