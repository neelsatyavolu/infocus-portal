-- An executive can reopen a group's Final Cut for one more upload.
ALTER TABLE "PackageProgressRow" ADD COLUMN IF NOT EXISTS "finalCutResubmitAllowed" BOOLEAN NOT NULL DEFAULT false;
