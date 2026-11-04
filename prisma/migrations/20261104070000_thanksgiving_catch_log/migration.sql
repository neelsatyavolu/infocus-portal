-- Thanksgiving cheat checks and catch log: every reported catch with its verdict.
ALTER TABLE "ThanksgivingScore" ADD COLUMN IF NOT EXISTS "flaggedAt" TIMESTAMP(3);
ALTER TABLE "ThanksgivingScore" ADD COLUMN IF NOT EXISTS "flagReason" TEXT;
ALTER TABLE "ThanksgivingScore" ADD COLUMN IF NOT EXISTS "reviewClearedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ThanksgivingCatch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "caughtAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reactionMs" INTEGER,
  "source" TEXT NOT NULL DEFAULT 'play',
  "accepted" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  CONSTRAINT "ThanksgivingCatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ThanksgivingCatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ThanksgivingCatch_year_caughtAt_idx" ON "ThanksgivingCatch"("year", "caughtAt");
CREATE INDEX IF NOT EXISTS "ThanksgivingCatch_userId_year_caughtAt_idx" ON "ThanksgivingCatch"("userId", "year", "caughtAt");
