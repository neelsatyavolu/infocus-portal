import { normalizeEmail, PACKAGE_ADVISER_EMAIL } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

export const ROSTER_MAX = 300;

/**
 * The class by full name: every Portal user except the advisers, sorted and deduped, at most 300. Executive
 * producers stay in (unlike the gradebook): they're students and anchor. Full names, not nicknames: the
 * brief's anchors are often nicknames already. Never an email.
 */
export function rosterNames(
  users: { name: string | null; email: string | null }[], adviserEmails: Set<string>
): string[] {
  const names = users
    .filter((user) => !adviserEmails.has(normalizeEmail(user.email)))
    .map((user) => user.name?.trim() ?? "")
    .filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b)).slice(0, ROSTER_MAX);
}

async function loadAdviserEmails(): Promise<Set<string>> {
  const advisers = await prisma.platformRoleAssignment.findMany({ where: { role: "ADVISER" }, select: { email: true } });
  return new Set([...advisers.map((entry) => entry.email), PACKAGE_ADVISER_EMAIL].map(normalizeEmail).filter(Boolean));
}

/** The brief's `roster`, for name bars and for telling who is on air. */
export async function classRoster(): Promise<string[]> {
  const [users, adviserEmails] = await Promise.all([
    prisma.user.findMany({ select: { name: true, email: true } }),
    loadAdviserEmails()
  ]);
  return rosterNames(users, adviserEmails);
}
