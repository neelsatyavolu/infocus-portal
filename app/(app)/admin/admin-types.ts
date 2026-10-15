export type PlatformRole = "SUPER_ADMIN" | "EXECUTIVE_PRODUCER" | "ADVISER" | "ASSOCIATE_PRODUCER";

export type PlatformMe = {
  email: string | null;
  role: PlatformRole | null;
  permissions: {
    canManageWorkspaces: boolean;
    canManageAllowedEmails: boolean;
    canManagePlatformRoles: boolean;
  };
};

export type BackupLatest = {
  ok: boolean;
  at: string;
  key: string | null;
  bytes: number | null;
  error: string | null;
};

export type BackupDump = {
  key: string;
  lastModified: string;
  bytes: number;
};

export type BackupStatus =
  | { configured: false }
  | { configured: true; latest: BackupLatest | null; dumps: BackupDump[] };

export type RoleAssignment = {
  id: string;
  email: string;
  role: PlatformRole;
  createdAt: string;
};

export type PlatformAccessRequestStatus = "PENDING" | "APPROVED" | "DENIED";

export type PlatformAccessRequest = {
  id: string;
  email: string;
  name: string | null;
  status: PlatformAccessRequestStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedByEmail: string | null;
};

export type PlatformUser = {
  id: string;
  email: string | null;
  name: string | null;
  nickname: string | null;
  createdAt: string;
};

export type PlatformStats = {
  totals: {
    users: number;
    workspaces: number;
    projects: number;
    activeMedia: number;
    versions: number;
    comments: number;
    activeShareLinks: number;
    roleAssignments: number;
    allowedEmails: number;
  };
  storage: {
    estimatedBytes: number;
    isEstimated: boolean;
  };
};

/** GET /api/admin/youtube/status. */
export type YoutubeStatus = {
  connected: boolean;
  source: "admin" | "env" | "none";
  channelTitle: string | null;
  connectedAt: string | null;
  lastCheckOk: boolean | null;
  message: string | null;
};

/** GET /api/admin/google-calendar/status. */
export type GoogleCalendarStatus = {
  connected: boolean;
  accountEmail: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

/** A value loaded in the background: still loading, failed, or here. */
export type Remote<T> = { state: "loading" } | { state: "error" } | { state: "ready"; data: T };

/** Shown for errors that should stay on screen; sections also toast. */
export type ReportMessage = (message: string | null) => void;

export function formatRoleLabel(role: PlatformRole | null) {
  if (!role) {
    return "None";
  }

  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatStorage(bytes: number) {
  if (bytes >= 1_000_000_000_000) {
    return `${(bytes / 1_000_000_000_000).toFixed(2)} TB`;
  }

  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  }

  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(2)} MB`;
  }

  return `${Math.round(bytes / 1_000)} KB`;
}

/**
 * The one short timestamp on Admin: "Oct 14, 3:05 PM", with the year when it isn't this year
 * ("Dec 30, 2025, 9:00 AM"). `now` and `timeZone` are for tests.
 */
export function formatWhen(iso: string, options: { now?: Date; timeZone?: string } = {}) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const yearOf = (value: Date) =>
    new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: options.timeZone }).format(value);
  const sameYear = yearOf(date) === yearOf(options.now ?? new Date());
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
    timeZone: options.timeZone
  });
}

/** The full local timestamp, for hover text. */
export function formatWhenFull(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export async function getData<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Failed to load");
  }

  return payload.data as T;
}

export function personLabel(user: Pick<PlatformUser, "nickname" | "name" | "email">) {
  return user.nickname || user.name || user.email || "Unnamed";
}

export function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
