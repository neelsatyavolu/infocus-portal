import type { PlatformRole } from "@prisma/client";

// Pure role checks with no database or env access, so client components can
// import them without pulling Prisma into the browser bundle.
// Server code may keep importing these from platform-admin, which re-exports them.

// ADVISER is a de facto super admin for platform administration (roles, View as,
// danger zone) but a distinct approval-chain role: stage 2 only, never stage 3.
const platformRoleWeight: Record<PlatformRole, number> = {
  ASSOCIATE_PRODUCER: 1,
  ADVISER: 2,
  EXECUTIVE_PRODUCER: 2,
  SUPER_ADMIN: 3
};

/** Role assignment, View as, and admin danger zone. Not stage 3. */
export function isPlatformSuperAdmin(role: PlatformRole | null) {
  return role === "SUPER_ADMIN" || role === "ADVISER";
}

export function hasPlatformRole(role: PlatformRole | null, minimum: PlatformRole) {
  if (!role) {
    return false;
  }

  return platformRoleWeight[role] >= platformRoleWeight[minimum];
}

/** Student gradebook (`/grades`). Hidden for EP, adviser, and super admin. */
export function seesStudentGrades(role: PlatformRole | null) {
  return !hasPlatformRole(role, "EXECUTIVE_PRODUCER");
}

export function isExecutiveProducer(role: PlatformRole | null) {
  return role === "EXECUTIVE_PRODUCER" || role === "SUPER_ADMIN";
}

export function isAdviser(role: PlatformRole | null) {
  return role === "ADVISER";
}

/** Package Cycle roster chart: executives/adviser/super-admin only. Associates view. */
export function canEditPackageCycle(role: PlatformRole | null) {
  return hasPlatformRole(role, "EXECUTIVE_PRODUCER");
}

export function buildPlatformAccess(role: PlatformRole | null) {
  return {
    role,
    canManageWorkspaces: hasPlatformRole(role, "ASSOCIATE_PRODUCER"),
    /** @deprecated alias — manage people/accounts, not a separate allowlist */
    canManageAllowedEmails: hasPlatformRole(role, "EXECUTIVE_PRODUCER"),
    canManageAccounts: hasPlatformRole(role, "EXECUTIVE_PRODUCER"),
    canManagePlatformRoles: isPlatformSuperAdmin(role),
    isExecutiveProducer: isExecutiveProducer(role),
    isAdviser: isAdviser(role)
  };
}
