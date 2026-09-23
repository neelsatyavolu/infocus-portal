import { PACKAGE_ADVISER_EMAIL, PLATFORM_SUPER_ADMIN_EMAIL, normalizeEmail } from "@/src/lib/platform-admin";
import { castDisplayNames, sortNamedPeople, type NamedPerson } from "@/src/lib/name-sort";
import { listShowDatesThrough, type ScheduleOverrideMap } from "@/src/lib/show-assignment";

export const SHOW_MANAGER_ROLES = ["ASSOCIATE_PRODUCER", "EXECUTIVE_PRODUCER", "SUPER_ADMIN"] as const;

export type ShowManagerSource = "rotation" | "manual";

export type ShowManagerAssignment = {
  name: string;
  source: ShowManagerSource;
};

export function buildShowManagerPool(
  users: NamedPerson[],
  roleEmails: Iterable<string | null | undefined>,
  extraEmails: Iterable<string | null | undefined> = [PLATFORM_SUPER_ADMIN_EMAIL]
) {
  const eligible = new Set(
    [...roleEmails, ...extraEmails].map((email) => normalizeEmail(email)).filter(Boolean)
  );
  eligible.delete(normalizeEmail(PACKAGE_ADVISER_EMAIL));

  const people = users.filter((user) => {
    const email = normalizeEmail(user.email);
    return Boolean(email && eligible.has(email));
  });

  return castDisplayNames(sortNamedPeople(people, "firstName"));
}

export function rotatedShowManager(pool: readonly string[], showIndex: number) {
  if (pool.length === 0 || showIndex < 0) {
    return "";
  }
  return pool[showIndex % pool.length] ?? "";
}

/** Next person in the pool after `previousName`. Unknown/empty previous starts at the first name. */
export function nextRotatedShowManager(pool: readonly string[], previousName: string) {
  if (pool.length === 0) {
    return "";
  }
  const previousIndex = pool.findIndex((name) => name === previousName);
  if (previousIndex < 0) {
    return pool[0] ?? "";
  }
  return pool[(previousIndex + 1) % pool.length] ?? "";
}

export function resolveShowManager(input: {
  dateKey: string;
  pool: readonly string[];
  override?: string | null;
  showDates: readonly string[];
}): ShowManagerAssignment {
  const override = input.override?.trim() ?? "";
  const overridesByDate = new Map<string, string>();
  if (override) {
    overridesByDate.set(input.dateKey, override);
  }
  const endKey = input.showDates.reduce((latest, dateKey) => (dateKey > latest ? dateKey : latest), input.dateKey);
  return (
    resolveShowManagersForDates({
      dateKeys: [input.dateKey],
      pool: input.pool,
      overridesByDate,
      endKey
    })[input.dateKey] ?? { name: "", source: "rotation" }
  );
}

export function resolveShowManagersForDates(input: {
  dateKeys: readonly string[];
  pool: readonly string[];
  overridesByDate: ReadonlyMap<string, string>;
  scheduleOverrides?: ScheduleOverrideMap | null;
  endKey?: string;
}) {
  const requestedEnd = input.dateKeys.reduce((latest, dateKey) => (dateKey > latest ? dateKey : latest), "");
  const endKey = [requestedEnd, input.endKey ?? ""].reduce((latest, dateKey) =>
    dateKey > latest ? dateKey : latest
  );
  const showDates = endKey ? listShowDatesThrough(endKey, input.scheduleOverrides) : [];
  const requested = new Set(input.dateKeys);
  const result: Record<string, ShowManagerAssignment> = {};
  let previousName = "";
  for (const dateKey of showDates) {
    const override = input.overridesByDate.get(dateKey)?.trim() ?? "";
    const assignment: ShowManagerAssignment = override
      ? { name: override, source: "manual" }
      : { name: nextRotatedShowManager(input.pool, previousName), source: "rotation" };
    if (requested.has(dateKey)) {
      result[dateKey] = assignment;
    }
    if (assignment.name) {
      previousName = assignment.name;
    }
  }
  return result;
}
