-- Show manager confirms a filmed show's roles; reminders repeat every 3 hours until then.
CREATE TABLE IF NOT EXISTS "ShowRolesConfirmation" (
    "date" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "lastReminderAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShowRolesConfirmation_pkey" PRIMARY KEY ("date")
);
