import { z } from "zod";
import { jsonEqual } from "@/src/lib/json-equal";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Show dates are YYYY-MM-DD.");

const showContentSchema = z.object({
  assignments: z.record(z.string(), z.string()).default({}),
  anchors: z
    .array(z.string())
    .default([])
    .transform((anchors) => anchors.filter((name) => name.length > 0).slice(0, 2)),
  confirmed: z.record(z.string(), z.boolean()).default({})
});

/**
 * A Show Roles save sends only what the tab changed: the shows it edited, the dates it removed, and
 * for each of those dates what it last loaded (`base`, null for a show it was adding). The server
 * refuses the save when the stored show no longer matches that base, so a stale tab can't
 * overwrite or delete someone else's work, and shows the tab never mentioned are left alone.
 */
export const showRolesSaveSchema = z
  .object({
    shows: z.array(showContentSchema.extend({ date: dateKey })).max(400),
    base: z.record(dateKey, showContentSchema.nullable()),
    deletedDates: z.array(dateKey).max(400).default([])
  })
  .superRefine((value, ctx) => {
    const dates = [...value.shows.map((show) => show.date), ...value.deletedDates];
    for (const date of dates) {
      if (!Object.prototype.hasOwnProperty.call(value.base, date)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Missing base for ${date}.` });
      }
    }
  });

export type ShowRolesSave = z.infer<typeof showRolesSaveSchema>;
export type ShowContent = z.infer<typeof showContentSchema>;
export type ShowState = ShowContent & { date: string };
type StoredShow = { date: string; assignments: unknown; anchors: unknown; confirmed: unknown };

export function sameShowContent(left: Omit<StoredShow, "date"> | null | undefined, right: ShowContent | null | undefined) {
  if (!left || !right) return !left && !right;
  return (
    jsonEqual(left.assignments, right.assignments) &&
    jsonEqual(left.anchors, right.anchors) &&
    jsonEqual(left.confirmed, right.confirmed)
  );
}

/**
 * Decides what a save writes and deletes against what is stored now. A date conflicts when its
 * stored show differs from the client's base, unless the stored show already equals what the
 * client wants (nothing to write). A repeated date in `shows` keeps the last copy.
 */
export function planShowRolesSave(save: ShowRolesSave, stored: StoredShow[]) {
  const storedByDate = new Map(stored.map((record) => [record.date, record]));
  const showsByDate = new Map(save.shows.map((show) => [show.date, show]));
  const conflicts: string[] = [];
  const writes: ShowState[] = [];
  const deletes: string[] = [];

  for (const show of showsByDate.values()) {
    const current = storedByDate.get(show.date);
    if (current && sameShowContent(current, show)) continue;
    if (!sameShowContent(current, save.base[show.date])) {
      conflicts.push(show.date);
      continue;
    }
    writes.push(show);
  }

  for (const date of new Set(save.deletedDates)) {
    if (showsByDate.has(date)) continue;
    const current = storedByDate.get(date);
    if (!current) continue;
    if (!sameShowContent(current, save.base[date])) {
      conflicts.push(date);
      continue;
    }
    deletes.push(date);
  }

  return { conflicts: conflicts.sort(), writes, deletes };
}

export class ShowRolesConflictError extends Error {
  constructor(readonly dates: string[]) {
    super("Someone else changed this — reload to see their changes.");
    this.name = "ShowRolesConflictError";
  }
}

/** The names a tab toggled since it loaded. Strict, so the old `{ nonAnchors }` replace-all body is refused. */
export const nonAnchorsSaveSchema = z
  .object({
    add: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
    remove: z.array(z.string().trim().min(1).max(120)).max(200).default([])
  })
  .strict();
