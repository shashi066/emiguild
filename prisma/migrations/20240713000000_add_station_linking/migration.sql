-- AlterTable: Add linkedStationId column if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stations' AND column_name='linkedStationId') THEN
    ALTER TABLE "stations" ADD COLUMN "linkedStationId" TEXT;
  END IF;
END $$;

-- CreateIndex: Only if doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'stations_linkedStationId_key') THEN
    CREATE UNIQUE INDEX "stations_linkedStationId_key" ON "stations"("linkedStationId");
  END IF;
END $$;

-- AddForeignKey: Only if doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'stations_linkedStationId_fkey') THEN
    ALTER TABLE "stations" ADD CONSTRAINT "stations_linkedStationId_fkey" FOREIGN KEY ("linkedStationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
