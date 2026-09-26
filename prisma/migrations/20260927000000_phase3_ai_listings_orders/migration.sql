-- CreateTable
CREATE TABLE "ProfitSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "marketplaceFeePercent" REAL NOT NULL DEFAULT 12.9,
    "paymentFeePercent" REAL NOT NULL DEFAULT 2.9,
    "fixedFee" REAL NOT NULL DEFAULT 0.3,
    "additionalCosts" REAL NOT NULL DEFAULT 0,
    "defaultMarkupMultiplier" REAL NOT NULL DEFAULT 2.6,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "storeId" TEXT,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "images" TEXT,
    "category" TEXT,
    "sku" TEXT,
    "price" REAL NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "shippingMethod" TEXT,
    "shippingCost" REAL NOT NULL DEFAULT 0,
    "shippingEtaDays" INTEGER,
    "selectedVariantIds" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Listing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Listing_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Listing" ("createdAt", "description", "externalId", "id", "price", "productId", "publishedAt", "quantity", "status", "storeId", "title", "updatedAt") SELECT "createdAt", "description", "externalId", "id", "price", "productId", "publishedAt", "quantity", "status", "storeId", "title", "updatedAt" FROM "Listing";
DROP TABLE "Listing";
ALTER TABLE "new_Listing" RENAME TO "Listing";
CREATE INDEX "Listing_productId_idx" ON "Listing"("productId");
CREATE INDEX "Listing_status_idx" ON "Listing"("status");
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "externalId" TEXT,
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "buyerAddress" TEXT,
    "buyerCity" TEXT,
    "buyerCountry" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fulfillmentStatus" TEXT NOT NULL DEFAULT 'UNFULFILLED',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "supplierCost" REAL NOT NULL DEFAULT 0,
    "shippingCost" REAL NOT NULL DEFAULT 0,
    "trackingCode" TEXT,
    "trackingCarrier" TEXT,
    "shippedAt" DATETIME,
    "placedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("buyerName", "createdAt", "currency", "externalId", "id", "placedAt", "shippingCost", "status", "storeId", "totalAmount", "trackingCode", "updatedAt") SELECT "buyerName", "createdAt", "currency", "externalId", "id", "placedAt", "shippingCost", "status", "storeId", "totalAmount", "trackingCode", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_storeId_idx" ON "Order"("storeId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_fulfillmentStatus_idx" ON "Order"("fulfillmentStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
