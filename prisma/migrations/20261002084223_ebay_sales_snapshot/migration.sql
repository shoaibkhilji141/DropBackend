-- CreateTable
CREATE TABLE "EbaySalesSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "legacyItemId" TEXT,
    "title" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "available" INTEGER,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "EbaySalesSnapshot_itemId_capturedAt_idx" ON "EbaySalesSnapshot"("itemId", "capturedAt");
