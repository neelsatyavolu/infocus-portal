-- Foreign-key indexes: media access checks look up PackageStageMedia by media item, and these
-- columns are scanned when a user, folder, media item, or comment is deleted (cascade / set null).
CREATE INDEX IF NOT EXISTS "PackageStageMedia_mediaItemId_idx" ON "PackageStageMedia"("mediaItemId");

CREATE INDEX IF NOT EXISTS "ReviewComment_authorId_idx" ON "ReviewComment"("authorId");
CREATE INDEX IF NOT EXISTS "ReviewComment_resolvedById_idx" ON "ReviewComment"("resolvedById");
CREATE INDEX IF NOT EXISTS "CommentMention_userId_idx" ON "CommentMention"("userId");
CREATE INDEX IF NOT EXISTS "ApprovalEvent_changedById_idx" ON "ApprovalEvent"("changedById");
CREATE INDEX IF NOT EXISTS "MediaVersion_createdById_idx" ON "MediaVersion"("createdById");
CREATE INDEX IF NOT EXISTS "MediaItem_folderId_idx" ON "MediaItem"("folderId");
