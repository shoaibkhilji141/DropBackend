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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionsController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const public_decorator_1 = require("../auth/public.decorator");
const connections_service_1 = require("./connections.service");
let ConnectionsController = class ConnectionsController {
    connectionsService;
    constructor(connectionsService) {
        this.connectionsService = connectionsService;
    }
    overview(user) {
        return this.connectionsService.getOverview(user);
    }
    async ebay(user) {
        return (await this.connectionsService.getOverview(user)).ebay;
    }
    async aliexpress(user) {
        return (await this.connectionsService.getOverview(user)).aliexpress;
    }
    start(platform, user) {
        return this.connectionsService.startUrl(platform, user);
    }
    disconnect(platform, user) {
        return this.connectionsService.disconnect(platform, user);
    }
    async callback(platform, code, state, error, response) {
        const url = await this.connectionsService.handleCallback(platform, code, state, error);
        response.redirect(url);
    }
};
exports.ConnectionsController = ConnectionsController;
__decorate([
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('ebay'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "ebay", null);
__decorate([
    (0, common_1.Get)('aliexpress'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "aliexpress", null);
__decorate([
    openapi.ApiParam({ name: "platform", enum: ["ebay", "aliexpress"] }),
    (0, common_1.Post)(':platform/connect'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('platform')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "start", null);
__decorate([
    openapi.ApiParam({ name: "platform", enum: ["ebay", "aliexpress"] }),
    (0, common_1.Post)(':platform/disconnect'),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Param)('platform')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ConnectionsController.prototype, "disconnect", null);
__decorate([
    openapi.ApiQuery({ name: "code", required: false }),
    openapi.ApiQuery({ name: "state", required: false }),
    openapi.ApiQuery({ name: "error", required: false }),
    openapi.ApiParam({ name: "platform", enum: ["ebay", "aliexpress"] }),
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':platform/callback'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('platform')),
    __param(1, (0, common_1.Query)('code')),
    __param(2, (0, common_1.Query)('state')),
    __param(3, (0, common_1.Query)('error')),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "callback", null);
exports.ConnectionsController = ConnectionsController = __decorate([
    (0, swagger_1.ApiTags)('connections'),
    (0, common_1.Controller)('connections'),
    __metadata("design:paramtypes", [connections_service_1.ConnectionsService])
], ConnectionsController);
//# sourceMappingURL=connections.controller.js.map