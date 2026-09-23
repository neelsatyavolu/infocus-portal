-- CreateTable
CREATE TABLE "PublishingManager" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishingManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubePublication" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADING',
    "title" TEXT NOT NULL,
    "showDate" TEXT NOT NULL,
    "mediaVersionId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sourceSize" BIGINT,
    "uploadSessionUrl" TEXT,
    "videoId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YoutubePublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubePublicationEmail" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "firstAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "YoutubePublicationEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublishingManager_userId_key" ON "PublishingManager"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "YoutubePublication_rowId_key" ON "YoutubePublication"("rowId");

-- CreateIndex
CREATE UNIQUE INDEX "YoutubePublication_videoId_key" ON "YoutubePublication"("videoId");

-- CreateIndex
CREATE INDEX "YoutubePublication_status_idx" ON "YoutubePublication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "YoutubePublicationEmail_publicationId_recipient_key" ON "YoutubePublicationEmail"("publicationId", "recipient");

-- AddForeignKey
ALTER TABLE "PublishingManager" ADD CONSTRAINT "PublishingManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YoutubePublication" ADD CONSTRAINT "YoutubePublication_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "PackageProgressRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YoutubePublicationEmail" ADD CONSTRAINT "YoutubePublicationEmail_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "YoutubePublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-only tables: no direct Supabase Data API access, especially upload sessions.
ALTER TABLE "PublishingManager" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "YoutubePublication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "YoutubePublicationEmail" ENABLE ROW LEVEL SECURITY;
