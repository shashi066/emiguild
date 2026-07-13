-- Remove linkedStationId from stations table
-- All slot-blocking is now handled via venue capacity check (max concurrent bookings)
ALTER TABLE "stations" DROP COLUMN IF EXISTS "linkedStationId";
