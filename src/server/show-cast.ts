import sanitizeHtml from "sanitize-html";
import { prisma } from "@/src/lib/prisma";
import {
  extractCalendarAnchors,
  extractCalendarPaAnnouncers,
  extractCalendarShowManager,
  setCalendarAnchors,
  setCalendarPaAnnouncers,
  setCalendarShowManager,
  wipeCalendarAnchorNames
} from "@/src/lib/calendar-show-content";
import { buildCastPool } from "@/src/lib/cast-pool";
import { PACKAGE_ADVISER_EMAIL } from "@/src/lib/platform-admin";
import { resolveScheduleDay } from "@/src/lib/school-schedule";
import {
  mondayDateKey,
  monthKeyFromDateKey,
  precedingPaDateKey
} from "@/src/lib/show-assignment";
import { markMasterCalendarEdited } from "@/src/server/master-calendar-sync";
import { resolveShowManagers } from "@/src/server/show-manager";
import { loadScheduleOverrides } from "@/src/server/show-schedule";
import { EXEMPT } from "@/src/show-roles/lib/constants";
import {
  ANCHOR_MODE_VOLUNTEER,
  anchorModeForDate,
  monthKey,
  pickRandom,
  randomAnchorCandidates,
  randomPaCandidates
} from "@/src/show-roles/lib/anchors";

