-- Automatic editing: a publish time picked with the instructions (null = the usual 8:30 AM on show day).
ALTER TABLE "ShowEditJob" ADD COLUMN IF NOT EXISTS "publishAt" TIMESTAMP(3);
