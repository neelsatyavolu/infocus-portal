"use client";

import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Edit3, ExternalLink, Plus, RefreshCcw, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { extractMentionUserIds, parseGroupMembers } from "@/src/lib/group-members";
import { PACKAGE_ROSTER_NOTE_MAX } from "@/src/lib/package-roster-notes";
import { cn } from "@/src/lib/utils";
import { consecutiveGroupmateOverlaps } from "@/src/lib/consecutive-groupmates";
import {
  exclusiveProducerAssignment,
  mergeAssignableProducerOptions,
  selectedAssignedProducerId
} from "@/src/lib/package-producer-assignment";
import { MembersEditor, type MembersEditorUser } from "./members-editor";

const MEMBERS_CHIP_CLASS =
  "mention-chip inline-flex items-center rounded-full bg-secondary text-foreground align-baseline text-[12px] font-medium leading-none px-2 py-[3px] mx-[1px]";

function GroupMembersDisplay({
  value,
  memberUserIds,
  users
}: {
  value: string;
  memberUserIds?: string[];
  users: MembersEditorUser[];
}) {
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const linked = useMemo(
    () =>
      (memberUserIds ?? [])
        .map((id) => usersById.get(id))
        .filter((user): user is MembersEditorUser => Boolean(user)),
    [memberUserIds, usersById]
  );
  const tokens = useMemo(() => parseGroupMembers(value), [value]);

  if (linked.length > 0) {
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-1">
        {linked.map((user) => {
          const label =
            user.name?.trim().split(/\s+/)[0] || user.email?.split("@")[0] || "User";
          return (
            <span key={user.id} className={MEMBERS_CHIP_CLASS}>
              {label}
            </span>
          );
        })}
      </span>
    );
  }

  if (!value) return <>No reporters</>;
  if (tokens.length === 0) return <>{value}</>;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {tokens.map((token, index) => {
        if (token.kind === "user") {
          return (
            <span key={`u-${index}-${token.userId}`} className={MEMBERS_CHIP_CLASS}>
              {token.firstName}
            </span>
          );
        }
        return <span key={`t-${index}`}>{token.value}</span>;
      })}
    </span>
  );
}

type CycleTab = {
  cycleNumber: number;
  focus: string;
};

type AssignableProducer = {
  userId: string;
  name: string | null;
  email: string | null;
  category?: "NEWS" | "FEATURE" | "COMMENTARY" | null;
};

type AssignedUser = {
  userId: string;
  name: string | null;
  email: string | null;
};

type ProgressRow = {
  id?: string;
  groupMembers: string;
  groupTopic: string;
  groupType: string;
  category?: "NEWS" | "FEATURE" | "COMMENTARY" | null;
  assignedProducerUserId?: string | null;
  assignedProducer?: AssignedUser | null;
  assignedExecutiveProducerUserId?: string | null;
  assignedExecutiveProducer?: AssignedUser | null;
  memberUserIds?: string[];
  members?: Array<{ userId: string; name: string | null; email: string | null }>;
  initialCutMediaItemId?: string | null;
  finalCutMediaItemId?: string | null;
  stageNotes?: Record<string, string> | null;
  revisedInitialCut?: boolean;
  pitching: boolean;
  proofOfContact: boolean;
  aRollBRoll: boolean;
  initialCut: boolean;
  initialCutManual: boolean;
  finalCut: boolean;
  finalCutManual: boolean;
  extension: boolean;
  possibleInterviews?: string;
  possibleIdeas?: string;
  notes?: string;
};

function producerLabel(producer: { name: string | null; email: string | null } | null | undefined) {
  if (!producer) return null;
  return producer.name?.trim() || producer.email || null;
}

function AssignmentSelect({
  value,
  options,
  onChange,
  emptyLabel
}: {
  value: string;
  options: Array<AssignableProducer & { kind?: "ap" | "ep" }>;
  emptyLabel: string;
  onChange: (next: { userId: string | null; user: AssignedUser | null }) => void;
}) {
  return (
    <select
      value={value}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        const nextId = event.target.value || null;
        const match = nextId ? options.find((option) => option.userId === nextId) ?? null : null;
        onChange({
          userId: nextId,
          user: match ? { userId: match.userId, name: match.name, email: match.email } : null
        });
      }}
      className="w-full max-w-[14rem] rounded-md border border-border bg-black/40 px-2 py-1.5 text-xs text-foreground outline-none focus:border-[var(--brand-green)]/50"
    >
      <option value="">{emptyLabel}</option>
      {options.map((option) => (
        <option key={option.userId} value={option.userId}>
          {producerLabel(option) ?? option.userId}
          {option.kind === "ep" ? " · EP" : option.kind === "ap" ? " · AP" : ""}
        </option>
      ))}
    </select>
  );
}

