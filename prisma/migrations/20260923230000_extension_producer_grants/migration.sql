-- Execs can grant an extension directly; a second exec approves, no member agreement.
ALTER TABLE "PackageExtensionRequest" ADD COLUMN "producerGranted" BOOLEAN NOT NULL DEFAULT false;
