import type { OverflowProjection } from "@/src/lib/publishing-queue-projection";

/** Shapes returned by GET /api/package-cycle/queue (app/api/package-cycle/queue/route.ts). */

export type YoutubePublicationSummary = {
  status: string;
  videoId: string | null;
  publishedAt: string | null;
  lastError: string | null;
};

export type QueueRow = {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  headline?: string | null;
  custom?: boolean;
  queuedForAirAt: string | null;
  queuedForShowDate: string | null;
  /** False while the package holds its show without a final cut. Missing (older replies) means it has one. */
  hasFinalCut?: boolean;
  members: Array<string | null>;
  thumbnailUrl?: string | null;
  youtubePublication?: YoutubePublicationSummary | null;
};

/** `label` is "Wednesday, October 15", or "Wednesday, October 15 · <special show name>". */
export type UpcomingShow = {
  date: string;
  label: string;
};

export type Candidate = {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  custom?: boolean;
  hasFinalCut?: boolean;
  members: Array<string | null>;
};

export type QueueData = {
  packages: QueueRow[];
  /** Producers only: packages the year will make that no show day is left to air. */
  overflow?: OverflowProjection | null;
  publishingConfigured?: boolean;
  today?: string;
  upcomingShows: UpcomingShow[];
  candidates?: Candidate[];
};

/** A show a package can be moved to (upcoming shows, plus past ones in the Past shows dialog). */
export type ShowOption = UpcomingShow;

export type CandidatesStatus = "idle" | "loading" | "ready" | "error";

/** Counts packages on a show, leaving one row out (the row being moved or dragged). */
export type OccupiedOn = (date: string, excludeRowId?: string | null) => number;
