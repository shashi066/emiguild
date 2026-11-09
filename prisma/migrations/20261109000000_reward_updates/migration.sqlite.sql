-- No table rebuild: existing entries and ticket references remain intact.
BEGIN TRANSACTION;
ALTER TABLE "users" ADD COLUMN "happyBalanceDay" TEXT;
UPDATE "users" SET "happyBalanceDay" = strftime('%Y-%m-%d', 'now', '+5 hours', '+30 minutes');
ALTER TABLE "guess_36_entries" ADD COLUMN "attemptKey" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "guess_36_entries" ADD COLUMN "reviewReceiptId" TEXT REFERENCES "reward_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "guess_36_entries_roundId_userId_key";
CREATE UNIQUE INDEX "guess_36_entries_roundId_userId_attemptKey_key" ON "guess_36_entries"("roundId", "userId", "attemptKey");
CREATE UNIQUE INDEX "guess_36_entries_reviewReceiptId_key" ON "guess_36_entries"("reviewReceiptId");
COMMIT;
