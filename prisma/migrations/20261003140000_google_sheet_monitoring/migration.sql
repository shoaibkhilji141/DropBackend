-- CreateTable
CREATE TABLE "GoogleSheetSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "spreadsheetUrl" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "worksheetName" TEXT NOT NULL DEFAULT 'Product to Upload',
    "supplierColumn" INTEGER NOT NULL DEFAULT 2,
    "ebayColumn" INTEGER NOT NULL DEFAULT 3,
    "titleColumn" INTEGER NOT NULL DEFAULT 4,
    "lastSyncedAt" DATETIME,
    "lastError" TEXT,
    "lastStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoogleSheetSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoogleSheetRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "sheetRow" INTEGER NOT NULL,
    "title" TEXT,
    "supplierUrl" TEXT NOT NULL,
    "ebayUrl" TEXT NOT NULL,
    "supplierId" TEXT,
    "ebayItemId" TEXT,
    "productId" TEXT,
    "listingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoogleSheetRow_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "GoogleSheetSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoogleSheetRow_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GoogleSheetRow_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleSheetSource_userId_key" ON "GoogleSheetSource"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleSheetRow_sourceId_sheetRow_key" ON "GoogleSheetRow"("sourceId", "sheetRow");

-- CreateIndex
CREATE INDEX "GoogleSheetRow_productId_idx" ON "GoogleSheetRow"("productId");

-- CreateIndex
CREATE INDEX "GoogleSheetRow_listingId_idx" ON "GoogleSheetRow"("listingId");
