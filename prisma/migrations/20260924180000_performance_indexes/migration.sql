-- Performance indexes: email lookups during sign-in, the dashboard's own-activity list,
-- and the foreign keys that cascade when media, versions, or comments are deleted.
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");

CREATE INDEX IF NOT EXISTS "ActivityEvent_actorId_createdAt_idx" ON "ActivityEvent"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityEvent_mediaItemId_idx" ON "ActivityEvent"("mediaItemId");
CREATE INDEX IF NOT EXISTS "ActivityEvent_mediaVersionId_idx" ON "ActivityEvent"("mediaVersionId");
CREATE INDEX IF NOT EXISTS "ActivityEvent_commentId_idx" ON "ActivityEvent"("commentId");

CREATE INDEX IF NOT EXISTS "AuditLog_mediaItemId_idx" ON "AuditLog"("mediaItemId");
CREATE INDEX IF NOT EXISTS "AuditLog_mediaVersionId_idx" ON "AuditLog"("mediaVersionId");
CREATE INDEX IF NOT EXISTS "AuditLog_commentId_idx" ON "AuditLog"("commentId");
