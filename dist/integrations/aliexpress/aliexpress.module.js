"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AliExpressModule = void 0;
const common_1 = require("@nestjs/common");
const accounts_module_1 = require("../accounts/accounts.module");
const aliexpress_api_client_1 = require("./aliexpress-api.client");
const aliexpress_api_provider_1 = require("./aliexpress-api.provider");
const aliexpress_types_1 = require("./aliexpress.types");
const local_aliexpress_provider_1 = require("./local-aliexpress.provider");
const routing_supplier_provider_1 = require("./routing-supplier.provider");
let AliExpressModule = class AliExpressModule {
};
exports.AliExpressModule = AliExpressModule;
exports.AliExpressModule = AliExpressModule = __decorate([
    (0, common_1.Module)({
        imports: [accounts_module_1.AccountsModule],
        providers: [
            local_aliexpress_provider_1.LocalAliExpressProvider,
            aliexpress_api_client_1.AliExpressApiClient,
            aliexpress_api_provider_1.AliExpressApiProvider,
            routing_supplier_provider_1.RoutingSupplierProvider,
            { provide: aliexpress_types_1.SUPPLIER_PRODUCT_PROVIDER, useExisting: routing_supplier_provider_1.RoutingSupplierProvider },
        ],
        exports: [aliexpress_types_1.SUPPLIER_PRODUCT_PROVIDER, aliexpress_api_provider_1.AliExpressApiProvider, aliexpress_api_client_1.AliExpressApiClient],
    })
], AliExpressModule);
//# sourceMappingURL=aliexpress.module.js.map