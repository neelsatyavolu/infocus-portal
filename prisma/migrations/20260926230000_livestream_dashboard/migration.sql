ALTER TABLE "ProgramSetting" ADD COLUMN "livestreamPinCipher" TEXT,
ADD COLUMN "livestreamPinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "livestreamPinFailureAt" TIMESTAMP(3);

CREATE TABLE "LivestreamGraphics" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "overlayKey" TEXT NOT NULL,
    "scoreboard" JSONB,
    "liveImage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LivestreamGraphics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LivestreamGraphics_eventId_key" ON "LivestreamGraphics"("eventId");
CREATE UNIQUE INDEX "LivestreamGraphics_overlayKey_key" ON "LivestreamGraphics"("overlayKey");

ALTER TABLE "LivestreamGraphics" ADD CONSTRAINT "LivestreamGraphics_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "LivestreamEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
