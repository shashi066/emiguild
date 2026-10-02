ALTER TABLE "users"
ADD COLUMN "lifecycleWhatsappFrequency" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lifecycleEmailDigest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lifecycleConsentUpdatedAt" TIMESTAMP(3),
ADD COLUMN "lifecycleConsentVersion" TEXT,
ADD COLUMN "lastWebsiteVisitAt" TIMESTAMP(3);
