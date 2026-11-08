-- Pin the Final Cut version a producer queued, so YouTube publishes what was queued.
ALTER TABLE "PackageProgressRow" ADD COLUMN IF NOT EXISTS "queuedMediaVersionId" TEXT;
