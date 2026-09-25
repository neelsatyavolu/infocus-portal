"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, Database, Download, FileVideo2, FolderKanban, HardDrive, Link2, MailQuestion, MessageCircle, Shield, Trash2, UserCog, UserPlus, Users, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

type PlatformRole = "SUPER_ADMIN" | "EXECUTIVE_PRODUCER" | "ADVISER" | "ASSOCIATE_PRODUCER";

type PlatformMe = {
  email: string | null;
  role: PlatformRole | null;
  permissions: {
    canManageWorkspaces: boolean;
    canManageAllowedEmails: boolean;
    canManagePlatformRoles: boolean;
  };
};

type BackupLatest = {
  ok: boolean;
  at: string;
  key: string | null;
  bytes: number | null;
  error: string | null;
};

type BackupDump = {
  key: string;
  lastModified: string;
  bytes: number;
};

type BackupStatus =
  | { configured: false }
  | { configured: true; latest: BackupLatest | null; dumps: BackupDump[] };

type RoleAssignment = {
  id: string;
  email: string;
  role: PlatformRole;
  createdAt: string;
};

type PlatformAccessRequestStatus = "PENDING" | "APPROVED" | "DENIED";

type PlatformAccessRequest = {
  id: string;
  email: string;
  name: string | null;
  status: PlatformAccessRequestStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedByEmail: string | null;
};

type PlatformUser = {
  id: string;
  email: string | null;
  name: string | null;
  nickname: string | null;
  createdAt: string;
};

type PlatformStats = {
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
  recentUsers: Array<{
    id: string;
    name: string | null;
    email: string | null;
    createdAt: string;
  }>;
};

function formatRoleLabel(role: PlatformRole | null) {
  if (!role) {
    return "None";
  }

  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAccessRequestStatusLabel(status: PlatformAccessRequestStatus) {
  if (status === "PENDING") {
    return "Pending";
  }

  if (status === "APPROVED") {
    return "Approved";
  }

  return "Denied";
}

function formatStorage(bytes: number) {
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

async function getData<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Failed to load");
  }

  return payload.data as T;
}