/** Prefer DB member links; fall back to mention ids embedded in groupMembers. */
function normalizeProgressRow(row: ProgressRow): ProgressRow {
  const fromTable = row.memberUserIds ?? [];
  const fromMentions = extractMentionUserIds(row.groupMembers ?? "");
  const memberUserIds = fromTable.length > 0 ? fromTable : fromMentions;
  return { ...row, memberUserIds };
}

export type PackageProgressPayload = {
  canEdit: boolean;
  canAssignProducer?: boolean;
  activeCycleNumber: number;
  cycles: CycleTab[];
  producers?: AssignableProducer[];
  executives?: AssignableProducer[];
  previousTeammatesByUser?: Record<string, string[]>;
  rows: ProgressRow[];
};

const BUTTON_PRIMARY =
  "bg-primary text-primary-foreground hover:bg-primary/90";
const BUTTON_SECONDARY =
  "bg-secondary text-foreground hover:bg-accent";
const BUTTON_WARNING =
  "bg-amber-500/20 border border-amber-300/40 text-amber-100 hover:bg-amber-500/30";

const DEFAULT_ROW: ProgressRow = {
  groupMembers: "",
  groupTopic: "",
  groupType: "",
  category: null,
  assignedProducerUserId: null,
  assignedProducer: null,
  assignedExecutiveProducerUserId: null,
  assignedExecutiveProducer: null,
  memberUserIds: [],
  initialCutMediaItemId: null,
  finalCutMediaItemId: null,
  stageNotes: null,
  revisedInitialCut: false,
  pitching: false,
  proofOfContact: false,
  aRollBRoll: false,
  initialCut: false,
  initialCutManual: false,
  finalCut: false,
  finalCutManual: false,
  extension: false,
  possibleInterviews: "",
  possibleIdeas: "",
  notes: ""
};

async function fetchCycle(cycleNumber?: number) {
  const query = typeof cycleNumber === "number" ? `?cycle=${cycleNumber}` : "";
  const response = await fetch(`/api/package-progress${query}`, { cache: "no-store" });
  const payload = (await response.json()) as { data?: PackageProgressPayload; error?: { message?: string } };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load package cycle.");
  }

  return {
    ...payload.data,
    rows: payload.data.rows.map(normalizeProgressRow)
  };
}

function serializeRows(rows: ProgressRow[]) {
  return JSON.stringify(rows.map((row) => ({ ...row, id: undefined })));
}

function personShortName(user: { name: string | null; email: string | null } | undefined) {
  return user?.name?.trim() || user?.email?.split("@")[0] || "Someone";
}

function consecutiveWarning(
  memberUserIds: string[],
  previousTeammatesByUser: Record<string, string[]>,
  usersById: Map<string, MembersEditorUser>
) {
  const overlaps = consecutiveGroupmateOverlaps(memberUserIds, previousTeammatesByUser);
  if (overlaps.length === 0) return null;

  const seen = new Set<string>();
  const parts: string[] = [];
  for (const overlap of overlaps) {
    for (const otherId of overlap.withUserIds) {
      const key = [overlap.userId, otherId].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(
        `${personShortName(usersById.get(overlap.userId))} and ${personShortName(usersById.get(otherId))}`
      );
    }
  }

  if (parts.length === 0) return null;
  return `Same group last cycle: ${parts.join("; ")}`;
}

type EditableTextCellProps = {
  value: string;
  minHeightClassName?: string;
  className?: string;
  onCommit: (value: string) => void;
};

