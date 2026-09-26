"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImporterModule = void 0;
const common_1 = require("@nestjs/common");
const products_module_1 = require("../products/products.module");
const profit_module_1 = require("../profit/profit.module");
const importer_controller_1 = require("./importer.controller");
const importer_service_1 = require("./importer.service");
let ImporterModule = class ImporterModule {
};
exports.ImporterModule = ImporterModule;
exports.ImporterModule = ImporterModule = __decorate([
    (0, common_1.Module)({
        imports: [products_module_1.ProductsModule, profit_module_1.ProfitModule],
        controllers: [importer_controller_1.ImporterController],
        providers: [importer_service_1.ImporterService],
    })
], ImporterModule);
//# sourceMappingURL=importer.module.js.map