-- The Thanksgiving contest's winner is announced (and the prize granted) at 8:00 AM the day after it closes.
ALTER TABLE "ThanksgivingContest" ADD COLUMN IF NOT EXISTS "revealedAt" TIMESTAMP(3);