function EditableTextCell({ value, minHeightClassName, className, onCommit }: EditableTextCellProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const latestValueRef = useRef(value);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    latestValueRef.current = value;

    if (!isFocusedRef.current && editorRef.current && editorRef.current.innerText !== value) {
      editorRef.current.textContent = value;
    }
  }, [value]);

  return (
    <div
      ref={editorRef}
      contentEditable
      role="textbox"
      suppressContentEditableWarning
      onFocus={() => {
        isFocusedRef.current = true;
      }}
      onInput={(event) => {
        latestValueRef.current = event.currentTarget.innerText;
      }}
      onBlur={(event) => {
        isFocusedRef.current = false;
        latestValueRef.current = event.currentTarget.innerText;
        onCommit(latestValueRef.current);
      }}
      className={cn(
        "-mx-2 -my-1.5 whitespace-pre-wrap break-words bg-transparent px-2 py-1.5 text-sm text-foreground outline-none focus:bg-accent/30",
        minHeightClassName ?? "min-h-[2rem]",
        className
      )}
    />
  );
}

function RosterNoteCell({
  value,
  title,
  placeholder,
  topic,
  editing,
  onCommit
}: {
  value: string;
  title: string;
  placeholder: string;
  topic: string;
  editing: boolean;
  onCommit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const hasNote = value.trim().length > 0;

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraft(value);
      setOpen(true);
      return;
    }
    const committed = draft.slice(0, PACKAGE_ROSTER_NOTE_MAX);
    if (editing && committed !== value) onCommit(committed);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setDraft(value);
          setOpen(true);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[12px] font-medium leading-none transition",
          hasNote
            ? "border-[var(--brand-green)]/40 bg-[var(--brand-green)]/10 text-foreground hover:bg-[var(--brand-green)]/20"
            : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
      >
        {hasNote ? <StickyNote className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        {hasNote ? "Notes" : "Add"}
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-lg"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{topic.trim() || "Untitled package"}</DialogDescription>
          </DialogHeader>
          {editing ? (
            <textarea
              value={draft}
              maxLength={PACKAGE_ROSTER_NOTE_MAX}
              rows={10}
              placeholder={placeholder}
              autoFocus
              onChange={(event) => setDraft(event.target.value.slice(0, PACKAGE_ROSTER_NOTE_MAX))}
              className="min-h-[12rem] w-full resize-y rounded-md border border-border bg-black/40 px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--brand-green)]/50"
            />
          ) : hasNote ? (
            <div className="min-h-[8rem] whitespace-pre-wrap break-words rounded-md border border-border bg-black/40 px-3 py-2 text-sm leading-6 text-foreground">
              {value}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type QueuedSave = {
  cycleNumber: number;
  rows: ProgressRow[];
};

type RowContextMenuState = {
  rowId: string | null;
  rowIndex: number;
  x: number;
  y: number;
};

export default function PackageProgressClient({ initialData }: { initialData?: PackageProgressPayload }) {
  const initialRows = useMemo(
    () => (initialData?.rows ?? []).map(normalizeProgressRow),
    [initialData]
  );
  const [cycles, setCycles] = useState<CycleTab[]>(initialData?.cycles ?? []);
  const [activeCycleNumber, setActiveCycleNumber] = useState(initialData?.activeCycleNumber ?? 1);
  const [rows, setRows] = useState<ProgressRow[]>(initialRows);
  const [draftRows, setDraftRows] = useState<ProgressRow[]>(initialRows);
  const [users, setUsers] = useState<MembersEditorUser[]>([]);
  const [producers, setProducers] = useState<AssignableProducer[]>(initialData?.producers ?? []);
  const [executives, setExecutives] = useState<AssignableProducer[]>(initialData?.executives ?? []);
  const assignableProducers = useMemo(
    () => mergeAssignableProducerOptions(producers, executives),
    [producers, executives]
  );
  const executiveIds = useMemo(() => new Set(executives.map((user) => user.userId)), [executives]);
  const [previousTeammatesByUser, setPreviousTeammatesByUser] = useState<Record<string, string[]>>(
    initialData?.previousTeammatesByUser ?? {}
  );
  const [canEdit, setCanEdit] = useState(initialData?.canEdit ?? false);
  const [canAssignProducer, setCanAssignProducer] = useState(initialData?.canAssignProducer ?? false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenuState | null>(null);
  const initializedEditModeRef = useRef(false);
  const hasResolvedInitialCycleRef = useRef(Boolean(initialData));
  const hasUsedInitialDataRef = useRef(Boolean(initialData));
  const activeCycleNumberRef = useRef(activeCycleNumber);
  const editingRef = useRef(editing);
  const draftRowsRef = useRef<ProgressRow[]>([]);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef<QueuedSave | null>(null);
  const rowContextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeCycleNumberRef.current = activeCycleNumber;
  }, [activeCycleNumber]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/platform/users", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { data?: MembersEditorUser[] };
        if (active && Array.isArray(payload.data)) {
          setUsers(payload.data);
        }
      } catch {
        // ignore — autocomplete is optional
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    draftRowsRef.current = draftRows;
  }, [draftRows]);

  useEffect(() => {
    if (!rowContextMenu) {
      return;
    }

    function closeMenu() {
      setRowContextMenu(null);
    }

    function onMouseDown(event: MouseEvent) {
      if (!rowContextMenuRef.current) {
        closeMenu();
        return;
      }

      const target = event.target;
      if (target instanceof Node && rowContextMenuRef.current.contains(target)) {
        return;
      }

      closeMenu();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [rowContextMenu]);

  useEffect(() => {
    if (hasUsedInitialDataRef.current && initialData) {
      hasUsedInitialDataRef.current = false;
      if (!initializedEditModeRef.current) {
        setEditing(initialData.canEdit);
        initializedEditModeRef.current = true;
      }
      setLoading(false);
      return;
    }

    let active = true;

    async function hydrate() {
      try {
        setLoading(true);
        setMessage(null);
        const data = await fetchCycle(hasResolvedInitialCycleRef.current ? activeCycleNumber : undefined);
        hasResolvedInitialCycleRef.current = true;
        if (!active) return;
        setCycles(data.cycles);
        setCanEdit(data.canEdit);
        setCanAssignProducer(Boolean(data.canAssignProducer));
        setProducers(data.producers ?? []);
        setExecutives(data.executives ?? []);
        setPreviousTeammatesByUser(data.previousTeammatesByUser ?? {});
        setActiveCycleNumber(data.activeCycleNumber);
        replaceLocalRows(data.rows);
        if (!initializedEditModeRef.current) {
          setEditing(data.canEdit);
          initializedEditModeRef.current = true;
        }
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Failed to load package cycle.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      active = false;
    };
  }, [activeCycleNumber, initialData]);

  const activeCycle = useMemo(
    () => cycles.find((cycle) => cycle.cycleNumber === activeCycleNumber) ?? null,
    [cycles, activeCycleNumber]
  );

  const isDirty = useMemo(() => serializeRows(rows) !== serializeRows(draftRows), [rows, draftRows]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  function replaceLocalRows(nextRows: ProgressRow[]) {
    setRows(nextRows);
    setDraftRows(nextRows);
    draftRowsRef.current = nextRows;
  }

  function setLocalDraftRows(nextRows: ProgressRow[]) {
    setDraftRows(nextRows);
    draftRowsRef.current = nextRows;
  }

  async function flushQueuedSaves() {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);

    while (queuedSaveRef.current) {
      const saveJob = queuedSaveRef.current;
      queuedSaveRef.current = null;

      if (saveJob.cycleNumber !== activeCycleNumberRef.current) {
        continue;
      }

      try {
        setMessage(null);
        const response = await fetch("/api/package-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cycleNumber: saveJob.cycleNumber,
            rows: saveJob.rows
          })
        });
        const payload = (await response.json()) as {
          data?: { cycleNumber: number; rows: ProgressRow[] };
          error?: { message?: string };
        };

        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "Failed to save progress.");
        }

        const savedRows = payload.data.rows.map(normalizeProgressRow);

        if (activeCycleNumberRef.current === saveJob.cycleNumber) {
          setRows(savedRows);
          if (!editingRef.current) {
            setDraftRows((current) =>
              serializeRows(current) === serializeRows(saveJob.rows) ? savedRows : current
            );
          } else {
            // Keep draft ids in sync after create so subsequent saves update, not duplicate.
            setDraftRows((current) => {
              if (serializeRows(current) !== serializeRows(saveJob.rows)) return current;
              return savedRows;
            });
          }
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Failed to save progress.");
      }
    }

    saveInFlightRef.current = false;

    if (queuedSaveRef.current) {
      void flushQueuedSaves();
      return;
    }

    setSaving(false);
  }

  function queueAutosave(nextRows: ProgressRow[]) {
    queuedSaveRef.current = {
      cycleNumber: activeCycleNumberRef.current,
      rows: nextRows
    };
    void flushQueuedSaves();
  }

  function updateDraftRow(index: number, next: Partial<ProgressRow>, options?: { autosave?: boolean }) {
    const nextRows = draftRowsRef.current.map((row, rowIndex) =>
      rowIndex === index
        ? {
            ...row,
            ...next
          }
        : row
    );

    setLocalDraftRows(nextRows);

    if (options?.autosave) {
      queueAutosave(nextRows);
    }
  }

  function addDraftRow() {
    const nextRows = [...draftRowsRef.current, { ...DEFAULT_ROW }];
    setLocalDraftRows(nextRows);
    queueAutosave(nextRows);
  }

  function openRowContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    row: ProgressRow,
    rowIndex: number
  ) {
    if (!canEdit) {
      return;
    }

    event.preventDefault();

    setRowContextMenu({
      rowId: row.id ?? null,
      rowIndex,
      x: event.clientX,
      y: event.clientY
    });
  }

  const rosterStats = useMemo(() => {
    const list = editing ? draftRows : rows;
    return {
      total: list.length,
      withMembers: list.filter(
        (row) => (row.memberUserIds?.length ?? 0) > 0 || row.groupMembers.trim().length > 0
      ).length,
      withAssigned: list.filter(
        (row) => Boolean(row.assignedProducerUserId) || Boolean(row.assignedExecutiveProducerUserId)
      ).length
    };
  }, [editing, draftRows, rows]);

  function deleteRowFromContextMenu() {
    if (!rowContextMenu) {
      return;
    }

    const currentRows = draftRowsRef.current;
    const rowIndexById =
      rowContextMenu.rowId === null ? -1 : currentRows.findIndex((candidate) => candidate.id === rowContextMenu.rowId);
    const targetIndex = rowIndexById >= 0 ? rowIndexById : rowContextMenu.rowIndex;

    if (targetIndex < 0 || targetIndex >= currentRows.length) {
      setRowContextMenu(null);
      return;
    }

    const nextRows = currentRows.filter((_, index) => index !== targetIndex);
    setLocalDraftRows(nextRows);

    if (!editing) {
      setRows(nextRows);
    }

    queueAutosave(nextRows);
    setRowContextMenu(null);
  }

  async function waitForPendingSaves() {
    const deadline = Date.now() + 5000;
    while ((queuedSaveRef.current || saveInFlightRef.current) && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 60));
    }
  }

  async function refresh() {
    try {
      setMessage(null);
      setRowContextMenu(null);
      await waitForPendingSaves();
      const data = await fetchCycle(activeCycleNumber);
      setCycles(data.cycles);
      setCanEdit(data.canEdit);
      setCanAssignProducer(Boolean(data.canAssignProducer));
      setProducers(data.producers ?? []);
      setExecutives(data.executives ?? []);
      replaceLocalRows(data.rows);
      if (!initializedEditModeRef.current) {
        setEditing(data.canEdit);
        initializedEditModeRef.current = true;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to refresh package cycle.");
    }
  }

  function resolveAssignedUser(
    assigned: AssignedUser | null | undefined,
    assignedUserId: string | null | undefined,
    pool: AssignableProducer[]
  ) {
    if (assigned) return assigned;
    if (!assignedUserId) return null;
    const match = pool.find((entry) => entry.userId === assignedUserId);
    return match ? { userId: match.userId, name: match.name, email: match.email } : null;
  }

  function onCycleTabClick(cycleNumber: number) {
    if (cycleNumber === activeCycleNumber) return;
    if (editing && isDirty) {
      const proceed = window.confirm("Changes are still saving. Switch cycles anyway?");
      if (!proceed) return;
    }
    setRowContextMenu(null);
    queuedSaveRef.current = null;
    setActiveCycleNumber(cycleNumber);
  }

  return (
    <div className="route-enter mx-auto w-full max-w-[80rem] space-y-5 pb-24">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow">Roster · Cycle {activeCycle?.cycleNumber ?? "—"}</div>
            <h1 className="display-md mt-2 text-foreground">Package Cycle</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeCycle?.focus?.trim()
                ? activeCycle.focus
                : "Assign reporters and a producer (associate or executive) for each package."}{" "}
              Stage completion is managed on{" "}
              <Link href={"/groups" as never} className="text-foreground underline underline-offset-2">
                Groups
              </Link>
              .
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="meta-pill">
              {rosterStats.total} group{rosterStats.total === 1 ? "" : "s"}
            </span>
            <Button type="button" size="sm" className={BUTTON_SECONDARY} onClick={() => void refresh()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Link
              href={"/groups" as never}
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-secondary px-3 text-xs font-medium text-foreground shadow transition hover:bg-accent"
            >
              <ExternalLink className="h-4 w-4" />
              Open Groups
            </Link>
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                className={editing ? BUTTON_WARNING : BUTTON_PRIMARY}
                onClick={() => {
                  if (editing) {
                    setDraftRows(rows);
                    setRowContextMenu(null);
                    setEditing(false);
                    return;
                  }
                  setRowContextMenu(null);
                  setEditing(true);
                }}
              >
                <Edit3 className="mr-2 h-4 w-4" />
                {editing ? "Cancel Edit" : "Edit Roster"}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2">
          {(
            [
              ["Groups", rosterStats.total, "In this cycle"],
              ["With members", rosterStats.withMembers, "Linked reporters"],
              ["Assigned", rosterStats.withAssigned, "AP or EP"]
            ] as const
          ).map(([label, count, hint]) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-[rgb(10,10,10,0.55)] p-3 backdrop-blur"
            >
              <div className="font-display text-2xl font-extrabold italic leading-none tracking-tight text-foreground">
                {count}
              </div>
              <div className="mt-1 text-xs font-medium text-foreground">{label}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>
            </div>
          ))}
        </div>

        {editing && canEdit ? (
          <p className="relative mt-3 text-xs text-muted-foreground">
            {saving ? "Saving changes..." : "Edit topic, interviews, ideas, members, and assigned producer. Changes save automatically."}
          </p>
        ) : null}

        {message ? (
          <p className="relative mt-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading groups…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  {(["Topic", "Interviews", "Notes", "Members", "Assigned producer"] as const).map(
                    (label) => (
                      <th
                        key={label}
                        className={cn(
                          "bg-[hsl(var(--background))] px-4 py-3 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground",
                          label === "Members" ? "text-right" : "text-left"
                        )}
                      >
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {(editing ? draftRows : rows).map((row, index) => (
                  <tr
                    key={row.id ?? `${activeCycleNumber}-${index}`}
                    onContextMenu={(event) => openRowContextMenu(event, row, index)}
                    onClick={() => {
                      if (!editing && canEdit) {
                        setEditing(true);
                      }
                    }}
                    className={cn(
                      "group border-b border-[hsl(var(--border))]/40 bg-black transition-colors duration-150",
                      "hover:bg-[var(--ink-2)] hover:shadow-[inset_3px_0_0_0_var(--brand-green)]",
                      !editing && canEdit ? "cursor-pointer" : ""
                    )}
                    title={!editing && canEdit ? "Click to edit" : undefined}
                  >
                    <td className="min-w-[220px] px-4 py-3 align-middle">
                      {editing ? (
                        <EditableTextCell
                          value={row.groupTopic}
                          onCommit={(value) => {
                            if (value !== row.groupTopic) {
                              updateDraftRow(index, { groupTopic: value }, { autosave: true });
                            }
                          }}
                          className="text-sm font-semibold text-foreground"
                        />
                      ) : (
                        <div className="text-sm font-semibold text-foreground">
                          {row.groupTopic || "Untitled package"}
                        </div>
                      )}
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-4 py-3 align-middle">
                      <RosterNoteCell
                        value={row.possibleInterviews ?? ""}
                        title="Interviews"
                        placeholder="Possible interviews…"
                        topic={row.groupTopic}
                        editing={editing}
                        onCommit={(value) => {
                          updateDraftRow(index, { possibleInterviews: value }, { autosave: true });
                        }}
                      />
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-4 py-3 align-middle">
                      <RosterNoteCell
                        value={row.possibleIdeas ?? ""}
                        title="Notes"
                        placeholder="Notes…"
                        topic={row.groupTopic}
                        editing={editing}
                        onCommit={(value) => {
                          updateDraftRow(index, { possibleIdeas: value }, { autosave: true });
                        }}
                      />
                    </td>
                    <td className="min-w-[220px] px-4 py-3 align-middle text-right">
                      {editing ? (
                        <div className="space-y-1.5">
                        <MembersEditor
                          memberUserIds={row.memberUserIds ?? []}
                          users={users}
                          onChangeAction={(next) => {
                            const prevIds = row.memberUserIds ?? [];
                            const sameIds =
                              prevIds.length === next.memberUserIds.length &&
                              prevIds.every((id, i) => id === next.memberUserIds[i]);
                            if (sameIds && next.groupMembers === row.groupMembers) return;
                            updateDraftRow(
                              index,
                              {
                                groupMembers: next.groupMembers,
                                memberUserIds: next.memberUserIds
                              },
                              { autosave: true }
                            );
                          }}
                          className="text-xs text-muted-foreground"
                        />
                        {(() => {
                          const warning = consecutiveWarning(
                            row.memberUserIds ?? [],
                            previousTeammatesByUser,
                            usersById
                          );
                          return warning ? (
                            <p className="text-left text-[11px] font-medium text-amber-300">{warning}</p>
                          ) : null;
                        })()}
                        </div>
                      ) : (
                        <div className="space-y-1.5 text-xs text-muted-foreground">
                          <GroupMembersDisplay
                            value={row.groupMembers}
                            memberUserIds={row.memberUserIds}
                            users={users}
                          />
                          {(() => {
                            const warning = consecutiveWarning(
                              row.memberUserIds ?? [],
                              previousTeammatesByUser,
                              usersById
                            );
                            return warning ? (
                              <p className="text-left text-[11px] font-medium text-amber-300">{warning}</p>
                            ) : null;
                          })()}
                        </div>
                      )}
                    </td>
                    <td className="w-[200px] px-4 py-3 align-middle">
                      {editing && canAssignProducer ? (
                        <AssignmentSelect
                          value={selectedAssignedProducerId(row)}
                          options={assignableProducers}
                          emptyLabel="Unassigned"
                          onChange={({ userId, user }) => {
                            updateDraftRow(
                              index,
                              exclusiveProducerAssignment(userId, user, executiveIds),
                              { autosave: true }
                            );
                          }}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {(() => {
                            const assigned =
                              resolveAssignedUser(
                                row.assignedExecutiveProducer,
                                row.assignedExecutiveProducerUserId,
                                executives
                              ) ??
                              resolveAssignedUser(row.assignedProducer, row.assignedProducerUserId, producers);
                            const label = producerLabel(assigned);
                            if (!label) return "Unassigned";
                            const kind = row.assignedExecutiveProducerUserId
                              ? "EP"
                              : row.assignedProducerUserId
                                ? "AP"
                                : null;
                            return kind ? `${label} · ${kind}` : label;
                          })()}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {(editing ? draftRows : rows).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No groups yet. Add a row to create one.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        {editing ? (
          <div className="flex justify-center px-4 py-4">
            <Button type="button" size="sm" onClick={addDraftRow}>
              <Plus className="mr-2 h-4 w-4" />
              Add Group
            </Button>
          </div>
        ) : null}
      </section>

      {rowContextMenu ? (
        <div
          ref={rowContextMenuRef}
          className="fixed z-[120] min-w-[168px] rounded-lg border border-border bg-card p-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
          style={{ left: rowContextMenu.x, top: rowContextMenu.y }}
        >
          <button
            type="button"
            className="w-full rounded-md px-3 py-2 text-left text-sm text-rose-100 transition hover:bg-rose-500/20 hover:text-rose-50"
            onClick={deleteRowFromContextMenu}
          >
            Delete row
          </button>
        </div>
      ) : null}

      <section className="sticky bottom-4 z-20 mx-auto flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-black/85 p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur">
          {cycles.map((cycle) => {
            const active = cycle.cycleNumber === activeCycleNumber;
            return (
              <button
                key={cycle.cycleNumber}
                type="button"
                onClick={() => onCycleTabClick(cycle.cycleNumber)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.18em] transition",
                  active
                    ? "bg-[var(--brand-green)] text-[var(--ink)]"
                    : "text-[var(--ink-text)] hover:bg-white/5 hover:text-white"
                )}
              >
                Cycle
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono-broadcast text-[10px] font-bold",
                    active ? "bg-black/35 text-[var(--ink)]" : "bg-black/40 text-[var(--ink-text)]"
                  )}
                >
                  {String(cycle.cycleNumber).padStart(2, "0")}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
