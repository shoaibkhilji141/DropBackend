-- AlterTable
CREATE TABLE "new_PriceHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "previousPrice" REAL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PriceHistory" ("currency", "id", "price", "productId", "recordedAt") SELECT "currency", "id", "price", "productId", "recordedAt" FROM "PriceHistory";
DROP TABLE "PriceHistory";
ALTER TABLE "new_PriceHistory" RENAME TO "PriceHistory";
CREATE INDEX "PriceHistory_productId_recordedAt_idx" ON "PriceHistory"("productId", "recordedAt");

CREATE TABLE "new_StockHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "stock" INTEGER NOT NULL,
    "previousStock" INTEGER,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StockHistory" ("id", "productId", "recordedAt", "stock") SELECT "id", "productId", "recordedAt", "stock" FROM "StockHistory";
DROP TABLE "StockHistory";
ALTER TABLE "new_StockHistory" RENAME TO "StockHistory";
CREATE INDEX "StockHistory_productId_recordedAt_idx" ON "StockHistory"("productId", "recordedAt");

CREATE TABLE "new_ShippingHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "cost" REAL NOT NULL,
    "etaDays" INTEGER,
    "previousMethod" TEXT,
    "previousCost" REAL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShippingHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShippingHistory" ("cost", "etaDays", "id", "method", "productId", "recordedAt") SELECT "cost", "etaDays", "id", "method", "productId", "recordedAt" FROM "ShippingHistory";
DROP TABLE "ShippingHistory";
ALTER TABLE "new_ShippingHistory" RENAME TO "ShippingHistory";
CREATE INDEX "ShippingHistory_productId_recordedAt_idx" ON "ShippingHistory"("productId", "recordedAt");

CREATE TABLE "new_MonitoringRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "threshold" REAL,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "lastError" TEXT,
    "lastStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonitoringRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MonitoringRule" ("createdAt", "enabled", "id", "lastRunAt", "productId", "threshold", "type", "updatedAt") SELECT "createdAt", "enabled", "id", "lastRunAt", "productId", "threshold", "type", "updatedAt" FROM "MonitoringRule";
DROP TABLE "MonitoringRule";
ALTER TABLE "new_MonitoringRule" RENAME TO "MonitoringRule";
CREATE INDEX "MonitoringRule_productId_type_idx" ON "MonitoringRule"("productId", "type");
CREATE INDEX "MonitoringRule_enabled_nextRunAt_idx" ON "MonitoringRule"("enabled", "nextRunAt");
