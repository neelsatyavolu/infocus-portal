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

/** Shared field styling for native selects (matches components/ui/input). */
export const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm";
