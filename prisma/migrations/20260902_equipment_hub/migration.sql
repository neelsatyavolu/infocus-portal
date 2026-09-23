-- Extra equipment managers (producers appoint them). Not a PlatformRole.
-- Archive inventory items; timestamp last overdue reminder (keep lateReminderSent).

ALTER TABLE "equipment_items" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "equipment_items_archivedAt_idx"
  ON "equipment_items"("archivedAt");

ALTER TABLE "equipment_checkouts" ADD COLUMN IF NOT EXISTS "lastLateReminderAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "equipment_managers" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "equipment_managers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "equipment_managers_userId_key"
  ON "equipment_managers"("userId");
CREATE INDEX IF NOT EXISTS "equipment_managers_createdAt_idx"
  ON "equipment_managers"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_managers_userId_fkey'
  ) THEN
    ALTER TABLE "equipment_managers"
      ADD CONSTRAINT "equipment_managers_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
