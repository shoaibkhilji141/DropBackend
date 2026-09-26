"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const nestjs_pino_1 = require("nestjs-pino");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { bufferLogs: true });
    app.useLogger(app.get(nestjs_pino_1.Logger));
    const configService = app.get(config_1.ConfigService);
    const appConfig = configService.get('app');
    app.setGlobalPrefix(appConfig.apiPrefix);
    app.enableCors({ origin: appConfig.corsOrigin.split(','), credentials: true });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    if (appConfig.nodeEnv !== 'production') {
        const document = swagger_1.SwaggerModule.createDocument(app, new swagger_1.DocumentBuilder()
            .setTitle('Dropshipping Management API')
            .setDescription('Backend API for AliExpress to eBay dropshipping operations')
            .setVersion('0.1.0')
            .addBearerAuth()
            .build());
        swagger_1.SwaggerModule.setup('docs', app, document);
    }
    await app.listen(appConfig.port);
}
void bootstrap();
//# sourceMappingURL=main.js.map