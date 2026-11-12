-- Portfolio grades per semester (existing rows are 2026-27 S1), plus an optional student link.
ALTER TABLE "PortfolioGrade" ADD COLUMN IF NOT EXISTS "semester" TEXT;
UPDATE "PortfolioGrade" SET "semester" = '2026-27 S1' WHERE "semester" IS NULL;
ALTER TABLE "PortfolioGrade" ALTER COLUMN "semester" SET NOT NULL;
ALTER TABLE "PortfolioGrade" ADD COLUMN IF NOT EXISTS "link" TEXT;
-- Points stay null until graded.
ALTER TABLE "PortfolioGrade" ALTER COLUMN "points" DROP DEFAULT;
ALTER TABLE "PortfolioGrade" ALTER COLUMN "points" DROP NOT NULL;
DROP INDEX IF EXISTS "PortfolioGrade_userId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PortfolioGrade_userId_semester_key" ON "PortfolioGrade"("userId", "semester");

-- Equipment requests: planned pickup and return.
ALTER TABLE "equipment_requests" ADD COLUMN IF NOT EXISTS "pickupAt" TIMESTAMP(3);
ALTER TABLE "equipment_requests" ADD COLUMN IF NOT EXISTS "returnAt" TIMESTAMP(3);

-- Anchor drop / swap requests.
DO $$ BEGIN
  CREATE TYPE "AnchorSlotRequestKind" AS ENUM ('DROP', 'SWAP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "AnchorSlotRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "AnchorSlotRequest" (
  "id" TEXT NOT NULL,
  "showDate" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "AnchorSlotRequestKind" NOT NULL,
  "swapWithUserId" TEXT,
  "reason" TEXT NOT NULL DEFAULT '',
  "status" "AnchorSlotRequestStatus" NOT NULL DEFAULT 'PENDING',
  "lateNotice" BOOLEAN NOT NULL DEFAULT false,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "decidedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnchorSlotRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AnchorSlotRequest_showDate_status_idx" ON "AnchorSlotRequest"("showDate", "status");
CREATE INDEX IF NOT EXISTS "AnchorSlotRequest_userId_createdAt_idx" ON "AnchorSlotRequest"("userId", "createdAt");

-- Rate-limit counters shared across Worker isolates.
CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX IF NOT EXISTS "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
