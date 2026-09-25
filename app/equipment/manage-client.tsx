"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, RefreshCw, UserPlus, X } from "lucide-react";
import { EquipmentPasskeySettings } from "@/components/equipment-passkeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/src/lib/utils";
import { userDisplayName } from "@/src/lib/user-display";

type Tab = "out" | "inventory" | "requests" | "overdue" | "settings";

type Status = { type: "error" | "success" | "info"; text: string } | null;

type StudentRef = {
  id: string;
  name: string | null;
  studentId: string;
  email?: string | null;
};

type EquipmentItem = {
  id: string;
  name: string;
  barcode: string;
  checkedOut: boolean;
  tookSdCard?: boolean | null;
  checkedOutAt: string | null;
  checkedOutById: string | null;
  onHoldForStudentId: string | null;
  holdRequestId: string | null;
  archivedAt: string | null;
  checkedOutBy?: StudentRef | null;
  onHoldForStudent?: StudentRef | null;
};

type RequestRow = {
  id: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  email: string;
  createdAt: string;
  student: StudentRef | null;
  items: Array<{
    id: string;
    item: EquipmentItem;
  }>;
};

type ManagerRow = {
  id: string;
  userId: string;
  createdAt: string;
  user: { id: string; name: string | null; nickname?: string | null; email: string | null } | null;
};

type HubUser = {
  id: string;
  name: string | null;
  nickname?: string | null;
  email: string | null;
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "out", label: "Out" },
  { id: "inventory", label: "Inventory" },
  { id: "requests", label: "Requests" },
  { id: "overdue", label: "Overdue" },
  { id: "settings", label: "Settings" }
];

const OVERDUE_AFTER_MS = 72 * 60 * 60 * 1000;

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok) {
    throw new Error(body?.error?.message || "Request failed");
  }
  return body?.data as T;
}

function FormMessage({ status }: { status: Status }) {
  if (!status?.text) {
    return null;
  }
  const color =
    status.type === "error"
      ? "border-[rgb(238,58,42,0.4)] bg-[rgb(238,58,42,0.12)] text-[var(--brand-red)]"
      : status.type === "success"
        ? "border-[rgb(43,179,110,0.3)] bg-[rgb(43,179,110,0.12)] text-[var(--brand-green)]"
        : "border-border bg-card text-muted-foreground";
  return <p className={cn("rounded-md border px-3 py-2 text-sm", color)}>{status.text}</p>;
}

function itemStatus(item: Pick<EquipmentItem, "checkedOut" | "onHoldForStudentId">): "out" | "held" | "in" {
  if (item.checkedOut) {
    return "out";
  }
  if (item.onHoldForStudentId) {
    return "held";
  }
  return "in";
}

function StatusPill({ status }: { status: "out" | "held" | "in" }) {
  const cls =
    status === "out"
      ? "border-[rgb(238,58,42,0.4)] bg-[rgb(238,58,42,0.18)] text-[var(--brand-red)]"
      : status === "held"
        ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
        : "border-[rgb(43,179,110,0.3)] bg-[rgb(43,179,110,0.18)] text-[var(--brand-green)]";
  const label = status === "out" ? "Out" : status === "held" ? "Held" : "In";
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", cls)}>{label}</span>
  );
}

function studentLabel(person: StudentRef | null | undefined) {
  if (!person) {
    return "—";
  }
  return person.name?.trim() || person.studentId || "Unknown";
}

function hubLabel(person: { name?: string | null; nickname?: string | null; email?: string | null } | null | undefined) {
  if (!person) {
    return "—";
  }
  return userDisplayName(person) || person.email || "Member";
}

