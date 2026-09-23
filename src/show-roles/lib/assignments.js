import { BACKUP_ROLES, EXEMPT, MEMBERS, ROLES } from "./constants";
import { suggestRandomAnchors } from "./anchors";

export function normalizeHistory(history) {
  const shows = Array.isArray(history?.shows) ? [...history.shows] : [];
  shows.sort((a, b) => a.date.localeCompare(b.date));
  return { shows };
}

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function seed() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(array, seedStr) {
  const rng = mulberry32(xmur3(seedStr)());
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function weightedUniquePick(members, recencyByMember, count, seedStr) {
  const rng = mulberry32(xmur3(seedStr)());
  const pool = members.map((member) => {
    const distance = recencyByMember[member] ?? 25;
    const bounded = Math.min(Math.max(distance, 1), 25);
    return {
      member,
      weight: 1 + bounded * 1.5,
    };
  });

  const picks = [];

  while (picks.length < count && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let ticket = rng() * total;
    let selected = pool.length - 1;

    for (let i = 0; i < pool.length; i += 1) {
      ticket -= pool[i].weight;
      if (ticket <= 0) {
        selected = i;
        break;
      }
    }

    picks.push(pool[selected].member);
    pool.splice(selected, 1);
  }

  return picks;
}

function showsBeforeDate(history, dateStr) {
  return history.shows
    .filter((show) => !dateStr || show.date < dateStr)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function collectAssignedNames(show) {
  return [
    ...ROLES.map((role) => show?.assignments?.[role]),
    ...(Array.isArray(show?.anchors) ? show.anchors : []),
    show?.associateShowManager,
  ].filter((name) => typeof name === "string" && name.length > 0);
}

function rosterMembers(members) {
  return Array.isArray(members) ? members : MEMBERS;
}

function rosterExempt(exempt) {
  return Array.isArray(exempt) ? exempt : EXEMPT;
}

export function getRecencyByMember(history, excludeDateStr, members) {
  const shows = showsBeforeDate(history, excludeDateStr);
  const recency = {};

  rosterMembers(members).forEach((member) => {
    recency[member] = shows.length + 10;
  });

  for (let i = shows.length - 1; i >= 0; i -= 1) {
    const distance = shows.length - i;
    collectAssignedNames(shows[i]).forEach((name) => {
      if (recency[name] > distance) {
        recency[name] = distance;
      }
    });
  }

  return recency;
}

export function getRecentAssigneesByFilmingDate(history, airDateStr, excludeDateStr) {
  const shows = showsBeforeDate(history, airDateStr || excludeDateStr);
  const recent = shows.slice(Math.max(0, shows.length - 2));

  const names = new Set();
  recent.forEach((show) => {
    collectAssignedNames(show).forEach((name) => names.add(name));
  });

  return names;
}

export function getShowByDate(history, dateStr) {
  return history.shows.find((show) => show.date === dateStr) ?? null;
}

export function upsertShow(history, show) {
  const next = normalizeHistory(history);
  const index = next.shows.findIndex((item) => item.date === show.date);
  if (index >= 0) {
    next.shows[index] = show;
  } else {
    next.shows.push(show);
  }
  next.shows.sort((a, b) => a.date.localeCompare(b.date));
  return next;
}

export function generateAssignments({ history, dateStr, anchors, members, exempt }) {
  const roster = rosterMembers(members);
  const skipped = rosterExempt(exempt);
  const recent = getRecentAssigneesByFilmingDate(history, dateStr, dateStr);
  const blocked = new Set([...anchors.filter(Boolean), ...skipped, ...Array.from(recent)]);

  const eligible = roster.filter((member) => !blocked.has(member));
  if (eligible.length < ROLES.length) {
    throw new Error("Not enough eligible members to fill all roles.");
  }

  const recencyByMember = getRecencyByMember(history, dateStr, roster);
  const entropy = Date.now().toString();
  const picked = weightedUniquePick(eligible, recencyByMember, ROLES.length, `${dateStr}:people:${entropy}`);
  const shuffledRoles = seededShuffle(ROLES, `${dateStr}:roles:${entropy}`);

  const draft = {};
  shuffledRoles.forEach((role, index) => {
    draft[role] = picked[index];
  });

  const ordered = {};
  ROLES.forEach((role) => {
    ordered[role] = draft[role] ?? "";
  });

  const usedToday = new Set(picked);
  const backupEligible = eligible.filter((member) => !usedToday.has(member));
  const backupPicks = weightedUniquePick(
    backupEligible,
    recencyByMember,
    Math.min(BACKUP_ROLES.length, backupEligible.length),
    `${dateStr}:backups:${entropy}`,
  );
  BACKUP_ROLES.forEach((role, index) => {
    ordered[role] = backupPicks[index] ?? "";
  });

  return ordered;
}

export function repickRole({ history, dateStr, role, anchors, assignments, members, exempt }) {
  const roster = rosterMembers(members);
  const skipped = rosterExempt(exempt);
  const recent = getRecentAssigneesByFilmingDate(history, dateStr, dateStr);
  const blockedAnchors = new Set(anchors);
  const assignedToday = new Set(Object.values(assignments).filter(Boolean));
  const current = assignments[role];
  const recencyByMember = getRecencyByMember(history, dateStr, roster);

  const alternatives = roster.filter(
    (member) =>
      member !== current &&
      !skipped.includes(member) &&
      !blockedAnchors.has(member) &&
      !recent.has(member) &&
      !assignedToday.has(member),
  );

  if (alternatives.length === 0) {
    return null;
  }

  const [replacement] = weightedUniquePick(
    alternatives,
    recencyByMember,
    1,
    `${dateStr}:${role}:${current}:repick:${Date.now()}`,
  );

  return replacement ?? null;
}

export function getAnchorHistory(history, nonAnchors = [], members, exempt) {
  const nonAnchorSet = new Set(nonAnchors);
  const exemptSet = new Set(rosterExempt(exempt));
  const stats = {};

  rosterMembers(members).forEach((member) => {
    stats[member] = {
      name: member,
      count: 0,
      lastDate: null,
      isNonAnchor: nonAnchorSet.has(member),
      isExempt: exemptSet.has(member),
    };
  });

  history.shows.forEach((show) => {
    const anchors = Array.isArray(show.anchors) ? show.anchors : [];
    anchors.forEach((name) => {
      if (!stats[name]) return;
      stats[name].count += 1;
      if (!stats[name].lastDate || show.date > stats[name].lastDate) {
        stats[name].lastDate = show.date;
      }
    });
  });

  const rows = Object.values(stats);
  rows.sort((a, b) => {
    if (!a.lastDate && !b.lastDate) return a.name.localeCompare(b.name);
    if (!a.lastDate) return -1;
    if (!b.lastDate) return 1;
    return a.lastDate.localeCompare(b.lastDate);
  });

  return rows;
}

/**
 * Random pair from the eligible pool. Volunteers and anyone who already
 * anchored this month are excluded first.
 */
export function getSuggestedAnchors(
  anchorHistoryRows,
  count = 2,
  monthVolunteers = [],
  monthAnchors = [],
  random = Math.random
) {
  return suggestRandomAnchors({
    anchorHistoryRows,
    monthVolunteers,
    monthAnchors,
    count,
    random
  });
}

export function manualCandidates(anchors, currentPerson, members) {
  const blockedAnchors = new Set(anchors.filter(Boolean));
  return rosterMembers(members).filter((member) => !blockedAnchors.has(member) && member !== currentPerson);
}

export function emptyShow(dateStr) {
  return {
    date: dateStr,
    assignments: {},
    anchors: [],
    confirmed: {},
  };
}
