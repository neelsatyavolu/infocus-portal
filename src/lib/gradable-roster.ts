import { PACKAGE_ADVISER_EMAIL, PLATFORM_SUPER_ADMIN_EMAIL, normalizeEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

/** Staff roles that never appear in the gradebook or participation roster. */
export const NON_GRADABLE_PLATFORM_ROLES = ["ADVISER", "EXECUTIVE_PRODUCER", "SUPER_ADMIN"] as const;

export function emailsFromNonGradableAssignments(assignments: Array<{ email: string | null }>) {
  const emails = new Set(assignments.map((entry) => normalizeEmail(entry.email)).filter(Boolean));
  for (const email of [PLATFORM_SUPER_ADMIN_EMAIL, PACKAGE_ADVISER_EMAIL]) {
    if (email) emails.add(email);
  }
  return emails;
}

export function isExcludedFromGrading(
  user: { name: string | null; email?: string | null },
  nonGradableEmails: Set<string>
) {
  const email = normalizeEmail(user.email);
  return Boolean(email && nonGradableEmails.has(email));
}

export async function loadNonGradableEmails(): Promise<Set<string>> {
  const assignments = await prisma.platformRoleAssignment.findMany({
    where: { role: { in: [...NON_GRADABLE_PLATFORM_ROLES] } },
    select: { email: true }
  });
  return emailsFromNonGradableAssignments(assignments);
}
