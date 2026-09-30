-- Exec override of a member's Final Cut late penalty percent. Null keeps the automatic penalty.
ALTER TABLE "PackageProgressMember" ADD COLUMN IF NOT EXISTS "latePenaltyPercent" INTEGER;
