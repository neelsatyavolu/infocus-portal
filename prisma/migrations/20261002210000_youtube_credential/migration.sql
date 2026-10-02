-- Admin → Reconnect YouTube: the channel's encrypted refresh token.
-- CreateTable
CREATE TABLE "YoutubeCredential" (
    "id" TEXT NOT NULL DEFAULT 'channel',
    "refreshToken" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "connectedByUserId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YoutubeCredential_pkey" PRIMARY KEY ("id")
);
