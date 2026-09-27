CREATE TABLE "SocialMediaManager" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialMediaManager_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialMediaManager_userId_key" ON "SocialMediaManager"("userId");
CREATE INDEX "SocialMediaManager_createdAt_idx" ON "SocialMediaManager"("createdAt");

ALTER TABLE "SocialMediaManager" ADD CONSTRAINT "SocialMediaManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
