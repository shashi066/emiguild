-- CreateTable
CREATE TABLE "user_passes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passType" TEXT NOT NULL,
    "totalHours" INTEGER NOT NULL,
    "usedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_passes_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add pass fields to bookings
ALTER TABLE "bookings" ADD COLUMN "userPassId" TEXT;
ALTER TABLE "bookings" ADD COLUMN "passHoursDeducted" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AddForeignKey: UserPass -> User
ALTER TABLE "user_passes" ADD CONSTRAINT "user_passes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Booking -> UserPass
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_userPassId_fkey"
    FOREIGN KEY ("userPassId") REFERENCES "user_passes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
