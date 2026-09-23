export type DisplayNamedPerson = {
  name?: string | null;
  nickname?: string | null;
  email?: string | null;
};

export const NICKNAME_MAX_LENGTH = 60;

export function normalizeNickname(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, NICKNAME_MAX_LENGTH) : null;
}

export function userDisplayName(person: DisplayNamedPerson, fallback = "") {
  return person.nickname?.trim() || person.name?.trim() || person.email?.trim() || fallback;
}

/** Flatten a user for roster chips, producers, comments, and emails. */
export function labeledUser(person: DisplayNamedPerson): { name: string | null; email: string | null } {
  return {
    name: userDisplayName(person) || person.name || null,
    email: person.email ?? null
  };
}

function isWalkableObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null || "displayName" in value || "nickname" in value;
}

/** Prefer a saved nickname anywhere a user identity object is serialized. */
export function applyUserDisplayNames<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => applyUserDisplayNames(entry)) as T;
  }

  if (!isWalkableObject(value)) {
    return value;
  }

  const mapped: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    mapped[key] = applyUserDisplayNames(child);
  }

  const name = typeof mapped.name === "string" ? mapped.name : null;
  if (typeof mapped.displayName === "string" && mapped.displayName.trim()) {
    mapped.name = mapped.displayName.trim();
  } else if ("nickname" in mapped && "name" in mapped) {
    const nickname = typeof mapped.nickname === "string" ? mapped.nickname : null;
    const email = typeof mapped.email === "string" ? mapped.email : null;
    mapped.name = userDisplayName({ nickname, name, email }) || name;
  }

  return mapped as T;
}
