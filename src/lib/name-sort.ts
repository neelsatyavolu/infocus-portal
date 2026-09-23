export type NamedPerson = {
  name: string | null;
  nickname?: string | null;
  email: string | null;
};

export type NameSortKey = "lastName" | "firstName" | "email";

export function nameParts(person: NamedPerson) {
  const display = person.nickname?.trim() || person.name?.trim() || person.email?.trim() || "";
  const parts = display.split(/\s+/).filter(Boolean);
  return {
    first: parts[0] ?? "",
    last: parts[parts.length - 1] ?? "",
    email: person.email?.trim() ?? "",
    full: display
  };
}

export function compareNamedPeople(a: NamedPerson, b: NamedPerson, sortBy: NameSortKey) {
  const aParts = nameParts(a);
  const bParts = nameParts(b);
  const aKey = sortBy === "lastName" ? aParts.last : sortBy === "firstName" ? aParts.first : aParts.email;
  const bKey = sortBy === "lastName" ? bParts.last : sortBy === "firstName" ? bParts.first : bParts.email;
  const primary = aKey.localeCompare(bKey, undefined, { sensitivity: "base" });
  if (primary !== 0) return primary;
  const full = aParts.full.localeCompare(bParts.full, undefined, { sensitivity: "base" });
  if (full !== 0) return full;
  return aParts.email.localeCompare(bParts.email, undefined, { sensitivity: "base" });
}

export function sortNamedPeople<T extends NamedPerson>(people: T[], sortBy: NameSortKey) {
  return [...people].sort((a, b) => compareNamedPeople(a, b, sortBy));
}

/** First names for unique people; full name when two people share a first name. */
export function castDisplayNames(people: NamedPerson[]) {
  const parts = people
    .filter((person) => Boolean(person.nickname?.trim() || person.name?.trim()))
    .map((person) => nameParts(person))
    .filter((person) => person.first.length > 0);
  const firstCounts = new Map<string, number>();
  for (const person of parts) {
    const key = person.first.toLowerCase();
    firstCounts.set(key, (firstCounts.get(key) ?? 0) + 1);
  }
  return parts.map((person) =>
    (firstCounts.get(person.first.toLowerCase()) ?? 0) > 1 ? person.full : person.first
  );
}
