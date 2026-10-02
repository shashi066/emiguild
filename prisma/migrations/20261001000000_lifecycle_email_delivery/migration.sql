-- CreateTable
CREATE TABLE "lifecycle_email_states" (
    "userId" TEXT NOT NULL,
    "lastComebackEvaluatedAt" TIMESTAMP(3),
    "nextComebackCheckAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lifecycle_email_states_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "lifecycle_email_deliveries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENDING',
    "messageId" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lifecycle_email_deliveries_dedupeKey_key" ON "lifecycle_email_deliveries"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "lifecycle_email_deliveries_messageId_key" ON "lifecycle_email_deliveries"("messageId");

-- CreateIndex
CREATE INDEX "lifecycle_email_deliveries_userId_dispatchedAt_idx" ON "lifecycle_email_deliveries"("userId", "dispatchedAt");

-- CreateIndex
CREATE INDEX "lifecycle_email_deliveries_status_dispatchedAt_idx" ON "lifecycle_email_deliveries"("status", "dispatchedAt");

-- AddForeignKey
ALTER TABLE "lifecycle_email_states" ADD CONSTRAINT "lifecycle_email_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_email_deliveries" ADD CONSTRAINT "lifecycle_email_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

