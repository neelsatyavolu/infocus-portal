-- Meetings: 15/5-minute push reminders, one-off calendar invites, invite list linked to producers,
-- and the series title "InFocus Producer Meeting". Additive only.
-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "calendarSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reminder15SentAt" TIMESTAMP(3),
ADD COLUMN     "reminder5SentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MeetingInviteEmail" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MeetingInviteEmail_seriesKey_userId_key" ON "MeetingInviteEmail"("seriesKey", "userId");

-- Data: rename the recurring series (existing and future rows use the new title).
UPDATE "Meeting" SET "title" = 'InFocus Producer Meeting' WHERE "seriesKey" = 'producers';
