export const ANCHOR_MODE_VOLUNTEER: "VOLUNTEER";
export const ANCHOR_MODE_RANDOM: "RANDOM";
export const ANCHOR_NOTICE_HOURS: number;

export type AnchorMode = typeof ANCHOR_MODE_VOLUNTEER | typeof ANCHOR_MODE_RANDOM;

export type AnchorHistoryRow = {
  name: string;
  isNonAnchor?: boolean;
  isExempt?: boolean;
};

export function weekOfMonth(date: Date): number;
export function monthKey(date: Date): string;
export function anchorModeForDate(date: Date): AnchorMode;
export function isVolunteerWeek(date: Date): boolean;

export function randomAnchorCandidates(input: {
  members: string[];
  monthVolunteers?: string[];
  monthAnchors?: string[];
  nonAnchors?: string[];
  exempt?: string[];
  recentPaAnnouncers?: string[];
}): string[];

export function randomPaCandidates(input: {
  members: string[];
  monthAnchors?: string[];
  nonAnchors?: string[];
  exempt?: string[];
}): string[];

export function shuffle<T>(items: T[], random?: () => number): T[];
export function pickRandom<T>(items: T[], count?: number, random?: () => number): T[];

export function suggestRandomAnchors(input: {
  anchorHistoryRows: AnchorHistoryRow[];
  monthVolunteers?: string[];
  monthAnchors?: string[];
  count?: number;
  random?: () => number;
}): string[];

export function hasSufficientAnchorNotice(showDate: Date | null, noticeAt: Date | null): boolean;
