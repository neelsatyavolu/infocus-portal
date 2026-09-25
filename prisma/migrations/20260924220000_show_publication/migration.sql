-- CreateTable
CREATE TABLE "ShowPublication" (
    "id" TEXT NOT NULL,
    "showDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "nasPath" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "publishAt" TIMESTAMP(3) NOT NULL,
    "seasonNumber" INTEGER,
    "semesterLabel" TEXT,
    "playlistId" TEXT,
    "channelId" TEXT,
    "sourceSize" BIGINT,
    "uploadSessionUrl" TEXT,
    "videoId" TEXT,
    "thumbnailSetAt" TIMESTAMP(3),
    "playlistAddedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShowPublication_showDate_key" ON "ShowPublication"("showDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShowPublication_videoId_key" ON "ShowPublication"("videoId");

-- CreateIndex
CREATE INDEX "ShowPublication_status_idx" ON "ShowPublication"("status");