function formatWhen(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

function hoursOutLabel(iso: string | null | undefined) {
  if (!iso) {
    return "—";
  }
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return "0h";
  }
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function remainingHolds(request: RequestRow) {
  return request.items.filter((entry) => entry.item.holdRequestId === request.id && entry.item.onHoldForStudentId).length;
}

function anyItemOut(request: RequestRow) {
  return request.items.some((entry) => entry.item.checkedOut);
}

function isFulfilled(request: RequestRow) {
  return request.status === "APPROVED" && remainingHolds(request) === 0;
}

function canShowDeny(request: RequestRow) {
  if (request.status === "PENDING") {
    return true;
  }
  if (request.status === "DENIED") {
    return false;
  }
  return !anyItemOut(request) && !isFulfilled(request);
}

function canShowApprove(request: RequestRow) {
  return (
    request.status === "PENDING" &&
    request.items.length > 0 &&
    request.items.every((entry) => !entry.item.archivedAt && !entry.item.checkedOut && !entry.item.onHoldForStudentId)
  );
}

function requestStatusLabel(request: RequestRow) {
  if (isFulfilled(request)) {
    return "Fulfilled";
  }
  if (request.status === "PENDING") {
    return "Pending";
  }
  if (request.status === "APPROVED") {
    return "Approved";
  }
  return "Denied";
}

function isOverdueItem(item: EquipmentItem, now: number) {
  if (!item.checkedOut || !item.checkedOutAt) {
    return false;
  }
  return new Date(item.checkedOutAt).getTime() <= now - OVERDUE_AFTER_MS;
}

export default function EquipmentManageClient() {
  const [tab, setTab] = useState<Tab>("out");
  const [outItems, setOutItems] = useState<EquipmentItem[]>([]);
  const [inventory, setInventory] = useState<EquipmentItem[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [users, setUsers] = useState<HubUser[]>([]);
  const [canAppoint, setCanAppoint] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", barcode: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", barcode: "" });
  const [managerPick, setManagerPick] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const load = useCallback(async (current: Tab) => {
    setLoading(true);
    setStatus(null);
    try {
      if (current === "out" || current === "overdue") {
        const data = await readJson<{ items: EquipmentItem[] }>(await fetch("/api/equipment/manage/out"));
        setOutItems(data.items ?? []);
        setNow(Date.now());
      } else if (current === "inventory") {
        const data = await readJson<{ items: EquipmentItem[] }>(await fetch("/api/equipment/manage/items"));
        setInventory(data.items ?? []);
      } else if (current === "requests") {
        const data = await readJson<{ requests: RequestRow[] }>(await fetch("/api/equipment/manage/requests"));
        setRequests(data.requests ?? []);
      } else {
        const [managerPayload, me] = await Promise.all([
          readJson<{ managers: ManagerRow[] }>(await fetch("/api/equipment/manage/managers")),
          readJson<{ role: string | null }>(await fetch("/api/platform/me"))
        ]);
        setManagers(managerPayload.managers ?? []);
        const appoint = Boolean(me.role);
        setCanAppoint(appoint);
        if (appoint) {
          const roster = await readJson<HubUser[]>(await fetch("/api/platform/users"));
          setUsers(Array.isArray(roster) ? roster : []);
        }
      }
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Could not load." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  const overdueItems = useMemo(() => outItems.filter((item) => isOverdueItem(item, now)), [outItems, now]);

  const sortedRequests = useMemo(() => {
    const pending = requests.filter((row) => row.status === "PENDING");
    const rest = requests.filter((row) => row.status !== "PENDING");
    return [...pending, ...rest];
  }, [requests]);

  const filteredUsers = useMemo(() => {
    const appointed = new Set(managers.map((row) => row.userId));
    const query = memberQuery.trim().toLowerCase();
    return users.filter((user) => {
      if (appointed.has(user.id)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const label = hubLabel(user).toLowerCase();
      return label.includes(query) || (user.email ?? "").toLowerCase().includes(query);
    });
  }, [users, managers, memberQuery]);

  async function patchOut(action: "force-return" | "release-hold", itemId: string) {
    setBusy(true);
    setStatus(null);
    try {
      await readJson(
        await fetch("/api/equipment/manage/out", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, itemId })
        })
      );
      setStatus({ type: "success", text: action === "force-return" ? "Item returned." : "Hold released." });
      await load(tab === "overdue" ? "overdue" : "out");
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Update failed." });
    } finally {
      setBusy(false);
    }
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await readJson(
        await fetch("/api/equipment/manage/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newItem.name.trim(), barcode: newItem.barcode.trim() })
        })
      );
      setNewItem({ name: "", barcode: "" });
      setStatus({ type: "success", text: "Item added." });
      await load("inventory");
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Could not add item." });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setStatus(null);
    try {
      await readJson(
        await fetch("/api/equipment/manage/items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, name: editDraft.name.trim(), barcode: editDraft.barcode.trim() })
        })
      );
      setEditingId(null);
      setStatus({ type: "success", text: "Item updated." });
      await load("inventory");
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Could not update item." });
    } finally {
      setBusy(false);
    }
  }

  async function archiveItem(id: string) {
    setBusy(true);
    setStatus(null);
    try {
      await readJson(
        await fetch("/api/equipment/manage/items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, archived: true })
        })
      );
      setStatus({ type: "success", text: "Item archived." });
      await load("inventory");
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Could not archive item." });
    } finally {
      setBusy(false);
    }
  }

  async function decideRequest(id: string, action: "approve" | "deny") {
    setBusy(true);
    setStatus(null);
    try {
      await readJson(
        await fetch("/api/equipment/manage/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action })
        })
      );
      setStatus({ type: "success", text: action === "approve" ? "Request approved." : "Request denied." });
      await load("requests");
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Could not update request." });
    } finally {
      setBusy(false);
    }
  }

  async function addManager() {
    if (!managerPick) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await readJson(
        await fetch("/api/equipment/manage/managers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: managerPick })
        })
      );
      setManagerPick("");
      setStatus({ type: "success", text: "Manager added." });
      await load("settings");
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Could not add manager." });
    } finally {
      setBusy(false);
    }
  }

  async function removeManager(userId: string) {
    setBusy(true);
    setStatus(null);
    try {
      await readJson(
        await fetch(`/api/equipment/manage/managers?userId=${encodeURIComponent(userId)}`, { method: "DELETE" })
      );
      setStatus({ type: "success", text: "Manager removed." });
      await load("settings");
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Could not remove manager." });
    } finally {
      setBusy(false);
    }
  }

  function renderOutTable(items: EquipmentItem[], mode: "out" | "overdue") {
    if (items.length === 0) {
      return <p className="text-sm text-muted-foreground">{mode === "overdue" ? "No overdue items." : "Nothing is out or held."}</p>;
    }

    return (
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-card">
            <tr className="border-b border-border">
              {["Item", "Code", "Status", "Borrower", "SD card (batch)", "Since", "Out for", ""].map((heading) => (
                <th
                  key={heading || "actions"}
                  className="px-3 py-2 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const statusValue = itemStatus(item);
              const borrower = statusValue === "held" ? item.onHoldForStudent : item.checkedOutBy;
              return (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-foreground">{item.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.barcode}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={statusValue} />
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    <div>{studentLabel(borrower)}</div>
                    {borrower?.studentId ? (
                      <div className="text-[11px] text-muted-foreground">{borrower.studentId}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.tookSdCard === true ? "Yes" : item.tookSdCard === false ? "No" : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatWhen(item.checkedOutAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {statusValue === "out" ? hoursOutLabel(item.checkedOutAt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {statusValue === "out" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void patchOut("force-return", item.id)}
                      >
                        Force-return
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void patchOut("release-hold", item.id)}
                      >
                        Release hold
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black uppercase italic tracking-tight text-foreground">Manage</h1>
          <p className="mt-1 text-sm text-muted-foreground">Inventory, requests, overdue items, and station settings.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load(tab)} disabled={loading || busy}>
          <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
          Refresh
        </Button>
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-full border border-border bg-card p-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[13px] font-medium transition",
              tab === entry.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {loading && outItems.length + inventory.length + requests.length + managers.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--brand-green)]" />
          Loading…
        </div>
      ) : (
        <>
          {tab === "out" ? (
            <Card>
              <CardHeader>
                <CardTitle>Out</CardTitle>
                <CardDescription>Who has what, since when, held vs out.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderOutTable(outItems, "out")}
                <FormMessage status={status} />
              </CardContent>
            </Card>
          ) : null}

          {tab === "overdue" ? (
            <Card>
              <CardHeader>
                <CardTitle>Overdue</CardTitle>
                <CardDescription>Out for 72 hours or more.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderOutTable(overdueItems, "overdue")}
                <FormMessage status={status} />
              </CardContent>
            </Card>
          ) : null}

          {tab === "inventory" ? (
            <Card>
              <CardHeader>
                <CardTitle>Inventory</CardTitle>
                <CardDescription>Add items by name and code. Archive only when in.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={addItem}>
                  <div className="space-y-2">
                    <Label htmlFor="new-item-name">Name (e.g. Canon T8i)</Label>
                    <Input
                      id="new-item-name"
                      value={newItem.name}
                      onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-item-code">Code</Label>
                    <Input
                      id="new-item-code"
                      value={newItem.barcode}
                      onChange={(event) => setNewItem((prev) => ({ ...prev, barcode: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" disabled={busy}>
                      Add
                    </Button>
                  </div>
                </form>

                <div className="overflow-auto rounded-lg border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-card">
                      <tr className="border-b border-border">
                        {["Item", "Code", "Status", ""].map((heading) => (
                          <th
                            key={heading || "actions"}
                            className="px-3 py-2 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                            No items yet.
                          </td>
                        </tr>
                      ) : (
                        inventory.map((item) => {
                          const statusValue = itemStatus(item);
                          const editing = editingId === item.id;
                          return (
                            <tr key={item.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-2">
                                {editing ? (
                                  <Input
                                    value={editDraft.name}
                                    onChange={(event) => setEditDraft((prev) => ({ ...prev, name: event.target.value }))}
                                  />
                                ) : (
                                  <span className="text-foreground">{item.name}</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {editing ? (
                                  <Input
                                    value={editDraft.barcode}
                                    onChange={(event) => setEditDraft((prev) => ({ ...prev, barcode: event.target.value }))}
                                    className="font-mono"
                                  />
                                ) : (
                                  <span className="font-mono text-xs text-muted-foreground">{item.barcode}</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <StatusPill status={statusValue} />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {editing ? (
                                    <>
                                      <Button type="button" size="sm" disabled={busy} onClick={() => void saveEdit(item.id)}>
                                        Save
                                      </Button>
                                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
                                        Cancel
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setEditingId(item.id);
                                          setEditDraft({ name: item.name, barcode: item.barcode });
                                        }}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        disabled={busy || statusValue !== "in"}
                                        onClick={() => void archiveItem(item.id)}
                                      >
                                        Archive
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <FormMessage status={status} />
              </CardContent>
            </Card>
          ) : null}

          {tab === "requests" ? (
            <Card>
              <CardHeader>
                <CardTitle>Requests</CardTitle>
                <CardDescription>Approve or deny the whole request. Pending first.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {sortedRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No requests.</p>
                ) : (
                  <div className="space-y-3">
                    {sortedRequests.map((request) => (
                      <div key={request.id} className="rounded-xl border border-border bg-card/60 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-foreground">{studentLabel(request.student)}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {request.student?.studentId ?? "—"} · {request.email} · {formatWhen(request.createdAt)}
                            </div>
                          </div>
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            {requestStatusLabel(request)}
                          </span>
                        </div>
                        <ul className="mt-3 space-y-1 text-sm">
                          {request.items.map((entry) => (
                            <li key={entry.id} className="flex flex-wrap items-center gap-2">
                              <span className="text-foreground">{entry.item.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">{entry.item.barcode}</span>
                              <StatusPill status={itemStatus(entry.item)} />
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canShowApprove(request) ? (
                            <Button type="button" size="sm" disabled={busy} onClick={() => void decideRequest(request.id, "approve")}>
                              Approve
                            </Button>
                          ) : null}
                          {canShowDeny(request) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={busy}
                              onClick={() => void decideRequest(request.id, "deny")}
                            >
                              Deny
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <FormMessage status={status} />
              </CardContent>
            </Card>
          ) : null}

          {tab === "settings" ? (
            <div className="space-y-5">
              <EquipmentPasskeySettings />
              <p className="text-sm text-muted-foreground">Checkout uses a separate manager Google sign-in and automatically locks after one hour.</p>

              <Card>
                <CardHeader>
                  <CardTitle>Managers</CardTitle>
                  <CardDescription>
                    Producers appoint extra managers. Appointed managers can run inventory and requests but cannot appoint others.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {managers.map((row) => (
                      <span
                        key={row.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground"
                      >
                        {hubLabel(row.user)}
                        {canAppoint ? (
                          <button
                            type="button"
                            className="text-muted-foreground transition hover:text-[var(--brand-red)]"
                            onClick={() => void removeManager(row.userId)}
                            aria-label={`Remove ${hubLabel(row.user)}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </span>
                    ))}
                    {!managers.length ? <span className="text-xs text-muted-foreground">No extra managers yet.</span> : null}
                  </div>

                  {canAppoint ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-2">
                        <Label htmlFor="manager-search">Find member</Label>
                        <Input
                          id="manager-search"
                          value={memberQuery}
                          onChange={(event) => setMemberQuery(event.target.value)}
                          placeholder="Search name or email"
                          className="w-[220px]"
                        />
                      </div>
                      <select
                        className="h-9 min-w-[240px] rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
                        value={managerPick}
                        onChange={(event) => setManagerPick(event.target.value)}
                      >
                        <option value="">Add manager…</option>
                        {filteredUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {hubLabel(user)}
                          </option>
                        ))}
                      </select>
                      <Button type="button" size="sm" onClick={() => void addManager()} disabled={!managerPick || busy}>
                        <UserPlus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              <FormMessage status={status} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
