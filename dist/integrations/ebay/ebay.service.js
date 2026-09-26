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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EbayService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let EbayService = class EbayService {
    configService;
    constructor(configService) {
        this.configService = configService;
    }
    getStatus() {
        const ebay = this.configService.get('ebay');
        const missing = [
            ['EBAY_APP_ID', ebay.appId],
            ['EBAY_DEV_ID', ebay.devId],
            ['EBAY_CERT_ID', ebay.certId],
            ['EBAY_CLIENT_SECRET', ebay.clientSecret],
            ['EBAY_REDIRECT_URI', ebay.redirectUri],
        ]
            .filter(([, value]) => !value)
            .map(([key]) => key);
        return {
            platform: 'EBAY',
            configured: ebay.configured,
            connected: false,
            missing,
        };
    }
    publishListing() {
        throw new common_1.NotImplementedException('eBay publishing is not implemented yet. Configure eBay credentials and add the Sell API client.');
    }
};
exports.EbayService = EbayService;
exports.EbayService = EbayService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], EbayService);
//# sourceMappingURL=ebay.service.js.map