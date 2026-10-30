-- AlterTable
ALTER TABLE "users" ADD COLUMN     "happyAvailable" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "happyLastRefillAt" TIMESTAMP(3),
ADD COLUMN     "happyLastRefillId" TEXT,
ADD COLUMN     "happyVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "happy_pool" DROP COLUMN "available";

-- AlterTable
ALTER TABLE "guild_resets" ADD COLUMN     "grantId" TEXT,
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "guild_resets_userId_status_expiresAt_idx" ON "guild_resets"("userId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "guild_resets_grantId_userId_key" ON "guild_resets"("grantId", "userId");

-- AddForeignKey
ALTER TABLE "guild_resets" ADD CONSTRAINT "guild_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


UPDATE guild_resets SET status = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, reason = reason || ' [Archived shared reset: replaced by personal balances]' WHERE "userId" IS NULL AND status = 'PENDING';
ALTER TABLE users ADD CONSTRAINT happy_available_bounds CHECK ("happyAvailable" BETWEEN 0 AND 5);
ALTER TABLE users ADD CONSTRAINT happy_version_nonnegative CHECK ("happyVersion" >= 0);
