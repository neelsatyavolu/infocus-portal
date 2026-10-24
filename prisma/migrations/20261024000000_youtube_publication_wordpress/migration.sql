-- Packages post themselves to infocusnews.tv (WordPress) after their YouTube upload.
ALTER TABLE "YoutubePublication" ADD COLUMN IF NOT EXISTS "wordpressStatus" TEXT;
ALTER TABLE "YoutubePublication" ADD COLUMN IF NOT EXISTS "wordpressPostId" INTEGER;
ALTER TABLE "YoutubePublication" ADD COLUMN IF NOT EXISTS "wordpressMediaId" INTEGER;
ALTER TABLE "YoutubePublication" ADD COLUMN IF NOT EXISTS "wordpressCategoryId" INTEGER;
ALTER TABLE "YoutubePublication" ADD COLUMN IF NOT EXISTS "wordpressUrl" TEXT;
ALTER TABLE "YoutubePublication" ADD COLUMN IF NOT EXISTS "wordpressAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "YoutubePublication" ADD COLUMN IF NOT EXISTS "wordpressError" TEXT;
