"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const integration_accounts_service_1 = require("../integrations/accounts/integration-accounts.service");
const aliexpress_api_provider_1 = require("../integrations/aliexpress/aliexpress-api.provider");
const ebay_service_1 = require("../integrations/ebay/ebay.service");
const users_service_1 = require("../users/users.service");
const oauth_state_store_1 = require("./oauth-state.store");
let ConnectionsService = class ConnectionsService {
    configService;
    ebayService;
    aliExpress;
    accounts;
    users;
    oauthState;
    constructor(configService, ebayService, aliExpress, accounts, users, oauthState) {
        this.configService = configService;
        this.ebayService = ebayService;
        this.aliExpress = aliExpress;
        this.accounts = accounts;
        this.users = users;
        this.oauthState = oauthState;
    }
    async getOverview(identity) {
        const user = await this.users.findCurrent(identity);
        const [ebayAccount, aliAccount] = await Promise.all([
            this.accounts.find(user.id, client_1.Platform.EBAY),
            this.accounts.find(user.id, client_1.Platform.ALIEXPRESS),
        ]);
        return {
            ebay: this.ebayService.getStatus(this.accounts.toPublic(ebayAccount)),
            aliexpress: this.aliExpress.getStatus(this.accounts.toPublic(aliAccount), this.accounts.capabilitiesOf(aliAccount)),
        };
    }
    async startUrl(platform, identity) {
        const user = await this.users.findCurrent(identity);
        const state = this.oauthState.create(user.id, platform);
        if (platform === 'ebay') {
            return { url: this.ebayService.authorizationUrl(state) };
        }
        if (!this.aliExpress.isConfigured()) {
            throw new common_1.BadRequestException('AliExpress app credentials are not configured.');
        }
        return { url: this.aliExpress.authorizationUrl(state) };
    }
    async handleCallback(platform, code, state, error) {
        const app = this.configService.get('app');
        const hosted = app.nodeEnv === 'production' || Boolean(process.env.RENDER);
        const forward = this.localForwardUrl(app.oauthCallbackForward);
        if (hosted && forward && (code || error)) {
            const params = new URLSearchParams();
            if (code)
                params.set('code', code);
            if (state)
                params.set('state', state);
            if (error)
                params.set('error', error);
            return `${forward}/api/connections/${platform}/callback?${params.toString()}`;
        }
        const frontend = app.frontendUrl;
        const dest = platform === 'ebay' ? '/connections/ebay' : '/connections/aliexpress';
        if (error)
            return `${frontend}${dest}?error=${encodeURIComponent(error)}`;
        if (!code || !state)
            return `${frontend}${dest}?error=${encodeURIComponent('Missing authorization code')}`;
        try {
            const userId = this.oauthState.read(state, platform);
            if (platform === 'ebay') {
                await this.ebayService.completeOAuth(userId, code);
            }
            else {
                await this.aliExpress.completeOAuth(userId, code);
            }
            return `${frontend}${dest}?connected=1`;
        }
        catch (caught) {
            const message = caught instanceof Error ? caught.message : 'Authorization failed';
            return `${frontend}${dest}?error=${encodeURIComponent(message)}`;
        }
    }
    localForwardUrl(value) {
        if (!value)
            return null;
        try {
            const url = new URL(value);
            const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
            return local ? url.origin : null;
        }
        catch {
            return null;
        }
    }
    async disconnect(platform, identity) {
        const user = await this.users.findCurrent(identity);
        if (platform === 'ebay')
            return this.ebayService.disconnect(user.id);
        return this.aliExpress.disconnect(user.id);
    }
};
exports.ConnectionsService = ConnectionsService;
exports.ConnectionsService = ConnectionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        ebay_service_1.EbayService,
        aliexpress_api_provider_1.AliExpressApiProvider,
        integration_accounts_service_1.IntegrationAccountsService,
        users_service_1.UsersService,
        oauth_state_store_1.OAuthStateStore])
], ConnectionsService);
//# sourceMappingURL=connections.service.js.map