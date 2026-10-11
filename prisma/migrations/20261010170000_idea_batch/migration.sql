-- Ideas tab (/ideas): one row per batch of AI story ideas, generated every 2 days.
-- CreateTable
CREATE TABLE "IdeaBatch" (
    "id" TEXT NOT NULL,
    "runDate" TEXT NOT NULL,
    "ideas" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdeaBatch_runDate_key" ON "IdeaBatch"("runDate");
