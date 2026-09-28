-- Final Cut toss (anchor lead-in) and Package of the Cycle votes. Additive only.
ALTER TABLE "PackageProgressRow" ADD COLUMN IF NOT EXISTS "finalCutToss" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PackageProgressRow" ADD COLUMN IF NOT EXISTS "packageOfCycleAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PackageOfCycleVote" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "voterUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackageOfCycleVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PackageOfCycleVote_rowId_voterUserId_key" ON "PackageOfCycleVote"("rowId", "voterUserId");
CREATE INDEX IF NOT EXISTS "PackageOfCycleVote_voterUserId_idx" ON "PackageOfCycleVote"("voterUserId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PackageOfCycleVote_rowId_fkey') THEN
    ALTER TABLE "PackageOfCycleVote"
      ADD CONSTRAINT "PackageOfCycleVote_rowId_fkey"
      FOREIGN KEY ("rowId") REFERENCES "PackageProgressRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PackageOfCycleVote_voterUserId_fkey') THEN
    ALTER TABLE "PackageOfCycleVote"
      ADD CONSTRAINT "PackageOfCycleVote_voterUserId_fkey"
      FOREIGN KEY ("voterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
