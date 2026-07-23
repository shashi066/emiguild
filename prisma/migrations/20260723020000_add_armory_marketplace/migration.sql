ALTER TABLE "users"
ADD COLUMN "guildGems" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "armory_trade_listings" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT,
    "offeredArtifactId" TEXT NOT NULL,
    "requestedArtifactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "activeSellerKey" TEXT,
    "gemCost" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "armory_trade_listings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guild_gem_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_gem_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "armory_trade_listings_activeSellerKey_key"
ON "armory_trade_listings"("activeSellerKey");

CREATE INDEX "armory_trade_listings_status_expiresAt_idx"
ON "armory_trade_listings"("status", "expiresAt");

CREATE INDEX "armory_trade_listings_sellerId_createdAt_idx"
ON "armory_trade_listings"("sellerId", "createdAt");

CREATE INDEX "armory_trade_listings_buyerId_completedAt_idx"
ON "armory_trade_listings"("buyerId", "completedAt");

CREATE INDEX "guild_gem_ledger_userId_createdAt_idx"
ON "guild_gem_ledger"("userId", "createdAt");

CREATE INDEX "guild_gem_ledger_actorId_createdAt_idx"
ON "guild_gem_ledger"("actorId", "createdAt");

CREATE INDEX "guild_gem_ledger_reason_referenceId_idx"
ON "guild_gem_ledger"("reason", "referenceId");

ALTER TABLE "armory_trade_listings"
ADD CONSTRAINT "armory_trade_listings_sellerId_fkey"
FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "armory_trade_listings"
ADD CONSTRAINT "armory_trade_listings_buyerId_fkey"
FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "armory_trade_listings"
ADD CONSTRAINT "armory_trade_listings_offeredArtifactId_fkey"
FOREIGN KEY ("offeredArtifactId") REFERENCES "armory_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "armory_trade_listings"
ADD CONSTRAINT "armory_trade_listings_requestedArtifactId_fkey"
FOREIGN KEY ("requestedArtifactId") REFERENCES "armory_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guild_gem_ledger"
ADD CONSTRAINT "guild_gem_ledger_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guild_gem_ledger"
ADD CONSTRAINT "guild_gem_ledger_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
