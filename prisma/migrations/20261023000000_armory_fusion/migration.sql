CREATE TABLE "armory_fusion_receipts" (
 "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "requestId" TEXT NOT NULL, "payload" TEXT NOT NULL, "outputArtifactId" TEXT NOT NULL,
 "outputSnapshot" TEXT NOT NULL, "oddsVersion" TEXT NOT NULL, "inputTier" TEXT NOT NULL, "outputTier" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("userId", "requestId")
);
CREATE INDEX "armory_fusion_receipts_createdAt_inputTier_outputTier_idx" ON "armory_fusion_receipts"("createdAt", "inputTier", "outputTier");
