-- Final Cut scores are per member: quality /25 + effort /25 from each executive producer.
-- Existing whole-group rows keep memberUserId NULL.
ALTER TABLE "PackageFinalCutScore" ADD COLUMN IF NOT EXISTS "memberUserId" TEXT;
ALTER TABLE "PackageFinalCutScore" ADD COLUMN IF NOT EXISTS "qualityPoints" DOUBLE PRECISION;
ALTER TABLE "PackageFinalCutScore" ADD COLUMN IF NOT EXISTS "effortPoints" DOUBLE PRECISION;

DROP INDEX IF EXISTS "PackageFinalCutScore_rowId_graderUserId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PackageFinalCutScore_rowId_graderUserId_memberUserId_key"
  ON "PackageFinalCutScore"("rowId", "graderUserId", "memberUserId");
CREATE INDEX IF NOT EXISTS "PackageFinalCutScore_memberUserId_idx" ON "PackageFinalCutScore"("memberUserId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PackageFinalCutScore_memberUserId_fkey') THEN
    ALTER TABLE "PackageFinalCutScore"
      ADD CONSTRAINT "PackageFinalCutScore_memberUserId_fkey"
      FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
