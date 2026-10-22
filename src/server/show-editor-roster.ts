import { isExcludedFromGrading, loadNonGradableEmails } from "@/src/lib/gradable-roster";
import { prisma } from "@/src/lib/prisma";

export const ROSTER_MAX = 300;

/**
 * The class by full name: the gradebook's people (staff left out), sorted and deduped, at most 300.
 * Full names, not nicknames: the brief's anchors are often nicknames already. Never an email.
 */
export function rosterNames(
  users: { name: string | null; email: string | null }[], nonGradableEmails: Set<string>
): string[] {
  const names = users
    .filter((user) => !isExcludedFromGrading(user, nonGradableEmails))
    .map((user) => user.name?.trim() ?? "")
    .filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b)).slice(0, ROSTER_MAX);
}

/** The brief's `roster`, for name bars and for telling who is on air. */
export async function classRoster(): Promise<string[]> {
  const [users, nonGradableEmails] = await Promise.all([
    prisma.user.findMany({ select: { name: true, email: true } }),
    loadNonGradableEmails()
  ]);
  return rosterNames(users, nonGradableEmails);
}
