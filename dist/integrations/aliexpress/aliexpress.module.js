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
const aliexpress_types_1 = require("./aliexpress.types");
const local_aliexpress_provider_1 = require("./local-aliexpress.provider");
let AliExpressModule = class AliExpressModule {
};
exports.AliExpressModule = AliExpressModule;
exports.AliExpressModule = AliExpressModule = __decorate([
    (0, common_1.Module)({
        providers: [
            local_aliexpress_provider_1.LocalAliExpressProvider,
            { provide: aliexpress_types_1.SUPPLIER_PRODUCT_PROVIDER, useExisting: local_aliexpress_provider_1.LocalAliExpressProvider },
        ],
        exports: [aliexpress_types_1.SUPPLIER_PRODUCT_PROVIDER],
    })
], AliExpressModule);
//# sourceMappingURL=aliexpress.module.js.map