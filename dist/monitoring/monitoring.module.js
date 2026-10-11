"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringModule = void 0;
const common_1 = require("@nestjs/common");
const accounts_module_1 = require("../integrations/accounts/accounts.module");
const aliexpress_module_1 = require("../integrations/aliexpress/aliexpress.module");
const ebay_module_1 = require("../integrations/ebay/ebay.module");
const google_sheets_client_1 = require("../integrations/google-sheets/google-sheets.client");
const listings_module_1 = require("../listings/listings.module");
const users_module_1 = require("../users/users.module");
const monitoring_controller_1 = require("./monitoring.controller");
const monitoring_service_1 = require("./monitoring.service");
const sheet_monitoring_service_1 = require("./sheet-monitoring.service");
let MonitoringModule = class MonitoringModule {
};
exports.MonitoringModule = MonitoringModule;
exports.MonitoringModule = MonitoringModule = __decorate([
    (0, common_1.Module)({
        imports: [aliexpress_module_1.AliExpressModule, listings_module_1.ListingsModule, accounts_module_1.AccountsModule, users_module_1.UsersModule, ebay_module_1.EbayModule],
        controllers: [monitoring_controller_1.MonitoringController],
        providers: [monitoring_service_1.MonitoringService, sheet_monitoring_service_1.SheetMonitoringService, google_sheets_client_1.GoogleSheetsClient],
        exports: [monitoring_service_1.MonitoringService, sheet_monitoring_service_1.SheetMonitoringService],
    })
], MonitoringModule);
//# sourceMappingURL=monitoring.module.js.map