-- Meetings: host handoff. The room makes someone host when the last host leaves. Additive only.
-- AlterTable
ALTER TABLE "MeetingParticipant" ADD COLUMN     "promotedHost" BOOLEAN NOT NULL DEFAULT false;
