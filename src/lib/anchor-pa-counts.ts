export type AnchorPaCountRow = {
  name: string;
  anchors: number;
  pa: number;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function firstToken(value: string) {
  return normalizeName(value).split(/\s+/).filter(Boolean)[0] ?? "";
}

function buildMemberLookups(members: string[]) {
  const byExact = new Map<string, string>();
  const byFirst = new Map<string, string>();
  const firstCounts = new Map<string, number>();

  for (const member of members) {
    const trimmed = member.trim();
    if (!trimmed) continue;
    byExact.set(normalizeName(trimmed), trimmed);
    const first = firstToken(trimmed);
    if (!first) continue;
    firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
    if (!byFirst.has(first)) {
      byFirst.set(first, trimmed);
    }
  }

  for (const [first, count] of firstCounts) {
    if (count > 1) {
      byFirst.delete(first);
    }
  }

  return { byExact, byFirst };
}

function resolvePerson(
  rawName: string,
  lookups: ReturnType<typeof buildMemberLookups>
) {
  const trimmed = rawName.trim();
  if (!trimmed) return "";
  const exact = lookups.byExact.get(normalizeName(trimmed));
  if (exact) return exact;
  const first = lookups.byFirst.get(firstToken(trimmed));
  if (first) return first;
  return trimmed;
}

export function tallyAnchorPaCounts(input: {
  members: string[];
  anchorsByDate: Record<string, string[]>;
  paByDate: Record<string, string[]>;
}): AnchorPaCountRow[] {
  const lookups = buildMemberLookups(input.members);
  const rows = new Map<string, AnchorPaCountRow>();

  function rowFor(name: string) {
    const key = normalizeName(name);
    const existing = rows.get(key);
    if (existing) return existing;
    const created: AnchorPaCountRow = { name, anchors: 0, pa: 0 };
    rows.set(key, created);
    return created;
  }

  for (const member of input.members) {
    const trimmed = member.trim();
    if (trimmed) rowFor(trimmed);
  }

  for (const names of Object.values(input.anchorsByDate)) {
    for (const name of names) {
      const resolved = resolvePerson(name, lookups);
      if (resolved) rowFor(resolved).anchors += 1;
    }
  }

  for (const names of Object.values(input.paByDate)) {
    for (const name of names) {
      const resolved = resolvePerson(name, lookups);
      if (resolved) rowFor(resolved).pa += 1;
    }
  }

  return [...rows.values()].sort((a, b) => {
    const totalDelta = b.anchors + b.pa - (a.anchors + a.pa);
    if (totalDelta !== 0) return totalDelta;
    const anchorDelta = b.anchors - a.anchors;
    if (anchorDelta !== 0) return anchorDelta;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
