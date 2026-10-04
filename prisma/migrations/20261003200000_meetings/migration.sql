-- Meetings: producer video meetings (E2EE room on the meeting-room Worker, notes by the Drive Scribe).
-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MeetingParticipantState" AS ENUM ('WAITING', 'ADMITTED', 'DENIED', 'REMOVED');

-- CreateEnum
CREATE TYPE "MeetingNotesStatus" AS ENUM ('NONE', 'RECORDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MeetingAccess" AS ENUM ('OPEN', 'INVITE_ONLY');

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "seriesKey" TEXT,
    "occurrenceKey" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "access" "MeetingAccess" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "inviteeUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "quickAccess" BOOLEAN NOT NULL DEFAULT false,
    "notesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "keyEpoch" INTEGER NOT NULL DEFAULT 0,
    "keyCiphertext" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "startNotifiedAt" TIMESTAMP(3),
    "notesStatus" "MeetingNotesStatus" NOT NULL DEFAULT 'NONE',
    "notesSummary" TEXT,
    "notesDrivePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "MeetingParticipantState" NOT NULL DEFAULT 'WAITING',
    "firstJoinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastJoinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meeting_startsAt_idx" ON "Meeting"("startsAt");

-- CreateIndex
CREATE INDEX "Meeting_status_idx" ON "Meeting"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_seriesKey_occurrenceKey_key" ON "Meeting"("seriesKey", "occurrenceKey");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "MeetingInviteEmail" (
    "id" TEXT NOT NULL,
    "seriesKey" TEXT NOT NULL DEFAULT 'producers',
    "email" TEXT NOT NULL,
    "name" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInvitedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingInviteEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSeriesCalendar" (
    "seriesKey" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSeriesCalendar_pkey" PRIMARY KEY ("seriesKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingInviteEmail_seriesKey_email_key" ON "MeetingInviteEmail"("seriesKey", "email");
