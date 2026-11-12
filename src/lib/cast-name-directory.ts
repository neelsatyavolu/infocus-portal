import { castDisplayNames, nameParts, type NamedPerson } from "@/src/lib/name-sort";

/**
 * Show casts (anchors, PA, crew) are stored as display names, not user ids. This maps between the
 * two the way the dropdowns name people: first name, or the full name when two people share one.
 * A person also matches their full name, in case a cast was saved before a name clash appeared.
 */
export type CastNameDirectory = {
  /** The name a dropdown shows for each user. */
  nameOf: ReadonlyMap<string, string>;
  /** Every name a stored cast entry could use for each user. */
  aliasesOf: ReadonlyMap<string, ReadonlySet<string>>;
};

export function buildCastNameDirectory(users: Array<NamedPerson & { id: string }>): CastNameDirectory {
  const named = users.filter((user) => Boolean(user.nickname?.trim() || user.name?.trim()));
  const names = castDisplayNames(named);
  const nameOf = new Map<string, string>();
  const aliasesOf = new Map<string, Set<string>>();
  named.forEach((user, index) => {
    const display = names[index];
    if (!display) return;
    nameOf.set(user.id, display);
    aliasesOf.set(user.id, new Set([display, nameParts(user).full].filter(Boolean)));
  });
  return { nameOf, aliasesOf };
}

/** Whether a stored cast name refers to this user. */
export function castNameMatchesUser(directory: CastNameDirectory, userId: string, name: string) {
  return directory.aliasesOf.get(userId)?.has(name.trim()) ?? false;
}
