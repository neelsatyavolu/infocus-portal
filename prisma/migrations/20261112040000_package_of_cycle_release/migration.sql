-- Package of the Cycle winners stay with the graders until an executive releases the cycle.
ALTER TABLE "PackageCycle" ADD COLUMN IF NOT EXISTS "packageOfCycleReleasedAt" TIMESTAMP(3);

-- Cycle 1's winner was announced before this change, so it stays public. Later cycles wait for release.
UPDATE "PackageCycle" pc SET "packageOfCycleReleasedAt" = NOW()
WHERE pc."packageOfCycleReleasedAt" IS NULL AND pc."cycleNumber" = 1
  AND EXISTS (SELECT 1 FROM "PackageProgressRow" r WHERE r."cycleNumber" = pc."cycleNumber" AND r."packageOfCycleAt" IS NOT NULL);
