ALTER TABLE "assistant_usage_daily" ADD COLUMN "guidedRequestCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "assistant_usage_daily" ADD COLUMN "guidedWindowStart" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "assistant_usage_daily" ADD COLUMN "guidedWindowCount" INTEGER NOT NULL DEFAULT 0;
