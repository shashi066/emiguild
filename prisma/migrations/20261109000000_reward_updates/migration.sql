-- Forward-only: preserve all existing attempts, rewards and personal balances.
ALTER TABLE "users" ADD COLUMN "happyBalanceDay" TEXT;
UPDATE "users" SET "happyBalanceDay" = TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');

ALTER TABLE "guess_36_entries" ADD COLUMN "attemptKey" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "guess_36_entries" ADD COLUMN "reviewReceiptId" TEXT;
DROP INDEX "guess_36_entries_roundId_userId_key";
CREATE UNIQUE INDEX "guess_36_entries_roundId_userId_attemptKey_key" ON "guess_36_entries"("roundId", "userId", "attemptKey");
CREATE UNIQUE INDEX "guess_36_entries_reviewReceiptId_key" ON "guess_36_entries"("reviewReceiptId");
ALTER TABLE "guess_36_entries" ADD CONSTRAINT "guess_36_entries_reviewReceiptId_fkey" FOREIGN KEY ("reviewReceiptId") REFERENCES "reward_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
