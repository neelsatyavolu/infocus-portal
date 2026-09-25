"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/src/lib/utils";

type ExtensionCycleDetail = {
  cycleNumber: number;
  focus: string;
  finalCutDate: string | null;
  turnedInDate: string | null;
  calculatedDays: number;
  appliedDays: number;
  exempt: boolean;
  effectiveAppliedDays: number;
};

type ExtensionUserDetail = {
  userId: string;
  name: string | null;
  email: string | null;
  usedDays: number;
  remainingDays: number;
  cycles: ExtensionCycleDetail[];
};

type ExtensionsPayload = {
  startingDays: number;
  users: ExtensionUserDetail[];
};

type CycleDraft = {
  appliedDays: number;
  exempt: boolean;
};

type RoleFilter = "all" | "editor" | "reporter" | "over";

const AVATAR_PALETTE = ["av-green", "av-red", "av-blue", "av-purple", "av-gray"] as const;

async function fetchExtensions() {
  const response = await fetch("/api/extensions/admin", { cache: "no-store" });
  const payload = (await response.json()) as { data?: ExtensionsPayload; error?: { message?: string } };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load extensions.");
  }

  return payload.data;
}

function userLabel(user: ExtensionUserDetail) {
  return user.name?.trim() || user.email || "Unnamed user";
}

function userInitials(user: ExtensionUserDetail) {
  const label = userLabel(user);
  return (
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "??"
  );
}

function formatShortDate(value: string | null) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function inferRole(user: ExtensionUserDetail): "Editor" | "Reporter" {
  // Heuristic: members with more than 2 tracked cycles act as editors.
  return user.cycles.length >= 3 ? "Editor" : "Reporter";
}

