CREATE TABLE "ps5_rentals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rentalDays" INTEGER NOT NULL,
    "extraControllers" INTEGER NOT NULL DEFAULT 0,
    "pricePerDay" INTEGER NOT NULL,
    "controllerPrice" INTEGER NOT NULL DEFAULT 0,
    "totalPrice" INTEGER NOT NULL,
    "activeUserId" TEXT,
    "selectedGames" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryCity" TEXT NOT NULL,
    "deliveryPincode" TEXT NOT NULL,
    "deliveryNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startDate" TEXT,
    "endDate" TEXT,
    "adminComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ps5_rentals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ps5_rentals_status_check" CHECK ("status" IN ('PENDING', 'CONFIRMED', 'DELIVERED', 'RETURNED', 'CANCELLED'))
);

CREATE UNIQUE INDEX "ps5_rentals_activeUserId_key" ON "ps5_rentals"("activeUserId");
CREATE INDEX "ps5_rentals_status_createdAt_idx" ON "ps5_rentals"("status", "createdAt");
CREATE INDEX "ps5_rentals_userId_createdAt_idx" ON "ps5_rentals"("userId", "createdAt");
ALTER TABLE "ps5_rentals" ADD CONSTRAINT "ps5_rentals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
