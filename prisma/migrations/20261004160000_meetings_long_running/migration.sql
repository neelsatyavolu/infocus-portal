-- Meetings, long-running: how a meeting ended (an empty room can be reopened for 15 minutes), the
-- room generation tickets carry, and notes in parts (Scribe restarts, stuck-notes sweeper). Additive only.
-- CreateEnum
CREATE TYPE "MeetingEndReason" AS ENUM ('HOST', 'EMPTY', 'STALE');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "endedReason" "MeetingEndReason",
ADD COLUMN     "notesDrivePaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "notesError" TEXT,
ADD COLUMN     "notesPart" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notesStatusAt" TIMESTAMP(3),
ADD COLUMN     "roomGeneration" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scribeStartedAt" TIMESTAMP(3);
