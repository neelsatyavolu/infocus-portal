import type { AnchorHistoryRow } from "./anchors";

export type ShowRecord = {
  date: string;
  assignments: unknown;
  anchors: unknown;
  confirmed: unknown;
  associateShowManager?: string;
};

export type ShowHistory = {
  shows: ShowRecord[];
};

export function normalizeHistory(history: { shows: ShowRecord[] } | null | undefined): ShowHistory;
export function getRecencyByMember(
  history: ShowHistory,
  excludeDateStr?: string,
  members?: string[]
): Record<string, number>;
export function getRecentAssigneesByFilmingDate(
  history: ShowHistory,
  airDateStr?: string,
  excludeDateStr?: string
): Set<string>;
export function getShowByDate(history: ShowHistory, dateStr: string): ShowRecord | null;
export function upsertShow(history: ShowHistory, show: ShowRecord): ShowHistory;

export function generateAssignments(input: {
  history: ShowHistory;
  dateStr: string;
  anchors: string[];
  members?: string[];
  exempt?: string[];
}): Record<string, string>;

export function repickRole(input: {
  history: ShowHistory;
  dateStr: string;
  role: string;
  anchors: string[];
  assignments: Record<string, string>;
  members?: string[];
  exempt?: string[];
}): string | null;

export function getAnchorHistory(
  history: ShowHistory,
  nonAnchors?: string[],
  members?: string[],
  exempt?: string[]
): Array<AnchorHistoryRow & { count: number; lastDate: string | null }>;

export function getSuggestedAnchors(
  anchorHistoryRows: AnchorHistoryRow[],
  count?: number,
  monthVolunteers?: string[],
  monthAnchors?: string[],
  random?: () => number
): string[];

export function manualCandidates(anchors: string[], currentPerson: string, members?: string[]): string[];
export function emptyShow(dateStr: string): ShowRecord;
