ALTER TABLE "armory_tickets" ADD COLUMN "claimDate" TEXT NOT NULL DEFAULT '';
UPDATE "armory_tickets"
SET "claimDate" = to_char("claimedAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
WHERE "claimDate" = '';
CREATE INDEX "armory_tickets_userId_claimDate_idx" ON "armory_tickets"("userId", "claimDate");
CREATE INDEX "armory_tickets_claimDate_idx" ON "armory_tickets"("claimDate");
