/**
 * Pure helpers for the Post Maker's results templates (Race, Yes/No, Seats, Winner, Key figures).
 * People type results as plain lines separated by "|", so nothing here trusts the input: bad
 * numbers become null and the slide shows what it can. See docs/SOCIAL-MEDIA-DESIGN.md.
 */

export const PARTIES = ["D", "R", "I", "N"] as const;
/** D Democrat, R Republican, I independent or third party, N nonpartisan (local races). */
export type Party = (typeof PARTIES)[number];

export type Candidate = { name: string; party: Party; votes: number | null; share: number | null; label: string };
export type RaceStatus = "none" | "leads" | "wins" | "close";

export const MAX_CANDIDATES = 8;
export const MAX_FIGURES = 4;

const cells = (line: string) => line.split("|").map((cell) => cell.trim());

/** "144,302" → 144302, "50.1%" → null (that's a share). Anything else that isn't a number → null. */
export function parseCount(text: string): number | null {
  const clean = text.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(clean)) return null;
  return Number(clean);
}

/** "50.1%" or "50.1" → 50.1, within 0–100. */
export function parseShare(text: string): number | null {
  const clean = text.replace(/[%\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const value = Number(clean);
  return value >= 0 && value <= 100 ? value : null;
}

export function parseParty(text: string): Party {
  const code = text.trim().charAt(0).toUpperCase();
  return (PARTIES as readonly string[]).includes(code) ? (code as Party) : "N";
}

/**
 * One candidate per line: `Name | Party | Votes | Label`. Votes can be a count ("144,302") or a
 * share ("50.1%"). Party and label are optional. Empty lines are skipped; at most MAX_CANDIDATES.
 */
export function parseCandidates(text: string, max = MAX_CANDIDATES): Candidate[] {
  return text
    .split("\n")
    .map(cells)
    .filter(([name]) => Boolean(name))
    .slice(0, max)
    .map(([name, party = "", result = "", label = ""]) => {
      const isShare = result.includes("%");
      return {
        name,
        party: parseParty(party),
        votes: isShare ? null : parseCount(result),
        share: isShare ? parseShare(result) : null,
        label
      };
    });
}

/**
 * Fills in each candidate's share. When every candidate has a vote count, shares are of all votes,
 * including `otherVotes` (write-ins and anyone not listed), so they match the source. Otherwise the
 * typed shares are used as they are.
 */
export function withShares(candidates: Candidate[], otherVotes = 0): Candidate[] {
  const counted = candidates.length > 0 && candidates.every((c) => c.votes !== null);
  if (!counted) return candidates;
  const total = candidates.reduce((sum, c) => sum + (c.votes ?? 0), 0) + Math.max(0, otherVotes);
  if (!total) return candidates;
  return candidates.map((c) => ({ ...c, share: Math.round((10000 * (c.votes ?? 0)) / total) / 100 }));
}

/** Highest share first (then most votes). Never mutates the input. */
export function ranked(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || (b.votes ?? -1) - (a.votes ?? -1));
}

/** "50.1%", one decimal (the guide's rule). */
export function formatShare(share: number | null): string {
  return share === null ? "–" : `${share.toFixed(1)}%`;
}

/** "144,302" */
export function formatCount(count: number | null): string {
  return count === null ? "" : count.toLocaleString("en-US");
}

/** Last name for status lines: "Daniel J. Sullivan Jr." → "Sullivan". */
export function lastName(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => !/^(Jr\.?|Sr\.?|II|III|IV)$/i.test(word));
  return words[words.length - 1] ?? name;
}

