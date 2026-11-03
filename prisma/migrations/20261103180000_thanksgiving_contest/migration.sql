-- Thanksgiving leaderboard contest result: one row per year, written once at the close.
CREATE TABLE IF NOT EXISTS "ThanksgivingContest" (
  "year" INTEGER NOT NULL,
  "winnerUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "winningTotal" INTEGER NOT NULL DEFAULT 0,
  "grantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ThanksgivingContest_pkey" PRIMARY KEY ("year")
);
