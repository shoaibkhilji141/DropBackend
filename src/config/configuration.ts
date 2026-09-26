export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  corsOrigin: string;
  logLevel: string;
}

export interface Auth0Config {
  domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
  /** Auth0 guards only enforce tokens once a domain + audience are configured. */
  enabled: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  enabled: boolean;
}

export interface EbayConfig {
  appId: string;
  devId: string;
  certId: string;
  clientSecret: string;
  redirectUri: string;
  configured: boolean;
}

export interface AliExpressConfig {
  appKey: string;
  appSecret: string;
  callbackUrl: string;
  configured: boolean;
}

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  configured: boolean;
}

export interface Configuration {
  app: AppConfig;
  auth0: Auth0Config;
  redis: RedisConfig;
  ebay: EbayConfig;
  aliexpress: AliExpressConfig;
  openai: OpenAIConfig;
}

const str = (value: string | undefined, fallback = ''): string =>
  value === undefined || value === '' ? fallback : value;

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const configuration = (): Configuration => {
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
      // Opt-in so the API boots cleanly when no local Redis is running.
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
