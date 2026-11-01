-- AlterTable
ALTER TABLE "users" ADD COLUMN     "happyLastClaimedAt" TIMESTAMP(3),
ADD COLUMN     "happyRateCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "happyRateWindowAt" TIMESTAMP(3),
ADD COLUMN     "legendaryPity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "happyDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "user_daily_spins" ADD COLUMN     "awardedRarity" TEXT,
ADD COLUMN     "guaranteeReason" TEXT,
ADD COLUMN     "rewardSnapshot" TEXT;

-- AlterTable
ALTER TABLE "tower_attempts" ADD COLUMN     "lossProtection" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rewardsSnapshot" TEXT;

-- CreateTable
CREATE TABLE "reward_receipts" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "happy_pool" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "available" INTEGER NOT NULL DEFAULT 5,
    "version" INTEGER NOT NULL DEFAULT 0,
    "config" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "happy_pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "happy_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLAIMED',
    "rulesSnapshot" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),

    CONSTRAINT "happy_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "happy_redemptions" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "activeBookingId" TEXT,
    "activeTicketId" TEXT,
    "discount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "happy_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_resets" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "guild_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_audit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resetId" TEXT,

    CONSTRAINT "reward_audit_pkey" PRIMARY KEY ("id")
);

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

-- AddForeignKey
ALTER TABLE "reward_receipts" ADD CONSTRAINT "reward_receipts_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "happy_tickets" ADD CONSTRAINT "happy_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "happy_redemptions" ADD CONSTRAINT "happy_redemptions_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "happy_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "happy_redemptions" ADD CONSTRAINT "happy_redemptions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_audit" ADD CONSTRAINT "reward_audit_resetId_fkey" FOREIGN KEY ("resetId") REFERENCES "guild_resets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "happy_pool" ADD CONSTRAINT "happy_pool_capacity" CHECK ("available" BETWEEN 0 AND 5);
ALTER TABLE "users" ADD CONSTRAINT "legendary_pity_nonnegative" CHECK ("legendaryPity" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "happy_rate_nonnegative" CHECK ("happyRateCount" >= 0);
ALTER TABLE "happy_tickets" ADD CONSTRAINT "happy_ticket_status" CHECK ("status" IN ('CLAIMED', 'REDEEMED', 'EXPIRED'));
