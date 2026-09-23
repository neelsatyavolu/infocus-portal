"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import PublishingManagers from "./publishing-managers";
import { Download, GripVertical, History, Play, Plus, Radio, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  MAX_PACKAGES_PER_SHOW,
  QUEUE_SHOW_FULL_MESSAGE,
  UNASSIGNED_SHOW_KEY,
  canManuallyPlaceOnShow,
  groupPastQueueSections,
  groupQueueSections,
  queuePackageSubtitle
} from "@/src/lib/publishing-queue";
import { formatShowDateLabel } from "@/src/lib/show-assignment";
import type { NasUploadFields } from "@/src/lib/nas-upload-client";
import { cn } from "@/src/lib/utils";

type QueueRow = {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  custom?: boolean;
  queuedForAirAt: string | null;
  queuedForShowDate: string | null;
  members: Array<string | null>;
  thumbnailUrl?: string | null;
  youtubePublication?: { status: string; videoId: string | null; publishedAt: string | null; lastError: string | null } | null;
};

type UpcomingShow = {
  date: string;
  label: string;
};

type Candidate = {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  custom?: boolean;
  members: Array<string | null>;
};

function showDateOptionLabel(show: UpcomingShow, full: boolean, current: boolean) {
  return `${show.label}${full && !current ? " (full)" : ""}`;
}

