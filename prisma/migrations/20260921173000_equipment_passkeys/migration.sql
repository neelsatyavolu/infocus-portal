CREATE TABLE "EquipmentPasskey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "publicKey" BYTEA NOT NULL,
  "counter" BIGINT NOT NULL DEFAULT 0,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "EquipmentPasskey_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EquipmentPasskey_userId_idx" ON "EquipmentPasskey"("userId");
ALTER TABLE "EquipmentPasskey" ADD CONSTRAINT "EquipmentPasskey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "EquipmentPasskeyChallenge" (
  "id" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "userId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EquipmentPasskeyChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EquipmentPasskeyChallenge_expiresAt_idx" ON "EquipmentPasskeyChallenge"("expiresAt");
