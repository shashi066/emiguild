-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "legendaryPity" INTEGER NOT NULL DEFAULT 0 CHECK ("legendaryPity" >= 0),
    "happyAvailable" INTEGER NOT NULL DEFAULT 5 CHECK ("happyAvailable" BETWEEN 0 AND 5),
    "happyVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("happyVersion" >= 0),
    "happyLastRefillId" TEXT,
    "happyLastRefillAt" DATETIME,
    "happyLastClaimedAt" DATETIME,
    "happyRateWindowAt" DATETIME,
    "happyRateCount" INTEGER NOT NULL DEFAULT 0 CHECK ("happyRateCount" >= 0),
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "guildGems" INTEGER NOT NULL DEFAULT 0,
    "watchPartyCoins" INTEGER NOT NULL DEFAULT 0,
    "lifecycleWhatsappFrequency" INTEGER NOT NULL DEFAULT 0,
    "lifecycleEmailDigest" BOOLEAN NOT NULL DEFAULT false,
    "lifecycleConsentUpdatedAt" DATETIME,
    "lifecycleConsentVersion" TEXT,
    "lastWebsiteVisitAt" DATETIME,
    "lastForgotPasswordDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("createdAt", "email", "guildGems", "happyLastClaimedAt", "happyRateCount", "happyRateWindowAt", "id", "lastForgotPasswordDate", "lastWebsiteVisitAt", "legendaryPity", "lifecycleConsentUpdatedAt", "lifecycleConsentVersion", "lifecycleEmailDigest", "lifecycleWhatsappFrequency", "name", "password", "phone", "role", "updatedAt", "watchPartyCoins") SELECT "createdAt", "email", "guildGems", "happyLastClaimedAt", "happyRateCount", "happyRateWindowAt", "id", "lastForgotPasswordDate", "lastWebsiteVisitAt", "legendaryPity", "lifecycleConsentUpdatedAt", "lifecycleConsentVersion", "lifecycleEmailDigest", "lifecycleWhatsappFrequency", "name", "password", "phone", "role", "updatedAt", "watchPartyCoins" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE TABLE "new_happy_pool" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "version" INTEGER NOT NULL DEFAULT 0,
    "config" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_happy_pool" ("config", "id", "updatedAt", "version") SELECT "config", "id", "updatedAt", "version" FROM "happy_pool";
DROP TABLE "happy_pool";
ALTER TABLE "new_happy_pool" RENAME TO "happy_pool";
CREATE TABLE "new_guild_resets" (
    "userId" TEXT,
    "grantId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "activatedAt" DATETIME,
    "cancelledAt" DATETIME,
    CONSTRAINT "guild_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_guild_resets" ("activatedAt", "cancelledAt", "createdAt", "createdById", "expiresAt", "id", "kind", "reason", "status") SELECT "activatedAt", "cancelledAt", "createdAt", "createdById", "expiresAt", "id", "kind", "reason", "status" FROM "guild_resets";
DROP TABLE "guild_resets";
ALTER TABLE "new_guild_resets" RENAME TO "guild_resets";
CREATE INDEX "guild_resets_status_expiresAt_idx" ON "guild_resets"("status", "expiresAt");
CREATE INDEX "guild_resets_userId_status_expiresAt_idx" ON "guild_resets"("userId", "status", "expiresAt");
CREATE UNIQUE INDEX "guild_resets_grantId_userId_key" ON "guild_resets"("grantId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


UPDATE guild_resets SET status = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, reason = reason || ' [Archived shared reset: replaced by personal balances]' WHERE "userId" IS NULL AND status = 'PENDING';
