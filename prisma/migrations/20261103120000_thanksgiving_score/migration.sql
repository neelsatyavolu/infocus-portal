-- Thanksgiving leaderboard: one row per person per November.
CREATE TABLE IF NOT EXISTS "ThanksgivingScore" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "leaves" INTEGER NOT NULL DEFAULT 0,
  "pies" INTEGER NOT NULL DEFAULT 0,
  "wishbones" INTEGER NOT NULL DEFAULT 0,
  "giantTurkeys" INTEGER NOT NULL DEFAULT 0,
  "pardons" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ThanksgivingScore_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ThanksgivingScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ThanksgivingScore_userId_year_key" ON "ThanksgivingScore"("userId", "year");
CREATE INDEX IF NOT EXISTS "ThanksgivingScore_year_idx" ON "ThanksgivingScore"("year");
