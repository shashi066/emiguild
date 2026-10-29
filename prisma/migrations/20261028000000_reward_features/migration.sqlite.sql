-- AlterTable
ALTER TABLE "user_daily_spins" ADD COLUMN "awardedRarity" TEXT;
ALTER TABLE "user_daily_spins" ADD COLUMN "guaranteeReason" TEXT;
ALTER TABLE "user_daily_spins" ADD COLUMN "rewardSnapshot" TEXT;

-- CreateTable
CREATE TABLE "reward_receipts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reward_receipts_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "happy_pool" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "available" INTEGER NOT NULL DEFAULT 5 CHECK ("available" BETWEEN 0 AND 5),
    "version" INTEGER NOT NULL DEFAULT 0,
    "config" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "happy_tickets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLAIMED' CHECK ("status" IN ('CLAIMED', 'REDEEMED', 'EXPIRED')),
    "rulesSnapshot" TEXT NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "redeemedAt" DATETIME,
    CONSTRAINT "happy_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "happy_redemptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "activeBookingId" TEXT,
    "activeTicketId" TEXT,
    "discount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" DATETIME,
    CONSTRAINT "happy_redemptions_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "happy_tickets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "happy_redemptions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "guild_resets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "activatedAt" DATETIME,
    "cancelledAt" DATETIME
);

-- CreateTable
CREATE TABLE "reward_audit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resetId" TEXT,
    CONSTRAINT "reward_audit_resetId_fkey" FOREIGN KEY ("resetId") REFERENCES "guild_resets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "legendaryPity" INTEGER NOT NULL DEFAULT 0 CHECK ("legendaryPity" >= 0),
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
INSERT INTO "new_users" ("createdAt", "email", "guildGems", "id", "lastForgotPasswordDate", "lastWebsiteVisitAt", "lifecycleConsentUpdatedAt", "lifecycleConsentVersion", "lifecycleEmailDigest", "lifecycleWhatsappFrequency", "name", "password", "phone", "role", "updatedAt", "watchPartyCoins") SELECT "createdAt", "email", "guildGems", "id", "lastForgotPasswordDate", "lastWebsiteVisitAt", "lifecycleConsentUpdatedAt", "lifecycleConsentVersion", "lifecycleEmailDigest", "lifecycleWhatsappFrequency", "name", "password", "phone", "role", "updatedAt", "watchPartyCoins" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE TABLE "new_bookings" (
    "happyDiscount" REAL NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "stationId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "duration" REAL NOT NULL,
    "totalPrice" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "bookingType" TEXT NOT NULL DEFAULT 'ONLINE',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "extraControllers" INTEGER NOT NULL DEFAULT 0,
    "controllerCharge" REAL NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "adminComment" TEXT,
    "userPassId" TEXT,
    "passHoursDeducted" REAL NOT NULL DEFAULT 0,
    "appliedBenefitType" TEXT,
    "checkedInAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "bookings_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bookings_userPassId_fkey" FOREIGN KEY ("userPassId") REFERENCES "user_passes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_bookings" ("adminComment", "appliedBenefitType", "bookingType", "checkedInAt", "controllerCharge", "createdAt", "customerName", "customerPhone", "date", "discount", "duration", "endTime", "extraControllers", "id", "notes", "passHoursDeducted", "paymentStatus", "razorpayOrderId", "razorpayPaymentId", "startTime", "stationId", "status", "totalPrice", "updatedAt", "userId", "userPassId") SELECT "adminComment", "appliedBenefitType", "bookingType", "checkedInAt", "controllerCharge", "createdAt", "customerName", "customerPhone", "date", "discount", "duration", "endTime", "extraControllers", "id", "notes", "passHoursDeducted", "paymentStatus", "razorpayOrderId", "razorpayPaymentId", "startTime", "stationId", "status", "totalPrice", "updatedAt", "userId", "userPassId" FROM "bookings";
DROP TABLE "bookings";
ALTER TABLE "new_bookings" RENAME TO "bookings";
CREATE TABLE "new_tower_attempts" (
    "lossProtection" BOOLEAN NOT NULL DEFAULT false,
    "rewardsSnapshot" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "securedLevel" INTEGER NOT NULL DEFAULT 0,
    "securedRewardSnapshot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "redCards" TEXT NOT NULL,
    "resolvedPicks" TEXT NOT NULL DEFAULT '[]',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runExpiresAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "claimedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tower_attempts_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tower_tokens" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tower_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_tower_attempts" ("claimedAt", "completedAt", "currentLevel", "id", "redCards", "resolvedPicks", "runExpiresAt", "securedLevel", "securedRewardSnapshot", "startedAt", "status", "tokenId", "updatedAt", "userId") SELECT "claimedAt", "completedAt", "currentLevel", "id", "redCards", "resolvedPicks", "runExpiresAt", "securedLevel", "securedRewardSnapshot", "startedAt", "status", "tokenId", "updatedAt", "userId" FROM "tower_attempts";
DROP TABLE "tower_attempts";
ALTER TABLE "new_tower_attempts" RENAME TO "tower_attempts";
CREATE UNIQUE INDEX "tower_attempts_tokenId_key" ON "tower_attempts"("tokenId");
CREATE INDEX "tower_attempts_userId_status_runExpiresAt_idx" ON "tower_attempts"("userId", "status", "runExpiresAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "reward_receipts_actorId_operation_requestId_key" ON "reward_receipts"("actorId", "operation", "requestId");

-- CreateIndex
CREATE INDEX "happy_tickets_userId_status_expiresAt_idx" ON "happy_tickets"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "happy_tickets_status_claimedAt_idx" ON "happy_tickets"("status", "claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "happy_redemptions_activeBookingId_key" ON "happy_redemptions"("activeBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "happy_redemptions_activeTicketId_key" ON "happy_redemptions"("activeTicketId");

-- CreateIndex
CREATE INDEX "happy_redemptions_ticketId_status_idx" ON "happy_redemptions"("ticketId", "status");

-- CreateIndex
CREATE INDEX "happy_redemptions_bookingId_status_idx" ON "happy_redemptions"("bookingId", "status");

-- CreateIndex
CREATE INDEX "guild_resets_status_expiresAt_idx" ON "guild_resets"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "reward_audit_resetId_key" ON "reward_audit"("resetId");

-- CreateIndex
CREATE INDEX "reward_audit_action_createdAt_idx" ON "reward_audit"("action", "createdAt");
