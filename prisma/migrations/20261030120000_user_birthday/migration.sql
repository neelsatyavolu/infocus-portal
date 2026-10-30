-- Settings → Profile birthday (month and day only), shown on the Master Calendar.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthdayMonth" SMALLINT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthdayDay" SMALLINT;