/** The gap between the last winning spot and the next candidate, in votes when both have counts. */
export function marginLine(candidates: Candidate[], seats = 1): string {
  const order = ranked(candidates);
  const inside = order[seats - 1];
  const outside = order[seats];
  if (!inside || !outside) return "";
  if (inside.votes !== null && outside.votes !== null) {
    const gap = inside.votes - outside.votes;
    return seats === 1 ? `${formatCount(gap)}-vote margin` : `${formatCount(gap)} votes separate ${ordinal(seats)} and ${ordinal(seats + 1)}`;
  }
  if (inside.share !== null && outside.share !== null) {
    const gap = Math.round((inside.share - outside.share) * 10) / 10;
    return seats === 1 ? `${gap.toFixed(1)}-point margin` : `${gap.toFixed(1)} points separate ${ordinal(seats)} and ${ordinal(seats + 1)}`;
  }
  return "";
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/**
 * Whether the order is trustworthy: every candidate has a share (no mixed counts and percentages)
 * and nobody is tied across the winning cutoff.
 */
export function clearOrder(candidates: Candidate[], seats = 1): boolean {
  if (!candidates.length || candidates.some((c) => c.share === null)) return false;
  const order = ranked(candidates);
  const inside = order[seats - 1];
  const outside = order[seats];
  if (!inside || !outside) return true;
  return inside.votes !== null && outside.votes !== null ? inside.votes !== outside.votes : inside.share !== outside.share;
}

/** The status tag's words. Neutral by construction: "wins" only when someone chose "Called". */
export function statusLabel(status: RaceStatus, leader: Candidate | undefined, seats = 1): string {
  if (status === "close") return "Too close to call";
  if (!leader) return "";
  if (status === "wins") return seats === 1 ? `${lastName(leader.name)} wins` : "Winners called";
  if (status === "leads") return seats === 1 ? `${lastName(leader.name)} leads` : "Not yet called";
  return "";
}

export type MeasureResult = { yes: number; no: number; yesShare: number; noShare: number; threshold: number; pointsFromThreshold: number };

/**
 * Yes/No measure: two vote counts, or a Yes share typed with "%" (No optional, also with "%").
 * Anything else, including mixed units, returns null. `threshold` is the Yes share needed
 * (50 for a majority, 55, 66.67 for two-thirds).
 */
export function measureResult(yesText: string, noText: string, thresholdText = "50"): MeasureResult | null {
  const threshold = parseShare(thresholdText) ?? 50;
  const yesCount = parseCount(yesText);
  const noCount = parseCount(noText);
  if (yesCount !== null && noCount !== null && yesCount + noCount > 0) {
    const yesShare = Math.round((10000 * yesCount) / (yesCount + noCount)) / 100;
    return { yes: yesCount, no: noCount, yesShare, noShare: Math.round((100 - yesShare) * 100) / 100, threshold, pointsFromThreshold: Math.round((yesShare - threshold) * 10) / 10 };
  }
  // Shares only when typed as shares: a lone count ("12") is not 12%.
  if (!yesText.includes("%")) return null;
  const yesShare = parseShare(yesText);
  if (yesShare === null) return null;
  const typedNo = noText.trim() ? (noText.includes("%") ? parseShare(noText) : null) : Math.round((100 - yesShare) * 100) / 100;
  if (typedNo === null || yesShare + typedNo > 100.05) return null;
  const noShare = typedNo;
  return { yes: 0, no: 0, yesShare, noShare, threshold, pointsFromThreshold: Math.round((yesShare - threshold) * 10) / 10 };
}

export type Figure = { figure: string; title: string; detail: string; party: Party | null };

/**
 * Key figures, one per line: `Figure | Title | Detail | Party`. The optional party (D or R) colors
 * the figure; anything else leaves it Ink. At most MAX_FIGURES.
 */
export function parseFigures(text: string, max = MAX_FIGURES): Figure[] {
  return text
    .split("\n")
    .map(cells)
    .filter(([figure]) => Boolean(figure))
    .slice(0, max)
    .map(([figure, title = "", detail = "", party = ""]) => {
      const code = parseParty(party);
      return { figure, title, detail, party: party && (code === "D" || code === "R") ? code : null };
    });
}

/** Seats for each side, clamped to the chamber. */
export function seatSplit(totalText: string, demText: string, repText: string) {
  const total = Math.max(1, parseCount(totalText) ?? 100);
  const dem = Math.min(total, parseCount(demText) ?? 0);
  const rep = Math.min(total - dem, parseCount(repText) ?? 0);
  return { total, dem, rep, undecided: total - dem - rep };
}

export type Stat = { figure: string; label: string; party: Party | null };

/** Up to three figures for the Winner slide, one per line: `Figure | Label | Party`. */
export function parseStats(text: string, max = 3): Stat[] {
  return text
    .split("\n")
    .map(cells)
    .filter(([figure]) => Boolean(figure))
    .slice(0, max)
    .map(([figure, label = "", party = ""]) => {
      const code = parseParty(party);
      return { figure, label, party: party && (code === "D" || code === "R") ? code : null };
    });
}
