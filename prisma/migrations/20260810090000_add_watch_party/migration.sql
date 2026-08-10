ALTER TABLE "users"
ADD COLUMN "watchPartyCoins" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "watch_parties" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "providerMatchId" TEXT,
    "providerCompetitionCode" TEXT,
    "providerSeason" INTEGER,
    "providerPayload" TEXT,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "entryFeeRupees" INTEGER NOT NULL DEFAULT 100,
    "entryCoins" INTEGER NOT NULL DEFAULT 100,
    "entryCoinUnits" INTEGER NOT NULL DEFAULT 1000,
    "predictionOptions" TEXT,
    "predictionLockAt" TIMESTAMP(3),
    "predictionStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "settledOption" TEXT,
    "settledAt" TIMESTAMP(3),
    "settledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_parties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "watch_party_invites" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedById" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInAt" TIMESTAMP(3),
    "checkedInById" TEXT,
    "entryPaid" BOOLEAN NOT NULL DEFAULT false,
    "entryCreditedAt" TIMESTAMP(3),
    "enteredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_party_invites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "watch_party_predictions" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketLabel" TEXT NOT NULL DEFAULT 'Match result',
    "optionKey" TEXT NOT NULL,
    "optionLabel" TEXT NOT NULL,
    "multiplierBasisPoints" INTEGER NOT NULL DEFAULT 20000,
    "stakeUnits" INTEGER NOT NULL,
    "payoutUnits" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_party_predictions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "watch_party_coin_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "amountUnits" INTEGER NOT NULL,
    "balanceAfterUnits" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "partyId" TEXT,
    "predictionId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_party_coin_ledger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "watch_party_shop_orders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemLabel" TEXT NOT NULL,
    "itemCategory" TEXT NOT NULL,
    "tokenCost" INTEGER NOT NULL,
    "tokenCostUnits" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "givenAt" TIMESTAMP(3),
    "givenById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_party_shop_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "watch_parties_status_kickoffAt_idx"
ON "watch_parties"("status", "kickoffAt");

CREATE INDEX "watch_parties_status_createdAt_idx"
ON "watch_parties"("status", "createdAt");

CREATE INDEX "watch_parties_predictionStatus_kickoffAt_idx"
ON "watch_parties"("predictionStatus", "kickoffAt");

CREATE INDEX "watch_parties_providerCompetitionCode_providerSeason_kickoffAt_idx"
ON "watch_parties"("providerCompetitionCode", "providerSeason", "kickoffAt");

CREATE UNIQUE INDEX "watch_party_invites_partyId_userId_key"
ON "watch_party_invites"("partyId", "userId");

CREATE INDEX "watch_party_invites_userId_checkedInAt_idx"
ON "watch_party_invites"("userId", "checkedInAt");

CREATE INDEX "watch_party_invites_partyId_checkedInAt_idx"
ON "watch_party_invites"("partyId", "checkedInAt");

CREATE UNIQUE INDEX "watch_party_predictions_partyId_userId_key"
ON "watch_party_predictions"("partyId", "userId");

CREATE INDEX "watch_party_predictions_partyId_optionKey_idx"
ON "watch_party_predictions"("partyId", "optionKey");

CREATE INDEX "watch_party_coin_ledger_userId_createdAt_idx"
ON "watch_party_coin_ledger"("userId", "createdAt");

CREATE INDEX "watch_party_coin_ledger_actorId_createdAt_idx"
ON "watch_party_coin_ledger"("actorId", "createdAt");

CREATE INDEX "watch_party_coin_ledger_reason_partyId_idx"
ON "watch_party_coin_ledger"("reason", "partyId");

CREATE INDEX "watch_party_coin_ledger_predictionId_idx"
ON "watch_party_coin_ledger"("predictionId");

CREATE INDEX "watch_party_shop_orders_userId_createdAt_idx"
ON "watch_party_shop_orders"("userId", "createdAt");

CREATE INDEX "watch_party_shop_orders_status_createdAt_idx"
ON "watch_party_shop_orders"("status", "createdAt");

CREATE INDEX "watch_party_shop_orders_itemType_status_idx"
ON "watch_party_shop_orders"("itemType", "status");

ALTER TABLE "watch_parties"
ADD CONSTRAINT "watch_parties_settledById_fkey"
FOREIGN KEY ("settledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "watch_party_invites"
ADD CONSTRAINT "watch_party_invites_partyId_fkey"
FOREIGN KEY ("partyId") REFERENCES "watch_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "watch_party_invites"
ADD CONSTRAINT "watch_party_invites_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "watch_party_invites"
ADD CONSTRAINT "watch_party_invites_invitedById_fkey"
FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "watch_party_invites"
ADD CONSTRAINT "watch_party_invites_checkedInById_fkey"
FOREIGN KEY ("checkedInById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "watch_party_predictions"
ADD CONSTRAINT "watch_party_predictions_partyId_fkey"
FOREIGN KEY ("partyId") REFERENCES "watch_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "watch_party_predictions"
ADD CONSTRAINT "watch_party_predictions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "watch_party_coin_ledger"
ADD CONSTRAINT "watch_party_coin_ledger_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "watch_party_coin_ledger"
ADD CONSTRAINT "watch_party_coin_ledger_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "watch_party_coin_ledger"
ADD CONSTRAINT "watch_party_coin_ledger_partyId_fkey"
FOREIGN KEY ("partyId") REFERENCES "watch_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "watch_party_coin_ledger"
ADD CONSTRAINT "watch_party_coin_ledger_predictionId_fkey"
FOREIGN KEY ("predictionId") REFERENCES "watch_party_predictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "watch_party_shop_orders"
ADD CONSTRAINT "watch_party_shop_orders_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "watch_party_shop_orders"
ADD CONSTRAINT "watch_party_shop_orders_givenById_fkey"
FOREIGN KEY ("givenById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "watch_party_shop_orders"
ADD CONSTRAINT "watch_party_shop_orders_cancelledById_fkey"
FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
