-- AlterTable: add minimum booking duration to stations (default 1 hour)
ALTER TABLE "stations" ADD COLUMN "minDuration" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- AlterColumn: change duration from integer to float on bookings (for 30-min support)
ALTER TABLE "bookings" ALTER COLUMN "duration" TYPE DOUBLE PRECISION;

-- AlterTable: add hasControllers flag to stations (default true = all existing stations keep controllers)
ALTER TABLE "stations" ADD COLUMN "hasControllers" BOOLEAN NOT NULL DEFAULT true;
