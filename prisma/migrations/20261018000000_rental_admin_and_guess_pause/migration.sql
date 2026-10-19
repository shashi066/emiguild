ALTER TABLE "ps5_rentals" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "ps5_rentals" ADD COLUMN "discount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ps5_rentals" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'ONLINE';
INSERT INTO "settings" ("id", "key", "value", "label", "updatedAt") VALUES ('guess36_pause_20261018', 'guess_36_enabled', 'false', 'Guess 36 Enabled', CURRENT_TIMESTAMP) ON CONFLICT ("key") DO UPDATE SET "value" = 'false';
