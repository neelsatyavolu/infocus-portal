-- Meetings calendar invites move to Google Calendar (Admin → Connect Google Calendar). Additive only.
-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "googleEventId" TEXT;

-- AlterTable
ALTER TABLE "MeetingSeriesCalendar" ADD COLUMN     "googleEventId" TEXT,
ADD COLUMN     "lastSyncError" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GoogleCalendarCredential" (
    "id" TEXT NOT NULL DEFAULT 'calendar',
    "refreshToken" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "connectedByUserId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarCredential_pkey" PRIMARY KEY ("id")
);
