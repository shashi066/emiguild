-- CreateTable
CREATE TABLE "armory_sets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortLabel" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "dropPercentage" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "armory_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armory_artifacts" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "slotType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "slotDropPercentage" INTEGER NOT NULL DEFAULT 25,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "armory_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armory_inventory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "armory_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armory_loadouts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headgearArtifactId" TEXT,
    "armorArtifactId" TEXT,
    "glovesArtifactId" TEXT,
    "bootsArtifactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "armory_loadouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armory_daily_claims" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimDate" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "armory_daily_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armory_set_rewards" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "discountPercentage" INTEGER,
    "discountAmount" INTEGER,
    "gamingMinutes" INTEGER,
    "racingMinutes" INTEGER,
    "validityDays" INTEGER NOT NULL DEFAULT 7,
    "minimumBookingValue" INTEGER,
    "eligibleStations" TEXT,
    "weekdayOnly" BOOLEAN NOT NULL DEFAULT false,
    "maximumDiscount" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "armory_set_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armory_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "rewardSnapshot" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNUSED',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "armory_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "armory_artifacts_setId_slotType_key" ON "armory_artifacts"("setId", "slotType");

-- CreateIndex
CREATE UNIQUE INDEX "armory_inventory_userId_artifactId_key" ON "armory_inventory"("userId", "artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "armory_loadouts_userId_key" ON "armory_loadouts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "armory_daily_claims_userId_claimDate_key" ON "armory_daily_claims"("userId", "claimDate");

-- CreateIndex
CREATE UNIQUE INDEX "armory_set_rewards_setId_key" ON "armory_set_rewards"("setId");

-- CreateIndex
CREATE UNIQUE INDEX "armory_tickets_code_key" ON "armory_tickets"("code");

-- AddForeignKey
ALTER TABLE "armory_artifacts" ADD CONSTRAINT "armory_artifacts_setId_fkey" FOREIGN KEY ("setId") REFERENCES "armory_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armory_inventory" ADD CONSTRAINT "armory_inventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armory_inventory" ADD CONSTRAINT "armory_inventory_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "armory_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armory_loadouts" ADD CONSTRAINT "armory_loadouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armory_loadouts" ADD CONSTRAINT "armory_loadouts_headgearArtifactId_fkey" FOREIGN KEY ("headgearArtifactId") REFERENCES "armory_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armory_loadouts" ADD CONSTRAINT "armory_loadouts_armorArtifactId_fkey" FOREIGN KEY ("armorArtifactId") REFERENCES "armory_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armory_loadouts" ADD CONSTRAINT "armory_loadouts_glovesArtifactId_fkey" FOREIGN KEY ("glovesArtifactId") REFERENCES "armory_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armory_loadouts" ADD CONSTRAINT "armory_loadouts_bootsArtifactId_fkey" FOREIGN KEY ("bootsArtifactId") REFERENCES "armory_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armory_daily_claims" ADD CONSTRAINT "armory_daily_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armory_daily_claims" ADD CONSTRAINT "armory_daily_claims_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "armory_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armory_set_rewards" ADD CONSTRAINT "armory_set_rewards_setId_fkey" FOREIGN KEY ("setId") REFERENCES "armory_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armory_tickets" ADD CONSTRAINT "armory_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armory_tickets" ADD CONSTRAINT "armory_tickets_setId_fkey" FOREIGN KEY ("setId") REFERENCES "armory_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
