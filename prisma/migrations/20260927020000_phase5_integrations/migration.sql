-- CreateTable
CREATE TABLE "IntegrationAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "externalUserId" TEXT,
    "displayName" TEXT,
    "accountEmail" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" DATETIME,
    "scopes" TEXT,
    "marketplaceId" TEXT,
    "lastError" TEXT,
    "lastSyncedAt" DATETIME,
    "capabilities" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IntegrationAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "IntegrationAccount_userId_platform_key" ON "IntegrationAccount"("userId", "platform");
CREATE INDEX "IntegrationAccount_platform_status_idx" ON "IntegrationAccount"("platform", "status");

ALTER TABLE "Listing" ADD COLUMN "offerId" TEXT;
ALTER TABLE "Listing" ADD COLUMN "lastError" TEXT;
ALTER TABLE "Listing" ADD COLUMN "autoUpdateEnabled" BOOLEAN NOT NULL DEFAULT 0;

ALTER TABLE "Order" ADD COLUMN "lineItemData" TEXT;
ALTER TABLE "Order" ADD COLUMN "lastError" TEXT;
