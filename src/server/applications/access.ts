import type { PlatformRole } from "@prisma/client";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess, normalizeEmail, PACKAGE_ADVISER_EMAIL, PLATFORM_SUPER_ADMIN_EMAIL } from "@/src/lib/platform-admin";
import { isExecutiveProducer } from "@/src/lib/platform-roles";
import { prisma } from "@/src/lib/prisma";

/**
 * Applicant Portal access. Reviewers (EPs, super admin, adviser) read everything; managers and
 * voters are EPs + super admin only (the adviser views, never votes or edits). Everyone else applies.
 */
export type ApplicationsViewer = {
  userId: string;
  name: string;
  email: string | null;
  role: PlatformRole | null;
  isReviewer: boolean;
  canManage: boolean;
};

export function reviewerRole(role: PlatformRole | null) {
  return role === "EXECUTIVE_PRODUCER" || role === "SUPER_ADMIN" || role === "ADVISER";
}

export async function getApplicationsViewer(): Promise<ApplicationsViewer> {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const { role } = await getPlatformAccess(user.email);
  return {
    userId: user.id,
    name: user.name?.trim() || user.email || "You",
    email: user.email ?? null,
    role,
    isReviewer: reviewerRole(role),
    canManage: isExecutiveProducer(role)
  };
}

export async function requireReviewer() {
  const viewer = await getApplicationsViewer();
  if (!viewer.isReviewer) throw new Error("FORBIDDEN");
  return viewer;
}

export async function requireManager() {
  const viewer = await getApplicationsViewer();
  if (!viewer.canManage) throw new Error("FORBIDDEN");
  return viewer;
}

/** Everyone whose vote counts: executive producers and the super admin (never the adviser). */
export async function listVoters() {
  const assignments = await prisma.platformRoleAssignment.findMany({
    where: { role: { in: ["EXECUTIVE_PRODUCER", "SUPER_ADMIN"] } },
    select: { email: true }
  });
  const emails = new Set(assignments.map((row) => normalizeEmail(row.email)).filter(Boolean));
  if (PLATFORM_SUPER_ADMIN_EMAIL) emails.add(PLATFORM_SUPER_ADMIN_EMAIL);
  // The hardcoded adviser wins over any assignment row, and the adviser never votes.
  if (PACKAGE_ADVISER_EMAIL) emails.delete(PACKAGE_ADVISER_EMAIL);
  if (emails.size === 0) return [];
  const users = await prisma.user.findMany({
    where: { OR: [...emails].map((email) => ({ email: { equals: email, mode: "insensitive" as const } })) },
    select: { id: true, name: true, email: true }
  });
  const seen = new Set<string>();
  return users
    .filter((user) => {
      const email = normalizeEmail(user.email);
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    })
    .map((user) => ({ id: user.id, name: user.name?.trim() || user.email || "Producer" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