export default function AdminPage() {
  const [me, setMe] = useState<PlatformMe | null>(null);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [accessRequests, setAccessRequests] = useState<PlatformAccessRequest[]>([]);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendInviteEmail, setSendInviteEmail] = useState(true);
  const [addingPerson, setAddingPerson] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [userNameDrafts, setUserNameDrafts] = useState<Record<string, string>>({});
  const [roleEmailInput, setRoleEmailInput] = useState("");
  const [roleInput, setRoleInput] = useState<PlatformRole>("ASSOCIATE_PRODUCER");
  const [cyclesPerSemester, setCyclesPerSemester] = useState(3);
  const [savingCycles, setSavingCycles] = useState(false);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUserNameId, setSavingUserNameId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [decidingAccessRequestId, setDecidingAccessRequestId] = useState<string | null>(null);
  const [approvingAllPending, setApprovingAllPending] = useState(false);
  const [accessRequestsOpen, setAccessRequestsOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState("");
  const [resettingCycles, setResettingCycles] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupStatus | null>(null);
  const [queuingBackup, setQueuingBackup] = useState(false);
  const [showAllBackups, setShowAllBackups] = useState(false);

  const canManageAllowedEmails = Boolean(me?.permissions.canManageAllowedEmails);
  const canManagePlatformRoles = Boolean(me?.permissions.canManagePlatformRoles);

  const sortedRoles = useMemo(() => {
    return [...roleAssignments].sort((a, b) => a.email.localeCompare(b.email));
  }, [roleAssignments]);

  const sortedUsers = useMemo(() => {
    return [...platformUsers].sort((a, b) => {
      const aKey = (a.name ?? a.email ?? "").toLowerCase();
      const bKey = (b.name ?? b.email ?? "").toLowerCase();
      return aKey.localeCompare(bKey);
    });
  }, [platformUsers]);

  const sortedAccessRequests = useMemo(() => {
    const weight: Record<PlatformAccessRequestStatus, number> = {
      PENDING: 0,
      APPROVED: 1,
      DENIED: 2
    };

    return [...accessRequests].sort((a, b) => {
      const byStatus = weight[a.status] - weight[b.status];
      if (byStatus !== 0) {
        return byStatus;
      }

      return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
    });
  }, [accessRequests]);

  const pendingAccessRequestCount = useMemo(
    () => sortedAccessRequests.filter((entry) => entry.status === "PENDING").length,
    [sortedAccessRequests]
  );

  const filteredUsers = useMemo(() => {
    const query = peopleQuery.trim().toLowerCase();
    if (!query) {
      return sortedUsers;
    }

    return sortedUsers.filter((user) => {
      const haystack = [user.name, user.nickname, user.email].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [peopleQuery, sortedUsers]);

  async function refresh(options?: { pageLoader?: boolean; includeStats?: boolean }) {
    const pageLoader = options?.pageLoader ?? true;
    const includeStats = options?.includeStats ?? true;
    if (pageLoader) {
      setLoading(true);
    }

    try {
      const nextMe = await getData<PlatformMe>("/api/platform/me");
      setMe(nextMe);

      if (nextMe.permissions.canManageAllowedEmails) {
        const statsPromise = includeStats
          ? getData<PlatformStats>("/api/platform/stats").then((nextStats) => {
              setStats(nextStats);
            })
          : null;

        const [roles, users, requests, program] = await Promise.all([
          getData<RoleAssignment[]>("/api/platform/roles"),
          getData<PlatformUser[]>("/api/platform/users"),
          getData<PlatformAccessRequest[]>("/api/platform/access-requests"),
          getData<{ cyclesPerSemester: number }>("/api/platform/program-settings")
        ]);

        setCyclesPerSemester(program.cyclesPerSemester);

        setRoleAssignments(roles);
        setPlatformUsers(users);
        setAccessRequests(requests);
        setUserNameDrafts(
          users.reduce<Record<string, string>>((acc, user) => {
            acc[user.id] = user.nickname ?? "";
            return acc;
          }, {})
        );

        if (statsPromise) {
          void statsPromise.catch((error) => {
            setMessage(error instanceof Error ? error.message : "Failed to load admin stats.");
          });
        }
      }

      if (nextMe.permissions.canManagePlatformRoles) {
        try {
          setBackups(await getData<BackupStatus>("/api/platform/backups"));
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Failed to load backups.");
        }
      } else {
        setBackups(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load admin data.");
    } finally {
      if (pageLoader) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void refresh({ pageLoader: true, includeStats: true });
  }, []);

  async function onAddPerson(event: FormEvent) {
    event.preventDefault();
    const name = inviteName.trim();
    const email = inviteEmail.trim();
    if (!name || !email) {
      setMessage("Enter a name and email.");
      return;
    }

    setAddingPerson(true);
    setMessage(null);

    try {
      const response = await fetch("/api/platform/allowed-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          sendInvite: sendInviteEmail
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        const errorMessage = payload?.error?.message ?? "Failed to add person.";
        setMessage(errorMessage);
        toast.error(errorMessage);
        return;
      }

      setInviteName("");
      setInviteEmail("");
      const emailed = Number(payload?.data?.emailed ?? 0);
      toast.success(
        sendInviteEmail
          ? emailed > 0
            ? `${name} can sign in. Invite email sent.`
            : `${name} can sign in. Invite email was not sent.`
          : `${name} can sign in with Google.`
      );
      await refresh({ pageLoader: false, includeStats: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to add person.";
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setAddingPerson(false);
    }
  }

  async function onSaveRegisteredUserName(userId: string) {
    setSavingUserNameId(userId);
    setMessage(null);

    const response = await fetch(`/api/platform/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: (userNameDrafts[userId] ?? "").trim() || null
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload?.error?.message ?? "Failed to update nickname.");
      setSavingUserNameId(null);
      return;
    }

    const updated = payload.data as PlatformUser;
    setPlatformUsers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
    setStats((current) =>
      current
        ? {
            ...current,
            recentUsers: current.recentUsers.map((entry) =>
              entry.id === updated.id
                ? {
                    ...entry,
                    name: updated.name
                  }
                : entry
            )
          }
        : current
    );
    setSavingUserNameId(null);
  }

  async function onDeleteRegisteredUser(user: PlatformUser) {
    const label = user.email ?? user.name ?? "this user";
    const confirmed = window.confirm(
      `Delete ${label}? This removes their registered user profile from this platform.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingUserId(user.id);
    setMessage(null);

    let response: Response;
    try {
      response = await fetch(`/api/platform/users/${user.id}`, {
        method: "DELETE"
      });
    } catch {
      const errorMessage = "Couldn't reach the server. Please try again.";
      setMessage(errorMessage);
      toast.error(errorMessage);
      setDeletingUserId(null);
      return;
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage = payload?.error?.message ?? "Failed to delete user.";
      setMessage(errorMessage);
      toast.error(errorMessage);
      setDeletingUserId(null);
      return;
    }

    setPlatformUsers((current) => current.filter((entry) => entry.id !== user.id));
    setUserNameDrafts((current) => {
      const next = { ...current };
      delete next[user.id];
      return next;
    });
    setStats((current) =>
      current
        ? {
            ...current,
            totals: {
              ...current.totals,
              users: Math.max(0, current.totals.users - 1)
            },
            recentUsers: current.recentUsers.filter((entry) => entry.id !== user.id)
          }
        : current
    );
    setDeletingUserId(null);
  }

  async function onUpsertRole(event: FormEvent) {
    event.preventDefault();
    if (!roleEmailInput.trim()) return;

    setMessage(null);

    const response = await fetch("/api/platform/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: roleEmailInput,
        role: roleInput
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload?.error?.message ?? "Failed to update role.");
      return;
    }

    setRoleEmailInput("");
    await refresh({ pageLoader: false, includeStats: false });
  }

  async function saveCyclesPerSemester() {
    setSavingCycles(true);

    try {
      const response = await fetch("/api/platform/program-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cyclesPerSemester })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to save cycle count.");
      }

      toast.success("Cycles per semester updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save cycle count.");
    } finally {
      setSavingCycles(false);
    }
  }

  async function onRemoveRole(email: string) {
    setMessage(null);
    const response = await fetch(`/api/platform/roles?email=${encodeURIComponent(email)}`, {
      method: "DELETE"
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload?.error?.message ?? "Failed to remove role.");
      return;
    }

    await refresh({ pageLoader: false, includeStats: false });
  }

  async function onResetCycles() {
    setResetError(null);
    setResettingCycles(true);
    try {
      const response = await fetch("/api/admin/reset-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESET CYCLES" })
      });
      const payload = await response.json();

      if (!response.ok) {
        setResetError(payload?.error?.message ?? "Failed to reset cycles.");
        return;
      }

      const deleted = payload?.data?.deleted ?? {};
      setMessage(
        `Cycles reset. Deleted ${deleted.grades ?? 0} grades, ${deleted.historyEvents ?? 0} history events, ${deleted.progressRows ?? 0} progress rows. Cleared ${payload?.data?.cyclesCleared ?? 0} cycle definitions.`
      );
      setResetDialogOpen(false);
      setResetConfirmInput("");
      await refresh({ pageLoader: false, includeStats: true });
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "Failed to reset cycles.");
    } finally {
      setResettingCycles(false);
    }
  }

  async function onQueueBackup() {
    setQueuingBackup(true);
    setMessage(null);
    try {
      const response = await fetch("/api/platform/backups/run", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        const errorMessage = payload?.error?.message ?? "Failed to queue backup.";
        setMessage(errorMessage);
        toast.error(errorMessage);
        return;
      }
      toast.success("Backup queued");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to queue backup.";
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setQueuingBackup(false);
    }
  }

  async function onDownloadBackup(key: string) {
    try {
      const payload = await getData<{ url: string }>(`/api/platform/backups/download?key=${encodeURIComponent(key)}`);
      window.location.href = payload.url;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to download backup.";
      setMessage(errorMessage);
      toast.error(errorMessage);
    }
  }

  async function onDecideAccessRequest(requestId: string, status: PlatformAccessRequestStatus) {
    if (status === "PENDING") {
      return;
    }

    setDecidingAccessRequestId(requestId);
    setMessage(null);

    const response = await fetch("/api/platform/access-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: requestId,
        status
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload?.error?.message ?? "Failed to update access request.");
      setDecidingAccessRequestId(null);
      return;
    }

    await refresh({ pageLoader: false, includeStats: false });
    setDecidingAccessRequestId(null);
    setMessage(status === "APPROVED" ? "Access request approved and user notified by email." : "Access request denied and user notified by email.");
  }

  async function onApproveAllPendingAccessRequests() {
    if (pendingAccessRequestCount === 0) {
      return;
    }

    const confirmed = window.confirm(`Approve all ${pendingAccessRequestCount} pending access requests?`);
    if (!confirmed) {
      return;
    }

    setApprovingAllPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/platform/access-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE_ALL_PENDING"
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload?.error?.message ?? "Failed to approve all pending access requests.");
        return;
      }

      const approvedCount = Number(payload?.data?.approvedCount ?? 0);
      await refresh({ pageLoader: false, includeStats: false });
      setMessage(approvedCount > 0 ? `Approved ${approvedCount} pending access requests and sent email notifications.` : "No pending access requests to approve.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to approve all pending access requests.");
    } finally {
      setApprovingAllPending(false);
    }
  }

  if (loading) {
    return (
      <div className="route-enter space-y-5">
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
          <div className="relative min-w-0">
            <div className="eyebrow flex items-center gap-2">
              <Shield className="h-3 w-3" />
              Platform
            </div>
            <h1 className="display-md mt-2 text-foreground">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Loading admin controls...</p>
          </div>
        </section>
      </div>
    );
  }

  if (!canManageAllowedEmails) {
    return (
      <div className="route-enter space-y-5">
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
          <div className="relative min-w-0">
            <div className="eyebrow flex items-center gap-2">
              <Shield className="h-3 w-3" />
              Platform
            </div>
            <h1 className="display-md mt-2 text-foreground">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">You do not have permission to manage platform settings.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="route-enter space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow flex items-center gap-2">
              <Shield className="h-3 w-3" />
              Platform
            </div>
            <h1 className="display-md mt-2 text-foreground">Admin Dashboard</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Add people by name and email, review access requests, and manage producer roles.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="meta-pill">
              <Shield className="h-3.5 w-3.5" />
              {formatRoleLabel(me?.role ?? null)}
            </span>
            <span className="meta-pill tabular-nums">{pendingAccessRequestCount} pending access</span>
          </div>
        </div>
        {message ? <p className="relative mt-3 text-sm text-amber-300">{message}</p> : null}
      </section>

      {stats ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-border bg-[rgb(10,10,10,0.55)] light:bg-card p-4">
            <p className="inline-flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Users
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold italic leading-none tracking-tight text-foreground tabular-nums">
              {stats.totals.users}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stats.totals.roleAssignments} elevated roles</p>
          </article>
          <article className="rounded-xl border border-border bg-[rgb(10,10,10,0.55)] light:bg-card p-4">
            <p className="inline-flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <FolderKanban className="h-3.5 w-3.5" />
              Workspaces
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold italic leading-none tracking-tight text-foreground tabular-nums">
              {stats.totals.workspaces}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stats.totals.projects} projects</p>
          </article>
          <article className="rounded-xl border border-border bg-[rgb(10,10,10,0.55)] light:bg-card p-4">
            <p className="inline-flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <FileVideo2 className="h-3.5 w-3.5" />
              Media
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold italic leading-none tracking-tight text-foreground tabular-nums">
              {stats.totals.activeMedia}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stats.totals.versions} versions tracked</p>
          </article>
          <article className="rounded-xl border border-border bg-[rgb(10,10,10,0.55)] light:bg-card p-4">
            <p className="inline-flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" />
              Storage
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold italic leading-none tracking-tight text-foreground tabular-nums">
              {formatStorage(stats.storage.estimatedBytes)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stats.storage.isEstimated ? "Estimated usage" : "Synced usage"}</p>
          </article>
          <article className="rounded-xl border border-border bg-[rgb(10,10,10,0.55)] light:bg-card p-4">
            <p className="inline-flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5" />
              Comments
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold italic leading-none tracking-tight text-foreground tabular-nums">
              {stats.totals.comments}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Review conversations</p>
          </article>
          <article className="rounded-xl border border-border bg-[rgb(10,10,10,0.55)] light:bg-card p-4">
            <p className="inline-flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" />
              Active Share Links
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold italic leading-none tracking-tight text-foreground tabular-nums">
              {stats.totals.activeShareLinks}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Guest access links</p>
          </article>
          <article className="rounded-xl border border-border bg-[rgb(10,10,10,0.55)] light:bg-card p-4">
            <p className="inline-flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <MailQuestion className="h-3.5 w-3.5" />
              Access Requests
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold italic leading-none tracking-tight text-foreground tabular-nums">
              {pendingAccessRequestCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Waiting for review</p>
          </article>
          <article className="rounded-xl border border-border bg-[rgb(10,10,10,0.55)] light:bg-card p-4">
            <p className="inline-flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              Data Health
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold italic leading-none tracking-tight text-foreground">Live</p>
            <p className="mt-1 text-xs text-muted-foreground">Numbers are fetched in real time</p>
          </article>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-4">
        <button
          type="button"
          onClick={() => setAccessRequestsOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={accessRequestsOpen}
        >
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <MailQuestion className="h-4 w-4" />
              Access Requests
              <span className="inline-flex items-center rounded-full border border-amber-300/45 bg-gradient-to-r from-amber-300/25 via-orange-300/15 to-amber-400/25 px-2 py-0.5 text-xs font-semibold text-amber-100">
                {pendingAccessRequestCount} pending
              </span>
            </h2>
            <p className="text-sm text-muted-foreground">
              People who tried to sign in before they were added. Approve to let them in, or add them yourself below.
            </p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${accessRequestsOpen ? "rotate-180" : ""}`} />
        </button>

        {accessRequestsOpen ? (
          <div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void onApproveAllPendingAccessRequests()}
                disabled={pendingAccessRequestCount === 0 || approvingAllPending || decidingAccessRequestId !== null}
                className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-60"
              >
                {approvingAllPending ? "Approving all..." : "Approve All Pending"}
              </button>
            </div>
            {sortedAccessRequests.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p>{entry.email}</p>
                    <p className="text-xs text-muted-foreground">{entry.name ?? "No name provided"}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                      entry.status === "PENDING"
                        ? "border-amber-300/35 bg-amber-400/10 text-amber-100"
                        : entry.status === "APPROVED"
                          ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-100"
                          : "border-rose-300/35 bg-rose-400/10 text-rose-100"
                    }`}
                  >
                    {entry.status === "PENDING" ? (
                      <Clock3 className="h-3.5 w-3.5" />
                    ) : entry.status === "APPROVED" ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    {formatAccessRequestStatusLabel(entry.status)}
                  </span>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">Requested {new Date(entry.requestedAt).toLocaleString()}</p>
                {entry.decidedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reviewed {new Date(entry.decidedAt).toLocaleString()}
                    {entry.decidedByEmail ? ` by ${entry.decidedByEmail}` : ""}
                  </p>
                ) : null}

                {entry.status === "PENDING" ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void onDecideAccessRequest(entry.id, "APPROVED")}
                      disabled={decidingAccessRequestId === entry.id || approvingAllPending}
                      className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-60"
                    >
                      {decidingAccessRequestId === entry.id ? "Saving..." : "Approve"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDecideAccessRequest(entry.id, "DENIED")}
                      disabled={decidingAccessRequestId === entry.id || approvingAllPending}
                      className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-60"
                    >
                      {decidingAccessRequestId === entry.id ? "Saving..." : "Deny"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {sortedAccessRequests.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                No access requests yet.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <UserPlus className="h-4 w-4" />
          People
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add someone with their name and email. They can then sign in with that Google account.
        </p>

        <form onSubmit={onAddPerson} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={inviteName}
            onChange={(event) => setInviteName(event.target.value)}
            placeholder="Full name"
            autoComplete="name"
            className="h-10 rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none"
          />
          <input
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="name@pausd.us"
            autoComplete="email"
            className="h-10 rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none"
          />
          <button
            className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            type="submit"
            disabled={addingPerson}
          >
            {addingPerson ? "Adding..." : "Add person"}
          </button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
            <input
              type="checkbox"
              checked={sendInviteEmail}
              onChange={(event) => setSendInviteEmail(event.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            Email them an invite to sign in
          </label>
        </form>

        <div className="mt-4">
          <input
            value={peopleQuery}
            onChange={(event) => setPeopleQuery(event.target.value)}
            placeholder="Search people"
            className="h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none"
          />
        </div>

        <div className="mt-3 max-h-[460px] space-y-2 overflow-auto pr-1">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p>{user.email ?? "No email"}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.name ? `Google: ${user.name} · ` : ""}
                    Added {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={userNameDrafts[user.id] ?? ""}
                  onChange={(event) =>
                    setUserNameDrafts((current) => ({
                      ...current,
                      [user.id]: event.target.value
                    }))
                  }
                  placeholder="Nickname shown around Portal"
                  className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none"
                />
                <button
                  type="button"
                  onClick={() => onSaveRegisteredUserName(user.id)}
                  disabled={savingUserNameId === user.id || deletingUserId === user.id}
                  className="rounded-lg border border-border bg-secondary px-3 text-sm font-semibold text-foreground disabled:opacity-60"
                >
                  {savingUserNameId === user.id ? "Saving..." : "Save nickname"}
                </button>
                <button
                  type="button"
                  onClick={() => void onDeleteRegisteredUser(user)}
                  disabled={deletingUserId === user.id || savingUserNameId === user.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 text-sm font-semibold text-destructive disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deletingUserId === user.id ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          ))}
          {filteredUsers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              {sortedUsers.length === 0 ? "No people yet. Add someone above." : "No people match that search."}
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <FolderKanban className="h-4 w-4" />
            Package Cycles
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            How many package cycles run each semester. This drives the progress sheet, cycle tabs, and
            the maximum points in the packages grade category.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={8}
              value={cyclesPerSemester}
              onChange={(event) => setCyclesPerSemester(Math.max(1, Number(event.target.value) || 1))}
              disabled={!canManageAllowedEmails}
              className="h-10 w-24 rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none disabled:opacity-50"
            />
            <span className="text-sm text-muted-foreground">cycles per semester</span>
            {canManageAllowedEmails ? (
              <button
                type="button"
                onClick={() => void saveCyclesPerSemester()}
                disabled={savingCycles}
                className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Save
              </button>
            ) : null}
          </div>
        </article>

        <article className="rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Users className="h-4 w-4" />
            Producer Team
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick someone already in People, then choose their role. Add them above first if they are missing.
          </p>

          {canManagePlatformRoles ? (
            <form onSubmit={onUpsertRole} className="mt-3 grid gap-2 sm:grid-cols-[1fr_170px_auto]">
              <select
                value={roleEmailInput}
                onChange={(event) => setRoleEmailInput(event.target.value)}
                className="h-10 rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none"
              >
                <option value="">Choose a person</option>
                {sortedUsers
                  .filter((user) => user.email)
                  .map((user) => (
                    <option key={user.id} value={user.email ?? ""}>
                      {user.nickname || user.name || user.email}
                    </option>
                  ))}
              </select>
              <select
                value={roleInput}
                onChange={(event) => setRoleInput(event.target.value as PlatformRole)}
                className="h-10 rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none"
              >
                <option value="ASSOCIATE_PRODUCER">Associate Producer</option>
                <option value="EXECUTIVE_PRODUCER">Executive Producer</option>
                <option value="ADVISER">Adviser</option>
              </select>
              <button
                className="rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
                type="submit"
              >
                Save
              </button>
            </form>
          ) : (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              <UserCog className="h-4 w-4" />
              Only super admin or the adviser can add or remove producer roles.
            </div>
          )}

          <div className="mt-3 space-y-2">
            {sortedRoles.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
              >
                <div>
                  <p>{entry.email}</p>
                  <p className="text-xs text-muted-foreground">{formatRoleLabel(entry.role)}</p>
                </div>
                {canManagePlatformRoles ? (
                  <button
                    type="button"
                    onClick={() => onRemoveRole(entry.email)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Remove role"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
            {sortedRoles.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                No producer roles assigned yet.
              </p>
            ) : null}
          </div>
        </article>
      </section>

      {canManagePlatformRoles ? (
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Database className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">Backups</h2>
                <p className="text-sm text-muted-foreground">
                  Hourly copies of Portal database data (people, packages, grades, calendar). Not InFocus Drive videos. Kept for 7 days.
                </p>
              </div>
            </div>
            {backups?.configured ? (
              <Button type="button" variant="outline" disabled={queuingBackup} onClick={() => void onQueueBackup()}>
                {queuingBackup ? "Queuing…" : "Backup now"}
              </Button>
            ) : null}
          </div>

          <div className="mt-3 space-y-3">
            {!backups ? (
              <p className="text-sm text-muted-foreground">Loading backups…</p>
            ) : !backups.configured ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                Backups are not configured. Set the R2 env vars on Vercel. Dumps are Portal database only, not Drive files.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {backups.latest == null
                    ? "No backups yet."
                    : backups.latest.ok
                      ? `Last run ok ${new Date(backups.latest.at).toLocaleString()}${
                          backups.latest.bytes != null ? ` · ${formatStorage(backups.latest.bytes)}` : ""
                        }${backups.latest.key ? ` · ${backups.latest.key}` : ""}`
                      : `Last run failed ${new Date(backups.latest.at).toLocaleString()}${
                          backups.latest.error ? ` · ${backups.latest.error}` : ""
                        }`}
                </p>
                {backups.dumps.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                    No dump files yet. Use Backup now, then refresh in a minute.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(showAllBackups ? backups.dumps : backups.dumps.slice(0, 3)).map((dump) => (
                      <div
                        key={dump.key}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
                      >
                        <div>
                          <p>{new Date(dump.lastModified).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatStorage(dump.bytes)} · {dump.key}
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => void onDownloadBackup(dump.key)}>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      </div>
                    ))}
                    {backups.dumps.length > 3 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full text-muted-foreground"
                        onClick={() => setShowAllBackups((open) => !open)}
                      >
                        {showAllBackups ? "Show less" : "Show more"}
                        <ChevronDown className={`ml-1 h-4 w-4 transition ${showAllBackups ? "rotate-180" : ""}`} />
                      </Button>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      ) : null}

      {canManagePlatformRoles ? (
        <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
              <p className="text-sm text-muted-foreground">
                Wipe all package grades, grade history, and package progress rows for cycles 1–4, and clear cycle dates and focus. Projects are not affected. This cannot be undone.
              </p>
            </div>
          </div>
          <div className="mt-3">
            <Button
              variant="destructive"
              onClick={() => {
                setResetError(null);
                setResetConfirmInput("");
                setResetDialogOpen(true);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Reset all cycles…
            </Button>
          </div>

          <Dialog
            open={resetDialogOpen}
            onOpenChange={(open) => {
              if (!open && resettingCycles) return;
              setResetDialogOpen(open);
              if (!open) {
                setResetConfirmInput("");
                setResetError(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset all cycles</DialogTitle>
                <DialogDescription>
                  This permanently deletes every package grade, grade history event, and package progress row across all four cycles, and clears each cycle&apos;s focus and dates. Projects are not affected. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label htmlFor="reset-cycles-confirm" className="text-sm text-foreground">
                  Type <span className="font-mono font-semibold">RESET CYCLES</span> to enable the button.
                </label>
                <input
                  id="reset-cycles-confirm"
                  type="text"
                  value={resetConfirmInput}
                  onChange={(event) => setResetConfirmInput(event.target.value)}
                  disabled={resettingCycles}
                  autoComplete="off"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none"
                  placeholder="RESET CYCLES"
                />
                {resetError ? <p className="text-sm text-destructive">{resetError}</p> : null}
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setResetDialogOpen(false)}
                  disabled={resettingCycles}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void onResetCycles()}
                  disabled={resettingCycles || resetConfirmInput !== "RESET CYCLES"}
                >
                  {resettingCycles ? "Resetting…" : "Reset cycles"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      ) : null}
    </div>
  );
}
