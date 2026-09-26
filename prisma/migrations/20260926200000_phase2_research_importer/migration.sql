-- AlterTable
ALTER TABLE "Product" ADD COLUMN "category" TEXT;
ALTER TABLE "Product" ADD COLUMN "images" TEXT;
ALTER TABLE "Product" ADD COLUMN "importedAt" DATETIME;
ALTER TABLE "Product" ADD COLUMN "ordersCount" INTEGER;
ALTER TABLE "Product" ADD COLUMN "rating" REAL;
ALTER TABLE "Product" ADD COLUMN "reviews" INTEGER;
ALTER TABLE "Product" ADD COLUMN "shippingEtaDays" INTEGER;
ALTER TABLE "Product" ADD COLUMN "shippingMethod" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "score" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "externalId" TEXT,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "attributes" TEXT,
    "imageUrl" TEXT,
    "costPrice" REAL NOT NULL DEFAULT 0,
    "sellPrice" REAL NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductVariant" ("attributes", "costPrice", "createdAt", "id", "name", "productId", "sellPrice", "sku", "stock", "updatedAt") SELECT "attributes", "costPrice", "createdAt", "id", "name", "productId", "sellPrice", "sku", "stock", "updatedAt" FROM "ProductVariant";
DROP TABLE "ProductVariant";
ALTER TABLE "new_ProductVariant" RENAME TO "ProductVariant";
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_externalId_key" ON "Supplier"("externalId");

