import { PACKAGE_ADVISER_EMAIL, PLATFORM_SUPER_ADMIN_EMAIL, normalizeEmail } from "@/src/lib/platform-admin";
import { castDisplayNames, type NamedPerson } from "@/src/lib/name-sort";

export function buildCastPool(
  users: NamedPerson[],
  dropdownBlockedEmails: Iterable<string | null>,
  randomBlockedEmails: Iterable<string | null>,
  options?: { excludeNames?: boolean }
) {
  // excludeNames hides the adviser from the dropdown (matched by configured email).
  const hideAdviser = options?.excludeNames !== false;
  const dropdownBlocked = new Set(
    [...dropdownBlockedEmails, PLATFORM_SUPER_ADMIN_EMAIL, hideAdviser ? PACKAGE_ADVISER_EMAIL : null]
      .map(normalizeEmail)
      .filter(Boolean)
  );
  const randomBlocked = new Set([...randomBlockedEmails].map(normalizeEmail).filter(Boolean));

  const dropdownUsers = users.filter((user) => {
    const email = normalizeEmail(user.email);
    return !(email && dropdownBlocked.has(email));
  });

  const named = dropdownUsers.filter((user) => Boolean(user.nickname?.trim() || user.name?.trim()));
  const displayNames = castDisplayNames(named);
  const randomExempt: string[] = [];
  named.forEach((user, index) => {
    const email = normalizeEmail(user.email);
    if (email && randomBlocked.has(email)) {
      randomExempt.push(displayNames[index] ?? "");
    }
  });

  return {
    members: [...displayNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    randomExempt: randomExempt.filter(Boolean)
  };
}
