PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
ALTER TABLE "guess_36_rounds" ADD COLUMN "minesSnapshot" TEXT;
CREATE TABLE "new_guess_36_entries" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "roundId" TEXT NOT NULL,
 "userId" TEXT NOT NULL,
 "selectionType" TEXT DEFAULT 'NUMBER',
 "selectedNumber" INTEGER,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "gameMode" TEXT NOT NULL DEFAULT 'LEGACY',
 "mineBoard" TEXT,
 "mineRevealed" TEXT NOT NULL DEFAULT '[]',
 "mineStatus" TEXT,
 "mineStartedAt" DATETIME,
 "mineExpiresAt" DATETIME,
 "mineSettledAt" DATETIME,
 "mineVersion" INTEGER NOT NULL DEFAULT 0,
 "mineRules" TEXT,
 "mineReward" TEXT,
 "mineRateAt" DATETIME,
 "mineRateCount" INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY ("roundId") REFERENCES "guess_36_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_guess_36_entries"("id","roundId","userId","selectionType","selectedNumber","createdAt") SELECT "id","roundId","userId","selectionType","selectedNumber","createdAt" FROM "guess_36_entries";
DROP TABLE "guess_36_entries";
ALTER TABLE "new_guess_36_entries" RENAME TO "guess_36_entries";
CREATE UNIQUE INDEX "guess_36_entries_roundId_userId_key" ON "guess_36_entries"("roundId","userId");
CREATE INDEX "guess_36_entries_roundId_selectionType_selectedNumber_idx" ON "guess_36_entries"("roundId","selectionType","selectedNumber");
CREATE INDEX "guess_36_entries_userId_createdAt_idx" ON "guess_36_entries"("userId","createdAt");
CREATE INDEX "guess_36_entries_userId_gameMode_mineStatus_idx" ON "guess_36_entries"("userId","gameMode","mineStatus");
COMMIT;
PRAGMA foreign_keys=ON;
