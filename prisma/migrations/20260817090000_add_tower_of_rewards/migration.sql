-- Tower of Rewards persistence and generic reward-ticket source support.

ALTER TABLE "bookings" ADD COLUMN "checkedInAt" TIMESTAMP(3);
UPDATE "bookings" SET "checkedInAt" = "updatedAt" WHERE "status" = 'CHECKED_IN' AND "checkedInAt" IS NULL;

ALTER TABLE "armory_tickets" DROP CONSTRAINT "armory_tickets_setId_fkey";
ALTER TABLE "armory_tickets" ALTER COLUMN "setId" DROP NOT NULL;
ALTER TABLE "armory_tickets" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'ARMORY';
ALTER TABLE "armory_tickets" ADD COLUMN "sourceRefId" TEXT;
ALTER TABLE "armory_tickets" ADD CONSTRAINT "armory_tickets_setId_fkey" FOREIGN KEY ("setId") REFERENCES "armory_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "armory_tickets_source_sourceRefId_key" ON "armory_tickets"("source", "sourceRefId");

CREATE TABLE "tower_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "checkInId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'CHECK_IN',
  "sourceRefId" TEXT,
  "grantedById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tower_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tower_tokens_checkInId_key" ON "tower_tokens"("checkInId");
CREATE UNIQUE INDEX "tower_tokens_sourceRefId_key" ON "tower_tokens"("sourceRefId");
CREATE INDEX "tower_tokens_userId_status_expiresAt_idx" ON "tower_tokens"("userId", "status", "expiresAt");
CREATE INDEX "tower_tokens_source_createdAt_idx" ON "tower_tokens"("source", "createdAt");

CREATE TABLE "tower_attempts" (
  "id" TEXT NOT NULL,
  "tokenId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currentLevel" INTEGER NOT NULL DEFAULT 1,
  "securedLevel" INTEGER NOT NULL DEFAULT 0,
  "securedRewardSnapshot" TEXT,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "redCards" TEXT NOT NULL,
  "resolvedPicks" TEXT NOT NULL DEFAULT '[]',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runExpiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tower_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tower_attempts_tokenId_key" ON "tower_attempts"("tokenId");
CREATE INDEX "tower_attempts_userId_status_runExpiresAt_idx" ON "tower_attempts"("userId", "status", "runExpiresAt");

ALTER TABLE "tower_tokens" ADD CONSTRAINT "tower_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tower_tokens" ADD CONSTRAINT "tower_tokens_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tower_attempts" ADD CONSTRAINT "tower_attempts_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tower_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tower_attempts" ADD CONSTRAINT "tower_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
