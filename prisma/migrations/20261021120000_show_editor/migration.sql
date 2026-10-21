-- Automatic show editing (infocus-editor):
-- ShowEditJob: the edit queue the editing machines poll. ShowEditorDevice: linked machines (exactly one active)
-- and their heartbeat state. ShowEditorLink: device-code linking. ShowEditorPairing: one-time "Connect AI
-- account" codes (only the code's hash and a sealed sign-in are stored). ShowEditorSettings: one row of
-- producer settings. ShowEditorCommand: remote commands for a machine.

CREATE TABLE IF NOT EXISTS "ShowEditJob" (
    "id" TEXT NOT NULL,
    "showDate" TEXT NOT NULL,
    "sourcePaths" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT,
    "message" TEXT,
    "note" TEXT,
    "outputNasPath" TEXT,
    "posterNasPath" TEXT,
    "decisions" JSONB,
    "checks" JSONB,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "costUsd" DOUBLE PRECISION,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "pendingFix" TEXT,
    "rememberFix" BOOLEAN NOT NULL DEFAULT false,
    "agentSessionId" TEXT,
    "conversation" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deviceId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowEditJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShowEditorPairing" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "backend" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "ciphertext" TEXT,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "ackOk" BOOLEAN,
    "ackError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowEditorPairing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShowEditorLink" (
    "id" TEXT NOT NULL,
    "deviceCodeHash" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedById" TEXT,
    "token" TEXT,
    "deniedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowEditorLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShowEditorDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'dedicated',
    "tokenHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "linkedById" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "version" TEXT,
    "busy" BOOLEAN NOT NULL DEFAULT false,
    "health" JSONB,
    "backends" JSONB,
    "publicKey" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ShowEditorDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShowEditorSettings" (
    "id" TEXT NOT NULL DEFAULT 'editor',
    "autoStart" BOOLEAN,
    "autoPublish" BOOLEAN,
    "targetVersion" TEXT,
    "agentOrder" JSONB,
    "houseRules" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastAutoStartCheckAt" TIMESTAMP(3),

    CONSTRAINT "ShowEditorSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShowEditorCommand" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ok" BOOLEAN,
    "output" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ShowEditorCommand_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShowEditJob_status_idx" ON "ShowEditJob"("status");

CREATE INDEX IF NOT EXISTS "ShowEditJob_showDate_idx" ON "ShowEditJob"("showDate");

CREATE INDEX IF NOT EXISTS "ShowEditJob_deviceId_idx" ON "ShowEditJob"("deviceId");

CREATE UNIQUE INDEX IF NOT EXISTS "ShowEditorPairing_codeHash_key" ON "ShowEditorPairing"("codeHash");

CREATE INDEX IF NOT EXISTS "ShowEditorPairing_createdAt_idx" ON "ShowEditorPairing"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ShowEditorLink_deviceCodeHash_key" ON "ShowEditorLink"("deviceCodeHash");

CREATE UNIQUE INDEX IF NOT EXISTS "ShowEditorLink_userCode_key" ON "ShowEditorLink"("userCode");

CREATE UNIQUE INDEX IF NOT EXISTS "ShowEditorDevice_tokenHash_key" ON "ShowEditorDevice"("tokenHash");

CREATE INDEX IF NOT EXISTS "ShowEditorDevice_revokedAt_idx" ON "ShowEditorDevice"("revokedAt");

CREATE INDEX IF NOT EXISTS "ShowEditorDevice_active_idx" ON "ShowEditorDevice"("active");

CREATE INDEX IF NOT EXISTS "ShowEditorCommand_deviceId_status_idx" ON "ShowEditorCommand"("deviceId", "status");

CREATE INDEX IF NOT EXISTS "ShowEditorCommand_createdAt_idx" ON "ShowEditorCommand"("createdAt");
