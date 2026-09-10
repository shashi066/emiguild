CREATE TABLE "guess_36_rounds" (
  "id" TEXT NOT NULL,
  "roundDate" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "winningNumber" INTEGER,
  "rewardsSnapshot" TEXT,
  "generatedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guess_36_rounds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guess_36_rounds_status_check" CHECK ("status" IN ('OPEN', 'CLOSED', 'DRAWN')),
  CONSTRAINT "guess_36_rounds_winning_number_check" CHECK ("winningNumber" IS NULL OR "winningNumber" BETWEEN 1 AND 36)
);

CREATE UNIQUE INDEX "guess_36_rounds_roundDate_key" ON "guess_36_rounds"("roundDate");
CREATE INDEX "guess_36_rounds_status_roundDate_idx" ON "guess_36_rounds"("status", "roundDate");

CREATE TABLE "guess_36_entries" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "selectionType" TEXT NOT NULL DEFAULT 'NUMBER',
  "selectedNumber" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guess_36_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guess_36_entries_selection_check" CHECK (
    ("selectionType" = 'NUMBER' AND "selectedNumber" IS NOT NULL AND "selectedNumber" BETWEEN 1 AND 36)
    OR ("selectionType" IN ('RANGE', 'ROW') AND "selectedNumber" IS NOT NULL AND "selectedNumber" BETWEEN 1 AND 3)
    OR ("selectionType" IN ('EVEN', 'ODD') AND "selectedNumber" IS NULL)
  )
);

CREATE UNIQUE INDEX "guess_36_entries_roundId_userId_key" ON "guess_36_entries"("roundId", "userId");
CREATE INDEX "guess_36_entries_roundId_selectionType_selectedNumber_idx" ON "guess_36_entries"("roundId", "selectionType", "selectedNumber");
CREATE INDEX "guess_36_entries_userId_createdAt_idx" ON "guess_36_entries"("userId", "createdAt");

ALTER TABLE "guess_36_entries" ADD CONSTRAINT "guess_36_entries_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "guess_36_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guess_36_entries" ADD CONSTRAINT "guess_36_entries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "settings" ("id", "key", "value", "label", "updatedAt")
VALUES ('guess-36-enabled', 'guess_36_enabled', 'true', 'Guess 36 Enabled', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "settings" ("id", "key", "value", "label", "updatedAt")
VALUES ('guess-36-rewards', 'guess_36_rewards', '{"EXACT":{"type":"GAMING_TIME","value":60,"name":"60 Minutes Gaming"},"GROUP":{"type":"GAMING_TIME","value":15,"name":"15 Minutes Gaming"},"PARITY":{"type":"GAMING_TIME","value":10,"name":"10 Minutes Gaming"}}', 'Guess 36 Rewards', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