function QueuePackageCard({
  row,
  busy,
  canDrag,
  dragging,
  showOptions,
  occupiedOn,
  onDragStart,
  onDragEnd,
  onMove,
  onRemove
}: {
  row: QueueRow;
  busy: boolean;
  canDrag: boolean;
  dragging: boolean;
  showOptions: UpcomingShow[];
  occupiedOn: (date: string, excludeRowId?: string | null) => number;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  onMove: (rowId: string, showDate: string) => void;
  onRemove: (rowId: string) => void;
}) {
  const title = (
    <div className="min-w-0 break-words">
      <div className="font-medium">{row.groupTopic || (row.custom ? "Untitled" : "Untitled group")}</div>
      <div className="text-xs text-muted-foreground">{queuePackageSubtitle(row)}</div>
    </div>
  );
  const extraCurrent =
    row.queuedForShowDate && !showOptions.some((show) => show.date === row.queuedForShowDate)
      ? { date: row.queuedForShowDate, label: formatShowDateLabel(row.queuedForShowDate) }
      : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-3 py-2.5 transition-opacity",
        dragging && "opacity-50"
      )}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div
          draggable={canDrag && !busy}
          onDragStart={canDrag ? onDragStart : undefined}
          onDragEnd={canDrag ? onDragEnd : undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3",
            canDrag && "cursor-grab active:cursor-grabbing"
          )}
        >
          {canDrag ? <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/70" /> : null}
          <QueueThumbnail url={row.thumbnailUrl ?? null} />
          {row.custom ? (
            title
          ) : (
            <Link href={`/groups/${row.id}/final-cut` as never} draggable={false} className="min-w-0">
              {title}
            </Link>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link href={`/publishing-queue/${row.id}` as never} draggable={false} className="text-xs text-muted-foreground underline hover:text-foreground">
            {row.youtubePublication?.status === "PUBLISHED" ? "YouTube published"
              : row.youtubePublication?.status === "UPLOADING" ? "YouTube uploading"
              : row.youtubePublication?.status === "PROCESSING" ? "YouTube processing"
              : row.youtubePublication?.status === "FAILED" ? "YouTube failed"
              : "YouTube pending"}
          </Link>
          <select
            value={row.queuedForShowDate ?? ""}
            disabled={busy}
            draggable={false}
            onChange={(event) => {
              const next = event.target.value || null;
              if (!next || next === row.queuedForShowDate) return;
              if (!canManuallyPlaceOnShow(occupiedOn(next, row.id))) {
                toast.error(QUEUE_SHOW_FULL_MESSAGE);
                return;
              }
              onMove(row.id, next);
            }}
            className="h-8 min-w-0 max-w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            <option value="">Next empty show</option>
            {showOptions.map((show) => {
              const full = !canManuallyPlaceOnShow(occupiedOn(show.date, row.id));
              const current = show.date === row.queuedForShowDate;
              return (
                <option key={show.date} value={show.date} disabled={full && !current}>
                  {showDateOptionLabel(show, full, current)}
                </option>
              );
            })}
            {extraCurrent ? <option value={extraCurrent.date}>{extraCurrent.label}</option> : null}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            title="Download final cut"
            draggable={false}
            onClick={() => {
              const link = document.createElement("a");
              link.href = `/api/package-cycle/queue/${row.id}/download`;
              link.rel = "noopener";
              document.body.appendChild(link);
              link.click();
              link.remove();
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            draggable={false}
            onClick={() => onRemove(row.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      </div>
      {row.youtubePublication?.lastError ? (
        <p className="mt-2 text-xs text-destructive">{row.youtubePublication.lastError}</p>
      ) : null}
    </div>
  );
}

function QueueThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(url) && !failed;
  return (
    <div className="relative h-14 w-[5.5rem] shrink-0 overflow-hidden rounded-lg bg-black/50 outline outline-1 outline-white/10">
      {showImage ? (
        // Signed Drive / Bunny thumbs; skip next/image domain allowlists.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url ?? ""}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Play className="h-3.5 w-3.5 translate-x-px" />
        </div>
      )}
    </div>
  );
}

export default function PublishingQueueClient() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingShow[]>([]);
  const [today, setToday] = useState<string | undefined>(undefined);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingConfigured, setPublishingConfigured] = useState<boolean | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [customUploading, setCustomUploading] = useState(false);
  const [customProgress, setCustomProgress] = useState<number | null>(null);
  const customFileRef = useRef<HTMLInputElement | null>(null);

  function resetCustomForm() {
    setCustomTitle("");
    setCustomFile(null);
    setCustomUploading(false);
    setCustomProgress(null);
    if (customFileRef.current) {
      customFileRef.current.value = "";
    }
  }

  const load = useCallback(async (withCandidates = false) => {
    const response = await fetch(
      withCandidates ? "/api/package-cycle/queue?candidates=1" : "/api/package-cycle/queue",
      { cache: "no-store" }
    );
    const body = (await response.json()) as {
      data?: {
        packages: QueueRow[];
        publishingConfigured?: boolean;
        today?: string;
        upcomingShows: UpcomingShow[];
        candidates?: Candidate[];
      };
    };
    setRows(body.data?.packages ?? []);
    setPublishingConfigured(body.data?.publishingConfigured ?? null);
    setToday(body.data?.today);
    setUpcoming(body.data?.upcomingShows ?? []);
    if (withCandidates) {
      setCandidates(body.data?.candidates ?? []);
    }
  }, []);

  useEffect(() => {
    void load()
      .catch(() => toast.error("Could not load the publishing queue."))
      .finally(() => setLoading(false));
  }, [load]);

  async function openAdd() {
    setAddOpen(true);
    try {
      await load(true);
    } catch {
      toast.error("Could not load packages to add.");
    }
  }

  async function updateQueue(rowId: string, queued: boolean, showDate?: string | null) {
    const previous = rows;
    const alreadyQueued = previous.some((row) => row.id === rowId);
    if (queued && showDate) {
      setRows((current) =>
        current.map((row) => (row.id === rowId ? { ...row, queuedForShowDate: showDate } : row))
      );
    }
    setBusyId(rowId);
    try {
      const response = await fetch("/api/package-cycle/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, queued, showDate })
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not update the queue.");
      }
      await load(addOpen);
      if (!queued) {
        toast.success("Removed from the queue.");
      } else if (alreadyQueued) {
        toast.success("Moved.");
      } else {
        toast.success("Added to the publishing queue.");
      }
    } catch (error) {
      setRows(previous);
      toast.error(error instanceof Error ? error.message : "Could not update the queue.");
    } finally {
      setBusyId(null);
    }
  }

  async function addCustom() {
    const title = customTitle.trim();
    const file = customFile;
    if (!title || !file || customUploading) {
      return;
    }
    setCustomUploading(true);
    setCustomProgress(0);
    try {
      const initResponse = await fetch("/api/package-cycle/queue/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init", title, fileName: file.name })
      });
      const initBody = (await initResponse.json()) as {
        data?: { mediaId: string; versionId: string; upload: NasUploadFields };
        error?: { message?: string };
      };
      if (!initResponse.ok || !initBody.data) {
        throw new Error(initBody.error?.message ?? "Could not start the upload.");
      }
      const { uploadFileToNas } = await import("@/src/lib/nas-upload-client");
      await uploadFileToNas(file, initBody.data.upload, (bytesUploaded, bytesTotal) => {
        if (!bytesTotal) return;
        setCustomProgress(Math.max(0, (bytesUploaded / bytesTotal) * 100));
      });
      const completeResponse = await fetch("/api/package-cycle/queue/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          title,
          mediaId: initBody.data.mediaId,
          versionId: initBody.data.versionId
        })
      });
      const completeBody = (await completeResponse.json()) as { error?: { message?: string } };
      if (!completeResponse.ok) {
        throw new Error(completeBody.error?.message ?? "Could not add the package.");
      }
      const { uploadNasPosterBestEffort } = await import("@/src/lib/video-thumbnail-client");
      await uploadNasPosterBestEffort(file, initBody.data.mediaId, initBody.data.versionId);
      resetCustomForm();
      setAddOpen(false);
      await load();
      toast.success("Added to the publishing queue.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the custom package.");
      setCustomUploading(false);
      setCustomProgress(null);
    }
  }

  const upcomingDates = useMemo(() => upcoming.map((show) => show.date), [upcoming]);
  const grouped = useMemo(
    () => groupQueueSections(rows, upcomingDates, today),
    [rows, upcomingDates, today]
  );
  const pastGrouped = useMemo(
    () => groupPastQueueSections(rows, upcomingDates, today),
    [rows, upcomingDates, today]
  );
  const pastShows = useMemo(
    () => pastGrouped.map((group) => ({ date: group.date, label: formatShowDateLabel(group.date) })),
    [pastGrouped]
  );
  const pastDialogShows = useMemo(() => {
    const seen = new Set(pastShows.map((show) => show.date));
    return [...pastShows, ...upcoming.filter((show) => !seen.has(show.date))];
  }, [pastShows, upcoming]);
  const liveCount = grouped.reduce((sum, group) => sum + group.rows.length, 0);

  function occupiedOn(date: string, excludeRowId?: string | null) {
    return rows.filter((row) => row.queuedForShowDate === date && row.id !== excludeRowId).length;
  }

  function canDropOn(date: string) {
    if (date === UNASSIGNED_SHOW_KEY) return false;
    const dragged = draggingId ? rows.find((row) => row.id === draggingId) : null;
    if (dragged?.queuedForShowDate === date) return true;
    return canManuallyPlaceOnShow(occupiedOn(date, draggingId));
  }

  function onDropOnShow(date: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragOverDate(null);
    const rowId = event.dataTransfer.getData("text/plain");
    setDraggingId(null);
    if (!rowId || date === UNASSIGNED_SHOW_KEY) return;
    const row = rows.find((item) => item.id === rowId);
    if (!row || row.queuedForShowDate === date) return;
    if (!canManuallyPlaceOnShow(occupiedOn(date, rowId))) {
      toast.error(QUEUE_SHOW_FULL_MESSAGE);
      return;
    }
    void updateQueue(rowId, true, date);
  }

  return (
    <div className="route-enter mx-auto w-full max-w-3xl space-y-5 pb-24">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow flex items-center gap-2">
              <Radio className="h-3 w-3" />
              Producers
            </div>
            <h1 className="display-md mt-2 text-foreground">Publishing Queue</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              New items land on the next empty show. Drag onto a date to stack — max {MAX_PACKAGES_PER_SHOW} per
              show.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PublishingManagers />
            <Button type="button" size="sm" variant="outline" onClick={() => setPastOpen(true)}>
              <History className="h-4 w-4" />
              Past shows
            </Button>
            <Button type="button" size="sm" onClick={() => void openAdd()}>
              <Plus className="h-4 w-4" />
              Add package
            </Button>
          </div>
        </div>
      </section>

      {publishingConfigured === false ? <p className="text-sm text-muted-foreground">YouTube publishing is not configured yet. Queue scheduling is still available.</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!loading && liveCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          {pastGrouped.length > 0
            ? "Nothing upcoming. Past shows are under Past shows."
            : "Nothing in the queue yet. Drop targets below stay open."}
        </p>
      ) : null}

      <div className="space-y-5">
        {grouped.map((group) => {
          const label =
            upcoming.find((show) => show.date === group.date)?.label ??
            (group.date === UNASSIGNED_SHOW_KEY ? "No show assigned" : group.date);
          const count = group.rows.length;
          const droppable = group.date !== UNASSIGNED_SHOW_KEY;
          const accepting = droppable && canDropOn(group.date);
          const over = dragOverDate === group.date;

          return (
            <section key={group.date} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</h2>
                {droppable ? (
                  <span
                    className={cn(
                      "text-[11px] tabular-nums text-muted-foreground",
                      count >= MAX_PACKAGES_PER_SHOW && "text-foreground"
                    )}
                  >
                    {count}/{MAX_PACKAGES_PER_SHOW}
                  </span>
                ) : null}
              </div>
              <div
                onDragOver={(event) => {
                  if (!accepting) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverDate(group.date);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  if (dragOverDate === group.date) setDragOverDate(null);
                }}
                onDrop={(event) => onDropOnShow(group.date, event)}
                className={cn(
                  "min-h-[4.75rem] space-y-2 rounded-2xl border border-dashed p-2 transition-[border-color,background-color] duration-150",
                  droppable ? "border-border/80" : "border-transparent p-0",
                  over && accepting && "border-primary/60 bg-primary/5",
                  droppable && !accepting && draggingId && "opacity-60"
                )}
              >
                {group.rows.map((row) => (
                  <QueuePackageCard
                    key={row.id}
                    row={row}
                    busy={busyId === row.id}
                    canDrag
                    dragging={draggingId === row.id}
                    showOptions={upcoming}
                    occupiedOn={occupiedOn}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", row.id);
                      setDraggingId(row.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverDate(null);
                    }}
                    onMove={(rowId, showDate) => void updateQueue(rowId, true, showDate)}
                    onRemove={(rowId) => void updateQueue(rowId, false)}
                  />
                ))}
                {droppable && group.rows.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">Drop a package here</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={pastOpen} onOpenChange={setPastOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Past shows</DialogTitle>
            <DialogDescription>
              Shows whose air date has passed. You can still move, download, or remove packages.
            </DialogDescription>
          </DialogHeader>
          {pastGrouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">No past shows yet.</p>
          ) : (
            <div className="space-y-5">
              {pastGrouped.map((group) => {
                const label = pastShows.find((show) => show.date === group.date)?.label ?? group.date;
                return (
                  <section key={group.date} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {label}
                      </h2>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {group.rows.length}/{MAX_PACKAGES_PER_SHOW}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {group.rows.map((row) => (
                        <QueuePackageCard
                          key={row.id}
                          row={row}
                          busy={busyId === row.id}
                          canDrag={false}
                          dragging={false}
                          showOptions={pastDialogShows}
                          occupiedOn={occupiedOn}
                          onMove={(rowId, showDate) => void updateQueue(rowId, true, showDate)}
                          onRemove={(rowId) => void updateQueue(rowId, false)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPastOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (customUploading && !open) {
            return;
          }
          setAddOpen(open);
          if (!open) {
            resetCustomForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to publishing queue</DialogTitle>
            <DialogDescription>Packages with a final cut that are not already queued.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="text-sm font-medium">Custom package</div>
              <p className="text-xs text-muted-foreground">
                Upload a video and give it a title. It lands on the next empty show.
              </p>
              <Input
                value={customTitle}
                onChange={(event) => setCustomTitle(event.target.value)}
                placeholder="Title"
                disabled={customUploading}
                maxLength={150}
              />
              <input
                ref={customFileRef}
                type="file"
                accept="video/*"
                disabled={customUploading}
                className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-xs file:text-foreground"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setCustomFile(file);
                  if (file && !customTitle.trim()) {
                    setCustomTitle(file.name.replace(/\.[^/.]+$/, "").trim() || file.name);
                  }
                }}
              />
              {customProgress != null ? (
                <p className="text-xs text-muted-foreground">Uploading {Math.round(customProgress)}%</p>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={!customTitle.trim() || !customFile || customUploading}
                onClick={() => void addCustom()}
              >
                {customUploading ? "Uploading…" : "Add custom package"}
              </Button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other final cuts are ready to add.</p>
              ) : (
                candidates.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    disabled={busyId === row.id || customUploading}
                    onClick={() => void updateQueue(row.id, true)}
                    className="block w-full rounded-lg border border-border px-3 py-2 text-left hover:bg-accent"
                  >
                    <div className="text-sm font-medium">{row.groupTopic || "Untitled group"}</div>
                    <div className="text-xs text-muted-foreground">{queuePackageSubtitle(row)}</div>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={customUploading} onClick={() => setAddOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