function sanitizeCalendarHtml(raw: string) {
  return sanitizeHtml(raw, {
    allowedTags: ["p", "div", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li", "span"],
    allowedAttributes: {
      span: ["class", "data-package-id", "data-display-label"]
    },
    allowedClasses: {
      span: ["package-pill"]
    },
    disallowedTagsMode: "discard"
  })
    .replace(/<div>/gi, "<p>")
    .replace(/<\/div>/gi, "</p>")
    .trim();
}

function dateFromKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

async function loadRegisteredUsersAndRoles() {
  return Promise.all([
    prisma.user.findMany({
      select: { name: true, nickname: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    }),
    prisma.platformRoleAssignment.findMany({
      where: { role: { in: ["ADVISER", "EXECUTIVE_PRODUCER", "SUPER_ADMIN"] } },
      select: { email: true, role: true }
    })
  ]);
}

export async function listCastPool() {
  const [users, assignments] = await loadRegisteredUsersAndRoles();
  return buildCastPool(
    users,
    assignments.filter((row) => row.role !== "EXECUTIVE_PRODUCER").map((row) => row.email),
    assignments.filter((row) => row.role === "EXECUTIVE_PRODUCER").map((row) => row.email)
  );
}

export async function listShowMembers() {
  return (await listCastPool()).members;
}

/** Generator roster: registered users except super-admin. EPs and advisers stay pickable. */
export async function listShowRolesPool() {
  const [users, assignments] = await loadRegisteredUsersAndRoles();
  const autoBlocked = assignments
    .filter((row) => row.role === "EXECUTIVE_PRODUCER" || row.role === "ADVISER")
    .map((row) => row.email);
  return buildCastPool(
    users,
    assignments.filter((row) => row.role === "SUPER_ADMIN").map((row) => row.email),
    [...autoBlocked, PACKAGE_ADVISER_EMAIL],
    { excludeNames: false }
  );
}

export async function showMembers() {
  return listShowMembers();
}

async function collectPrecedingPaAnnouncers(showDateKey: string) {
  const startKey = mondayDateKey(showDateKey);
  const overrides = await loadScheduleOverrides(startKey, showDateKey);
  const paDate = precedingPaDateKey(
    showDateKey,
    (dateKey) => resolveScheduleDay(dateKey, overrides).kind
  );
  if (!paDate) {
    return [];
  }
  const entry = await prisma.masterCalendarEntry.findUnique({
    where: { date: paDate },
    select: { content: true }
  });
  return entry ? extractCalendarPaAnnouncers(entry.content) : [];
}

export async function collectMonthAnchorNames(month: string, excludeDate?: string) {
  const [shows, entries] = await Promise.all([
    prisma.showRolesShow.findMany({
      where: { date: { startsWith: month } },
      select: { date: true, anchors: true }
    }),
    prisma.masterCalendarEntry.findMany({
      where: { date: { startsWith: month } },
      select: { date: true, content: true }
    })
  ]);

  const names = new Set<string>();
  for (const show of shows) {
    if (excludeDate && show.date === excludeDate) {
      continue;
    }
    const anchors = Array.isArray(show.anchors) ? show.anchors : [];
    for (const name of anchors) {
      if (typeof name === "string" && name.trim()) {
        names.add(name.trim());
      }
    }
  }
  for (const entry of entries) {
    if (excludeDate && entry.date === excludeDate) {
      continue;
    }
    for (const name of extractCalendarAnchors(entry.content)) {
      names.add(name);
    }
  }
  return [...names];
}

async function writeCalendarContent(dateKey: string, content: string) {
  const sanitized = sanitizeCalendarHtml(content);
  if (!sanitized) {
    await prisma.masterCalendarEntry.deleteMany({ where: { date: dateKey } });
    await markMasterCalendarEdited(dateKey);
    return "";
  }
  const entry = await prisma.masterCalendarEntry.upsert({
    where: { date: dateKey },
    create: { date: dateKey, content: sanitized },
    update: { content: sanitized }
  });
  await markMasterCalendarEdited(dateKey);
  return entry.content;
}

async function upsertShowAnchors(dateKey: string, anchors: string[]) {
  const existing = await prisma.showRolesShow.findUnique({ where: { date: dateKey } });
  if (existing) {
    await prisma.showRolesShow.update({
      where: { date: dateKey },
      data: { anchors }
    });
    return;
  }
  await prisma.showRolesShow.create({
    data: {
      date: dateKey,
      assignments: {},
      anchors,
      confirmed: {}
    }
  });
}

export async function setShowAnchors(dateKey: string, names: string[], source: "manual" | "random") {
  const anchors = uniqueNames(names).slice(0, 2);
  const month = monthKeyFromDateKey(dateKey);
  const already = await collectMonthAnchorNames(month, dateKey);
  const blocked = new Set(already);
  const repeat = anchors.filter((name) => blocked.has(name));
  if (repeat.length > 0) {
    throw new Error(`${repeat.join(" and ")} already anchored this month.`);
  }

  const existing = await prisma.masterCalendarEntry.findUnique({ where: { date: dateKey } });
  const nextHtml = setCalendarAnchors(existing?.content ?? "", anchors);
  const content = await writeCalendarContent(dateKey, nextHtml);
  await upsertShowAnchors(dateKey, anchors);

  const mode = anchorModeForDate(dateFromKey(dateKey));
  if (mode === ANCHOR_MODE_VOLUNTEER && source === "manual") {
    for (const name of anchors) {
      await prisma.anchorVolunteer.upsert({
        where: { monthKey_name: { monthKey: month, name } },
        create: { monthKey: month, name },
        update: {}
      });
    }
  }

  return { date: dateKey, anchors, content, mode };
}

export async function wipeMonthAnchors(monthKey: string) {
  const [entries, shows] = await Promise.all([
    prisma.masterCalendarEntry.findMany({
      where: { date: { startsWith: monthKey } },
      select: { date: true, content: true }
    }),
    prisma.showRolesShow.findMany({
      where: { date: { startsWith: monthKey } },
      select: { date: true }
    })
  ]);

  const nextEntries: Array<{ date: string; content: string }> = [];
  for (const entry of entries) {
    const nextHtml = wipeCalendarAnchorNames(entry.content);
    if (nextHtml === entry.content) {
      continue;
    }
    const content = await writeCalendarContent(entry.date, nextHtml);
    nextEntries.push({ date: entry.date, content });
  }

  if (shows.length > 0) {
    await prisma.showRolesShow.updateMany({
      where: { date: { startsWith: monthKey } },
      data: { anchors: [] }
    });
  }

  const volunteers = await prisma.anchorVolunteer.deleteMany({ where: { monthKey } });

  return {
    month: monthKey,
    entries: nextEntries,
    clearedShowDates: shows.map((show) => show.date),
    volunteersRemoved: volunteers.count
  };
}

export async function setPaAnnouncers(dateKey: string, names: string[]) {
  const announcers = uniqueNames(names).slice(0, 2);
  const existing = await prisma.masterCalendarEntry.findUnique({ where: { date: dateKey } });
  const nextHtml = setCalendarPaAnnouncers(existing?.content ?? "", announcers);
  const content = await writeCalendarContent(dateKey, nextHtml);
  return { date: dateKey, announcers, content };
}

export async function setShowManager(dateKey: string, name: string) {
  const manager = uniqueNames([name])[0] ?? "";
  const existing = await prisma.masterCalendarEntry.findUnique({ where: { date: dateKey } });
  const current = existing ? extractCalendarShowManager(existing.content) : "";
  if (manager === current) {
    const resolved = await resolveShowManagers([dateKey]);
    return {
      date: dateKey,
      content: existing?.content ?? "",
      pool: resolved.pool,
      name: resolved.managers[dateKey]?.name ?? "",
      source: resolved.managers[dateKey]?.source ?? "rotation"
    };
  }

  const nextHtml = setCalendarShowManager(existing?.content ?? "", manager ? [manager] : []);
  const content = await writeCalendarContent(dateKey, nextHtml);
  const resolved = await resolveShowManagers([dateKey]);
  return {
    date: dateKey,
    content,
    pool: resolved.pool,
    name: resolved.managers[dateKey]?.name ?? manager,
    source: resolved.managers[dateKey]?.source ?? (manager ? "manual" : "rotation")
  };
}

export async function suggestAnchorsForDate(dateKey: string) {
  const date = dateFromKey(dateKey);
  const month = monthKey(date);
  const mode = anchorModeForDate(date);
  const [nonAnchors, volunteers, monthAnchors, pool, recentPaAnnouncers] = await Promise.all([
    prisma.showRolesNonAnchor.findMany(),
    prisma.anchorVolunteer.findMany({ where: { monthKey: month } }),
    collectMonthAnchorNames(month, dateKey),
    listCastPool(),
    collectPrecedingPaAnnouncers(dateKey)
  ]);

  const monthVolunteers = volunteers.map((entry) => entry.name);
  const candidates = randomAnchorCandidates({
    members: pool.members,
    monthVolunteers,
    monthAnchors,
    nonAnchors: nonAnchors.map((entry) => entry.name),
    exempt: [...EXEMPT, ...pool.randomExempt],
    recentPaAnnouncers
  });

  return {
    date: dateKey,
    mode,
    monthVolunteers,
    monthAnchors,
    suggested: pickRandom(candidates, 2)
  };
}

export async function suggestPaForDate(dateKey: string) {
  const month = monthKeyFromDateKey(dateKey);
  const [monthAnchors, nonAnchors, pool] = await Promise.all([
    collectMonthAnchorNames(month),
    prisma.showRolesNonAnchor.findMany(),
    listCastPool()
  ]);
  const candidates = randomPaCandidates({
    members: pool.members,
    monthAnchors,
    nonAnchors: nonAnchors.map((entry) => entry.name),
    exempt: [...EXEMPT, ...pool.randomExempt]
  });
  return {
    date: dateKey,
    monthAnchors,
    suggested: pickRandom(candidates, 2)
  };
}
