CREATE TABLE "VaultEntry" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT,
  "usernameCipher" TEXT,
  "passwordCipher" TEXT,
  "totpCipher" TEXT,
  "notesCipher" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VaultEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VaultEntry_name_idx" ON "VaultEntry"("name");
CREATE TABLE "VaultAccessLog" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "entryName" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VaultAccessLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VaultAccessLog_entryId_createdAt_idx" ON "VaultAccessLog"("entryId", "createdAt");
