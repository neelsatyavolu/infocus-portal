import { cache } from "react";
import { type PlatformRole } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { buildPlatformAccess } from "@/src/lib/platform-roles";

// Pure role helpers live in platform-roles (client-safe); re-exported for server callers.
export {
  buildPlatformAccess,
  canEditPackageCycle,
  hasPlatformRole,
  isAdviser,
  isExecutiveProducer,
  isPlatformSuperAdmin,
  seesStudentGrades
} from "@/src/lib/platform-roles";

// Staff identities come from env so no real addresses live in source.
// Unset means nobody holds the hardcoded role (PlatformRoleAssignment still applies).
export const PLATFORM_SUPER_ADMIN_EMAIL = normalizeEmail(process.env.PLATFORM_SUPER_ADMIN_EMAIL) || null;
export const PACKAGE_ADVISER_EMAIL = normalizeEmail(process.env.PACKAGE_ADVISER_EMAIL) || null;

export function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

export function isPlatformAdminEmail(email?: string | null) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }
  return (
    normalizedEmail === PLATFORM_SUPER_ADMIN_EMAIL || normalizedEmail === PACKAGE_ADVISER_EMAIL
  );
}

/** Hardcoded staff emails that always win over PlatformRoleAssignment. */
export function hardcodedPlatformRole(email?: string | null): PlatformRole | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }
  if (normalizedEmail === PLATFORM_SUPER_ADMIN_EMAIL) {
    return "SUPER_ADMIN";
  }
  if (normalizedEmail === PACKAGE_ADVISER_EMAIL) {
    return "ADVISER";
  }
  return null;
}

// Request-scoped memo (React cache): looked up by the layout and again by pages.
export const getPlatformRoleForEmail = cache(
  async (email?: string | null): Promise<PlatformRole | null> => {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return null;
    }

    const hardcoded = hardcodedPlatformRole(normalizedEmail);
    if (hardcoded) {
      return hardcoded;
    }

    const assignment = await prisma.platformRoleAssignment.findUnique({
      where: { email: normalizedEmail },
      select: { role: true }
    });

    return assignment?.role ?? null;
  }
);

export async function getPlatformAccess(email?: string | null) {
  return buildPlatformAccess(await getPlatformRoleForEmail(email));
}

/**
 * Sign-in is allowed only for provisioned User accounts (email + name added by
 * an admin) or the hardcoded super-admin / adviser emails. Platform role alone
 * is not enough.
 */
export const isEmailAllowedToUsePlatform = cache(async (email?: string | null) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return false;
  }

  if (hardcodedPlatformRole(normalizedEmail)) {
    return true;
  }

  const user = await prisma.user.findFirst({
    where: { email: normalizedEmail },
    select: { id: true }
  });

  if (user) {
    return true;
  }

  // One-time bridge: legacy allowlist / role assignment still grants access
  // until accounts are migrated into User rows.
  const [assignment, allowlisted] = await Promise.all([
    prisma.platformRoleAssignment.findUnique({
      where: { email: normalizedEmail },
      select: { id: true }
    }),
    prisma.allowedSignupEmail.findUnique({
      where: { email: normalizedEmail },
      select: { id: true }
    })
  ]);

  return Boolean(assignment || allowlisted);
});
