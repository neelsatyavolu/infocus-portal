-- Stage feedback notes can be marked resolved (and reopened) by the group or its producer.
ALTER TABLE "PackageStageComment" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "PackageStageComment" ADD COLUMN IF NOT EXISTS "resolvedById" TEXT;
