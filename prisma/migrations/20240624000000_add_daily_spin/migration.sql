-- CreateTable: loot_items (spin wheel prizes)
CREATE TABLE "loot_items" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "iconUrl"     TEXT,
    "weight"      INTEGER NOT NULL,
    "enabled"     BOOLEAN NOT NULL DEFAULT true,
    "rarity"      TEXT DEFAULT 'COMMON',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loot_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: user_daily_spins
CREATE TABLE "user_daily_spins" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "lootItemId" TEXT,
    "spinDate"   TEXT NOT NULL,
    "attempts"   INTEGER NOT NULL DEFAULT 1,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_daily_spins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one spin record per user per day
CREATE UNIQUE INDEX "user_daily_spins_userId_spinDate_key" ON "user_daily_spins"("userId", "spinDate");

-- AddForeignKey: user_daily_spins.userId → users.id
ALTER TABLE "user_daily_spins" ADD CONSTRAINT "user_daily_spins_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: user_daily_spins.lootItemId → loot_items.id
ALTER TABLE "user_daily_spins" ADD CONSTRAINT "user_daily_spins_lootItemId_fkey"
    FOREIGN KEY ("lootItemId") REFERENCES "loot_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
