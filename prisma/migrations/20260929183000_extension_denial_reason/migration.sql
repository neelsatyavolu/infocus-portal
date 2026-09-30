-- Why a producer denied an extension request. Required on new denials.
ALTER TABLE "PackageExtensionApproval" ADD COLUMN IF NOT EXISTS "reason" TEXT NOT NULL DEFAULT '';
