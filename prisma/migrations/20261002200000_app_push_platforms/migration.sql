-- InFocus Portal for iPhone: which app a Portal push device belongs to.
-- AlterTable
ALTER TABLE "NativePushDevice" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'macos';

-- Public InFocus news app: anonymous alert subscriptions.
-- CreateTable
CREATE TABLE "NewsPushDevice" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "shows" BOOLEAN NOT NULL DEFAULT true,
    "stories" BOOLEAN NOT NULL DEFAULT true,
    "live" BOOLEAN NOT NULL DEFAULT true,
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsPushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsFeedState" (
    "feed" TEXT NOT NULL,
    "lastId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsFeedState_pkey" PRIMARY KEY ("feed")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsPushDevice_token_key" ON "NewsPushDevice"("token");
