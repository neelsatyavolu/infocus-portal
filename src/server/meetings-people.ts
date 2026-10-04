import type { PlatformRole } from "@prisma/client";
import type { MeetingPerson } from "@/src/lib/meetings/types";
import { PACKAGE_ADVISER_EMAIL, PLATFORM_SUPER_ADMIN_EMAIL, normalizeEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";

/** Who counts as a producer or exec for Meetings (role assignments plus the env staff accounts). */

const EXEC_ROLES: PlatformRole[] = ["EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"];

async function usersForRoles(roles?: PlatformRole[]) {
  const assignments = await prisma.platformRoleAssignment.findMany({
    where: roles ? { role: { in: roles } } : {},
    select: { email: true }
  });
  const emails = [
    ...new Set(
      [...assignments.map((entry) => entry.email), PLATFORM_SUPER_ADMIN_EMAIL, PACKAGE_ADVISER_EMAIL]
        .map((email) => normalizeEmail(email))
        .filter(Boolean)
    )
  ];
  if (emails.length === 0) return [];
  return prisma.user.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: { id: true, name: true, nickname: true, email: true }
  });
}

/** Every producer (associate producer and up). */
export async function producerUserIds() {
  return (await usersForRoles()).map((user) => user.id);
}

export async function execUserIds() {
  return (await usersForRoles(EXEC_ROLES)).map((user) => user.id);
}

/** Invitee picker: every producer by display name. */
export async function listMeetingPeople(): Promise<MeetingPerson[]> {
  const users = await usersForRoles();
  return users
    .map((user) => ({ id: user.id, name: userDisplayName(user, "Producer") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function meetingPeopleByIds(ids: string[]): Promise<MeetingPerson[]> {
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, nickname: true, email: true }
  });
  return users
    .map((user) => ({ id: user.id, name: userDisplayName(user, "Producer") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Deduped invitee ids (without the creator); throws unless every one is a producer. */
export async function validateInvitees(ids: string[], creatorId: string) {
  const wanted = [...new Set(ids)].filter((id) => id !== creatorId);
  if (wanted.length === 0) return wanted;
  const producers = new Set(await producerUserIds());
  if (wanted.some((id) => !producers.has(id))) throw new Error("Invitees must be producers.");
  return wanted;
}
