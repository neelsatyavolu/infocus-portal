-- Producers can grant custom days and a subset of the package group.
ALTER TABLE "PackageExtensionRequest" ADD COLUMN "grantedDays" INTEGER;
ALTER TABLE "PackageExtensionRequest" ADD COLUMN "grantedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
