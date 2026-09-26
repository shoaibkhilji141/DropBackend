"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configuration = void 0;
exports.isRedisEnabled = isRedisEnabled;
const str = (value, fallback = '') => {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === '' ? fallback : trimmed;
};
const num = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
function isRedisEnabled() {
    if (str(process.env.REDIS_ENABLED, 'false') !== 'true') {
        return false;
    }
    const host = str(process.env.REDIS_HOST, 'localhost');
    const nodeEnv = str(process.env.NODE_ENV, 'development');
    const isLoopback = host === 'localhost' || host === '127.0.0.1';
    const hosted = nodeEnv === 'production' || Boolean(process.env.RENDER);
    return !(hosted && isLoopback);
}
const configuration = () => {
    const auth0 = {
        domain: str(process.env.AUTH0_DOMAIN),
        clientId: str(process.env.AUTH0_CLIENT_ID),
        clientSecret: str(process.env.AUTH0_CLIENT_SECRET),
        audience: str(process.env.AUTH0_AUDIENCE),
    };
    const redisPassword = str(process.env.REDIS_PASSWORD);
    const ebayRedirect = str(process.env.EBAY_REDIRECT_URI);
    const ebayRuName = str(process.env.EBAY_RU_NAME, ebayRedirect.startsWith('http') ? '' : ebayRedirect);
    const ebay = {
        appId: str(process.env.EBAY_APP_ID),
        devId: str(process.env.EBAY_DEV_ID),
        certId: str(process.env.EBAY_CERT_ID),
        clientSecret: str(process.env.EBAY_CLIENT_SECRET) || str(process.env.EBAY_CERT_ID),
        redirectUri: ebayRedirect,
        ruName: ebayRuName,
        marketplaceId: str(process.env.EBAY_MARKETPLACE_ID, 'EBAY_GB'),
        environment: str(process.env.EBAY_ENVIRONMENT, process.env.EBAY_APP_ID?.includes('SBX') ? 'sandbox' : 'production') ===
            'sandbox'
            ? 'sandbox'
            : 'production',
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
            frontendUrl: str(process.env.FRONTEND_URL, str(process.env.CORS_ORIGIN, 'http://localhost:5173').split(',')[0]),
            oauthCallbackForward: str(process.env.OAUTH_CALLBACK_FORWARD, process.env.RENDER ? 'http://localhost:3000' : ''),
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
            enabled: isRedisEnabled(),
        },
        ebay: {
            ...ebay,
            configured: Boolean(ebay.appId && ebay.certId && ebay.clientSecret && ebay.ruName),
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