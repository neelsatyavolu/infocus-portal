import type { CalendarSyncStatus } from "@/src/lib/program-config";
import {
  formatStorage,
  formatWhen,
  type BackupStatus,
  type GoogleCalendarStatus,
  type Remote,
  type YoutubeStatus
} from "./admin-types";

/**
 * One status vocabulary for Admin. The health strip, section tags, integration cards, tab
 * warnings and the header's context line all read these, so every place uses the same words.
 */
export type HealthCode =
  | "connected"
  | "not-connected"
  | "expired"
  | "sync-failed"
  | "ok"
  | "failed"
  | "no-backups"
  | "not-set-up"
  | "not-checked"
  | "checking"
  | "unknown";

export type HealthTone = "ok" | "danger" | "neutral";

export type Health = { code: HealthCode; tone: HealthTone; label: string; detail: string | null };

const LABEL: Record<HealthCode, string> = {
  connected: "Connected",
  "not-connected": "Not connected",
  expired: "Expired",
  "sync-failed": "Sync failed",
  ok: "OK",
  failed: "Failed",
  "no-backups": "No backups yet",
  "not-set-up": "Not set up",
  "not-checked": "Not checked",
  checking: "Checking",
  unknown: "Unknown"
};

const TONE: Record<HealthCode, HealthTone> = {
  connected: "ok",
  ok: "ok",
  "not-connected": "danger",
  expired: "danger",
  "sync-failed": "danger",
  failed: "danger",
  "no-backups": "neutral",
  "not-set-up": "neutral",
  "not-checked": "neutral",
  checking: "neutral",
  unknown: "neutral"
};

export function health(code: HealthCode, detail: string | null = null): Health {
  return { code, tone: TONE[code], label: LABEL[code], detail };
}

export function needsAttention(value: Health | null | undefined) {
  return value?.tone === "danger";
}

function notReady(state: "loading" | "error"): Health {
  return state === "loading" ? health("checking") : health("unknown", "Couldn't check");
}

/** "since Oct 14, 3:05 PM", or "set by environment" when the credential came from a Worker secret. */
function connectedSince(connectedAt: string | null) {
  return connectedAt ? `since ${formatWhen(connectedAt)}` : "set by environment";
}

const YOUTUBE_PAUSED = "Uploads to YouTube are paused.";
const YOUTUBE_EXPIRED = "Uploads to YouTube are paused until you reconnect.";
const CALENDAR_OFF = "Meetings send no calendar invites.";

export function youtubeHealth(remote: Remote<YoutubeStatus>): Health {
  if (remote.state !== "ready") return notReady(remote.state);
  const status = remote.data;
  if (status.connected) {
    return health("connected", `${status.channelTitle ?? "Connected"} · ${connectedSince(status.connectedAt)}`);
  }
  if (status.source === "none") return health("not-connected", YOUTUBE_PAUSED);
  return health("expired", status.message || YOUTUBE_EXPIRED);
}

/** The Integrations card's sentence for YouTube: the same facts and words as youtubeHealth, in full. */
export function youtubeStatusLine(remote: Remote<YoutubeStatus>) {
  if (remote.state === "loading") return "Checking YouTube…";
  if (remote.state === "error") return "Couldn't check the YouTube connection.";
  const status = remote.data;
  if (status.connected) {
    const who = status.channelTitle ? `Connected as ${status.channelTitle}` : "Connected";
    return `${who} · ${connectedSince(status.connectedAt)}`;
  }
  if (status.source === "none") return `Not connected. ${YOUTUBE_PAUSED}`;
  return `Authorization expired. ${YOUTUBE_EXPIRED}`;
}

/** The Integrations card's sentence for Google Calendar (a sync error is shown on its own line). */
export function googleCalendarStatusLine(remote: Remote<GoogleCalendarStatus>) {
  if (remote.state === "loading") return "Checking Google Calendar…";
  if (remote.state === "error") return "Couldn't check Google Calendar.";
  const status = remote.data;
  if (!status.connected) return `Not connected. ${CALENDAR_OFF}`;
  const who = status.accountEmail ? `Invites are sent from ${status.accountEmail}` : "Connected";
  return status.connectedAt ? `${who} · ${connectedSince(status.connectedAt)}` : who;
}

export function googleCalendarHealth(remote: Remote<GoogleCalendarStatus>): Health {
  if (remote.state !== "ready") return notReady(remote.state);
  const status = remote.data;
  if (!status.connected) return health("not-connected", CALENDAR_OFF);
  if (status.lastSyncError) return health("sync-failed", status.lastSyncError);
  if (status.lastSyncedAt) return health("connected", `Last synced ${formatWhen(status.lastSyncedAt)}`);
  return health("connected", status.accountEmail ?? null);
}

export function backupHealth(remote: Remote<BackupStatus>): Health {
  if (remote.state !== "ready") return notReady(remote.state);
  const status = remote.data;
  if (!status.configured) return health("not-set-up", "Backups are not configured.");
  const latest = status.latest;
  if (!latest) return health("no-backups", "Use Backup now to make the first one.");
  if (latest.ok) {
    return health("ok", `${formatWhen(latest.at)}${latest.bytes != null ? ` · ${formatStorage(latest.bytes)}` : ""}`);
  }
  return health("failed", latest.error || `Last run ${formatWhen(latest.at)}`);
}

export function calendarSyncHealth(remote: Remote<CalendarSyncStatus | null>): Health {
  if (remote.state !== "ready") return notReady(remote.state);
  const status = remote.data;
  if (!status) return health("not-checked", "The Portal checks once a day.");
  if (!status.ok) return health("failed", status.message || `Checked ${formatWhen(status.at)}`);
  return health("ok", `Checked ${formatWhen(status.at)}`);
}

/** Everything Admin knows about the Portal's health. System entries are null for executive producers. */
export type AdminHealth = {
  youtube: Health | null;
  googleCalendar: Health | null;
  backups: Health | null;
  calendarSync: Health;
};

/** True when the System tab has something that needs the adviser or super admin. */
export function systemNeedsAttention(value: AdminHealth) {
  return needsAttention(value.youtube) || needsAttention(value.googleCalendar) || needsAttention(value.backups);
}

export type ContextItem = { key: string; label: string; target: string };

const MAX_CONTEXT_ITEMS = 2;

/**
 * The header's context line: what needs someone right now, most urgent first. At most two
 * items show; the rest are counted in `more`.
 */
export function headerContextItems(pendingRequests: number, value: AdminHealth) {
  const items: ContextItem[] = [];
  if (pendingRequests > 0) {
    items.push({
      key: "access",
      label: `${pendingRequests} access request${pendingRequests === 1 ? "" : "s"} waiting`,
      target: "access-requests"
    });
  }
  if (needsAttention(value.youtube)) {
    items.push({ key: "youtube", label: "YouTube uploads paused", target: "integrations" });
  }
  if (value.googleCalendar?.code === "not-connected") {
    items.push({ key: "gcal", label: "Google Calendar not connected", target: "integrations" });
  } else if (value.googleCalendar?.code === "sync-failed") {
    items.push({ key: "gcal", label: "Google Calendar sync failed", target: "integrations" });
  }
  if (value.backups?.code === "failed") {
    items.push({ key: "backups", label: "Last backup failed", target: "backups" });
  }
  if (value.calendarSync.code === "failed") {
    items.push({ key: "calendar", label: "Paly's calendar check failed", target: "configuration" });
  }
  return { shown: items.slice(0, MAX_CONTEXT_ITEMS), more: Math.max(0, items.length - MAX_CONTEXT_ITEMS) };
}