export default function ExtensionsClient() {
  const [data, setData] = useState<ExtensionsPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [savingCycleNumber, setSavingCycleNumber] = useState<number | null>(null);
  const [draftByCycle, setDraftByCycle] = useState<Record<number, CycleDraft>>({});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setLoading(true);
      }
      setMessage(null);
      const next = await fetchExtensions();
      setData(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load extensions.");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const allowance = data?.startingDays ?? 14;

  const orderedUsers = useMemo(() => {
    return [...(data?.users ?? [])].sort((a, b) => userLabel(a).localeCompare(userLabel(b)));
  }, [data]);

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return orderedUsers.filter((user) => {
      if (needle) {
        const haystack = `${userLabel(user)} ${user.email ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      const role = inferRole(user);
      if (roleFilter === "editor" && role !== "Editor") return false;
      if (roleFilter === "reporter" && role !== "Reporter") return false;
      if (roleFilter === "over" && user.remainingDays >= 0) return false;
      return true;
    });
  }, [orderedUsers, search, roleFilter]);

  const totals = useMemo(() => {
    const totalUsed = orderedUsers.reduce((sum, u) => sum + u.usedDays, 0);
    const overCount = orderedUsers.filter((u) => u.remainingDays < 0).length;
    return { totalUsed, overCount };
  }, [orderedUsers]);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return orderedUsers.find((user) => user.userId === selectedUserId) ?? null;
  }, [orderedUsers, selectedUserId]);

  function openUser(user: ExtensionUserDetail) {
    setSelectedUserId(user.userId);
    setDraftByCycle(
      user.cycles.reduce<Record<number, CycleDraft>>((acc, cycle) => {
        acc[cycle.cycleNumber] = {
          appliedDays: cycle.appliedDays,
          exempt: cycle.exempt
        };
        return acc;
      }, {})
    );
  }

  function updateDraft(cycleNumber: number, patch: Partial<CycleDraft>) {
    setDraftByCycle((current) => ({
      ...current,
      [cycleNumber]: {
        appliedDays: current[cycleNumber]?.appliedDays ?? 0,
        exempt: current[cycleNumber]?.exempt ?? false,
        ...patch
      }
    }));
  }

  function isCycleDirty(cycle: ExtensionCycleDetail) {
    const draft = draftByCycle[cycle.cycleNumber];
    if (!draft) return false;
    return draft.appliedDays !== cycle.appliedDays || draft.exempt !== cycle.exempt;
  }

  async function saveCycle(cycleNumber: number) {
    if (!selectedUser) return;

    const draft = draftByCycle[cycleNumber];
    if (!draft) return;

    try {
      setSavingCycleNumber(cycleNumber);
      setMessage(null);

      const response = await fetch("/api/extensions/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateUsage",
          userId: selectedUser.userId,
          cycleNumber,
          appliedDays: Math.max(0, Math.round(draft.appliedDays || 0)),
          exempt: draft.exempt
        })
      });

      const payload = (await response.json()) as { data?: ExtensionsPayload; error?: { message?: string } };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to save extension usage.");
      }

      setData(payload.data);
      const updatedUser = payload.data.users.find((entry) => entry.userId === selectedUser.userId) ?? null;
      if (updatedUser) {
        setDraftByCycle(
          updatedUser.cycles.reduce<Record<number, CycleDraft>>((acc, cycle) => {
            acc[cycle.cycleNumber] = {
              appliedDays: cycle.appliedDays,
              exempt: cycle.exempt
            };
            return acc;
          }, {})
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save extension usage.");
    } finally {
      setSavingCycleNumber(null);
    }
  }

  function exportCsv() {
    const escapeCsvField = (value: unknown): string => {
      const raw = value === null || value === undefined ? "" : String(value);
      const sanitized = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
      return `"${sanitized.replace(/"/g, '""')}"`;
    };
    const header = ["Member", "Email", "Role", "Used", "Remaining"].map(escapeCsvField).join(",");
    const lines = orderedUsers.map((user) =>
      [
        userLabel(user),
        user.email ?? "",
        inferRole(user),
        user.usedDays,
        user.remainingDays
      ]
        .map(escapeCsvField)
        .join(",")
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extensions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="route-enter mx-auto w-full max-w-7xl space-y-5">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
          <div className="min-w-0">
            <div className="eyebrow">Spring &apos;26 · Admin</div>
            <h1 className="display-md mt-2 text-foreground">Extension Days</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Each member starts with{" "}
              <strong className="text-foreground">{allowance} extension days</strong> per semester. Click a member&apos;s
              remaining count to edit per-cycle usage or mark cycles as exempt.
            </p>
          </div>
          <ExtensionStat label="Allowance" value={`${allowance}d`} />
          <ExtensionStat label="Total used" value={`${totals.totalUsed}d`} tone="warn" />
          <ExtensionStat label="Over allotment" value={`${totals.overCount}`} tone="danger" />
        </div>

        <div className="relative mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadData({ silent: true })}
            className="gap-2"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={exportCsv} className="gap-2">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>

        {message ? (
          <p className="relative mt-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}
      </section>

      {/* Roster */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search members…"
              className="h-9 w-56 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--brand-green)]"
            />
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1 text-sm">
              {(
                [
                  ["all", "All members"],
                  ["editor", "Editors"],
                  ["reporter", "Reporters"],
                  ["over", "Over allotment"]
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRoleFilter(value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition",
                    roleFilter === value
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono-broadcast text-xs text-muted-foreground">
            <span>
              {filteredUsers.length} member{filteredUsers.length === 1 ? "" : "s"}
            </span>
            <span className="text-[var(--ink-4)]">·</span>
            <span>sorted by name</span>
          </div>
        </div>

        {loading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading extensions...</p>
        ) : filteredUsers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No members match this view.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-[hsl(var(--background))] px-4 py-2 text-left font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Member
                </th>
                <th className="bg-[hsl(var(--background))] px-4 py-2 text-left font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Role
                </th>
                <th className="bg-[hsl(var(--background))] px-4 py-2 text-left font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Used
                </th>
                <th className="bg-[hsl(var(--background))] px-4 py-2 text-left font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Usage
                </th>
                <th className="bg-[hsl(var(--background))] px-4 py-2 pr-6 text-right font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Remaining
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, index) => {
                const remaining = user.remainingDays;
                const remTone =
                  remaining < 0
                    ? "rem-pill-over"
                    : remaining <= 3
                      ? "rem-pill-warn"
                      : "rem-pill-ok";
                const barTone =
                  user.usedDays > allowance
                    ? "bg-[var(--brand-red)]"
                    : user.usedDays >= allowance - 3
                      ? "bg-[var(--brand-amber)]"
                      : "bg-[var(--brand-green)]";
                const pct = Math.min(100, Math.max(0, (user.usedDays / Math.max(1, allowance)) * 100));
                const palette = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
                const role = inferRole(user);
                return (
                  <tr
                    key={user.userId}
                    className="cursor-pointer border-b border-[hsl(var(--border))]/60 transition hover:bg-[hsl(var(--background))]"
                    onClick={() => openUser(user)}
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "grid h-8 w-8 place-items-center rounded-full text-xs font-bold",
                            palette
                          )}
                        >
                          {userInitials(user)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{userLabel(user)}</div>
                          <div className="font-mono-broadcast text-[11px] text-muted-foreground">
                            {user.email ?? "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className="status-pill status-neutral">{role}</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className="font-mono-broadcast text-sm font-semibold text-foreground">{user.usedDays}d</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[hsl(var(--secondary))]">
                        <div className={cn("h-full rounded-full", barTone)} style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 pr-6 text-right align-middle">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openUser(user);
                        }}
                        className={cn(
                          "rounded-md border px-3 py-1 font-mono-broadcast text-sm font-bold transition",
                          remTone
                        )}
                      >
                        {remaining}d
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <Dialog
        open={Boolean(selectedUser)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelectedUserId(null);
        }}
      >
        <DialogContent className="max-w-5xl bg-[hsl(var(--card))] p-0">
          <DialogHeader className="border-b border-border px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="display-sm text-foreground">
                  {selectedUser ? `Extension Sources · ${userLabel(selectedUser)}` : "Extension Sources"}
                </DialogTitle>
                <DialogDescription>
                  Edit applied extension days per cycle, or mark a cycle as exempt.
                </DialogDescription>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedUserId(null)}
                className="grid h-8 w-8 place-items-center rounded-md border border-border bg-secondary text-foreground hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </DialogHeader>
          {selectedUser ? (
            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryPill label="Allowance" value={`${allowance}d`} />
                <SummaryPill label="Used" value={`${selectedUser.usedDays}d`} />
                <SummaryPill
                  label="Remaining"
                  value={`${selectedUser.remainingDays}d`}
                  tone={selectedUser.remainingDays < 0 ? "over" : "ok"}
                />
                <SummaryPill label="Cycles tracked" value={`${selectedUser.cycles.length}`} />
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-[hsl(var(--background))]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Cycle", "Final Cut", "Turned In", "Calc.", "Applied", "Exempt", "Effective", ""].map((label) => (
                        <th
                          key={label}
                          className="bg-[hsl(var(--card))] px-3 py-2 text-left font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedUser.cycles.map((cycle) => {
                      const draft =
                        draftByCycle[cycle.cycleNumber] ?? { appliedDays: cycle.appliedDays, exempt: cycle.exempt };
                      const effective = draft.exempt ? 0 : Math.max(0, Math.round(draft.appliedDays || 0));
                      const dirty = isCycleDirty(cycle);
                      const saving = savingCycleNumber === cycle.cycleNumber;
                      return (
                        <tr key={cycle.cycleNumber} className="border-t border-[hsl(var(--border))]/60">
                          <td className="px-3 py-2 align-middle">
                            <div className="text-sm font-semibold text-foreground">Cycle {cycle.cycleNumber}</div>
                            <div className="text-xs text-muted-foreground">
                              {cycle.focus?.trim() ? cycle.focus : "No focus set"}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-middle font-mono-broadcast text-xs text-foreground">
                            {formatShortDate(cycle.finalCutDate)}
                          </td>
                          <td className="px-3 py-2 align-middle font-mono-broadcast text-xs text-foreground">
                            {formatShortDate(cycle.turnedInDate)}
                          </td>
                          <td className="px-3 py-2 align-middle font-mono-broadcast text-xs text-foreground">
                            {cycle.calculatedDays}d
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <input
                              type="number"
                              min={0}
                              value={draft.appliedDays}
                              onChange={(event) => {
                                const next = Number(event.target.value);
                                updateDraft(cycle.cycleNumber, {
                                  appliedDays: Number.isFinite(next) ? Math.max(0, next) : 0
                                });
                              }}
                              className="h-8 w-16 rounded-md border border-border bg-secondary px-2 font-mono-broadcast text-xs font-semibold text-foreground outline-none focus:border-[var(--brand-green)]"
                            />
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <label className="inline-flex items-center gap-2 text-xs text-foreground">
                              <input
                                type="checkbox"
                                checked={draft.exempt}
                                onChange={(event) =>
                                  updateDraft(cycle.cycleNumber, { exempt: event.target.checked })
                                }
                                className="h-3.5 w-3.5 accent-[var(--brand-green)]"
                              />
                              Exempt
                            </label>
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 align-middle font-mono-broadcast text-sm font-bold",
                              draft.exempt ? "text-muted-foreground" : "text-[var(--brand-green)]"
                            )}
                          >
                            {effective}d
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <button
                              type="button"
                              onClick={() => void saveCycle(cycle.cycleNumber)}
                              disabled={!dirty || saving}
                              className={cn(
                                "rounded-md px-3 py-1 text-xs font-bold transition",
                                dirty
                                  ? "bg-[var(--brand-green)] text-[var(--ink)] hover:bg-[var(--brand-green-deep)]"
                                  : "bg-[var(--ink-4)] text-muted-foreground"
                              )}
                            >
                              {saving ? "Saving…" : dirty ? "Save" : "Saved"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExtensionStat({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "warn" | "danger";
}) {
  const valueClass =
    tone === "warn" ? "text-[var(--brand-amber)]" : tone === "danger" ? "text-[var(--brand-red)]" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-[rgb(10,10,10,0.55)] light:bg-muted px-4 py-3 backdrop-blur min-w-[140px]">
      <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-display italic text-2xl font-extrabold leading-none tracking-tight", valueClass)}>
        {value}
      </div>
    </div>
  );
}

function SummaryPill({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "ok" | "over";
}) {
  const valueClass =
    tone === "over" ? "text-[var(--brand-red)]" : tone === "ok" ? "text-[var(--brand-green)]" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-[hsl(var(--card))] px-4 py-3">
      <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono-broadcast text-lg font-semibold", valueClass)}>{value}</div>
    </div>
  );
}
