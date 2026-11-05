"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Plus, RotateCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { Field } from "@/components/kit/field";
import { ListRow } from "@/components/kit/list-row";
import { ProgressBar } from "@/components/kit/progress";
import { useRememberedState } from "@/components/kit/remembered-state";
import { SearchField } from "@/components/kit/search-field";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { ListSkeleton } from "@/components/kit/skeleton";
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
import { queuePackageSubtitle } from "@/src/lib/publishing-queue";
import { FilePickerButton } from "./file-picker-button";
import type { Candidate, CandidatesStatus } from "./queue-types";
import { uploadCustomPackage } from "./use-publishing-queue";

type AddTab = "final-cuts" | "upload";

function isAddTab(value: unknown): value is AddTab {
  return value === "final-cuts" || value === "upload";
}

/** Show the filter once the list is long enough to need it. */
const FILTER_FROM = 6;

/** ListRow truncates its title and subtitle; these wrap in full (as before the redesign), so every name stays readable. */
function Wrapped({ children }: { children: string }) {
  return <span className="block whitespace-normal break-words">{children}</span>;
}

function FinalCutList({
  candidates,
  status,
  busyId,
  uploading,
  onAdd,
  onRetry,
  onUploadInstead
}: {
  candidates: Candidate[];
  status: CandidatesStatus;
  busyId: string | null;
  uploading: boolean;
  onAdd: (rowId: string) => void;
  onRetry: () => void;
  onUploadInstead: () => void;
}) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const shown = useMemo(
    () =>
      query
        ? candidates.filter((row) =>
            [row.groupTopic, ...row.members].some((value) => value?.toLowerCase().includes(query))
          )
        : candidates,
    [candidates, query]
  );

  if (status === "loading" || status === "idle") return <ListSkeleton rows={4} leading={false} />;
  if (status === "error") {
    return (
      <Alert
        tone="danger"
        action={
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            <RotateCw aria-hidden />
            Try again
          </Button>
        }
      >
        Couldn&apos;t load final cuts.
      </Alert>
    );
  }
  if (candidates.length === 0) {
    return (
      <EmptyState
        size="inline"
        title="No other final cuts are ready to add."
        className="rounded-md border border-border px-3"
        action={
          <Button type="button" size="sm" variant="link" className="px-0" onClick={onUploadInstead}>
            Upload a video instead
          </Button>
        }
      />
    );
  }
  // The list is the dialog's only scroller; the filter above it and the hint below stay put.
  return (
    <>
      {candidates.length >= FILTER_FROM ? (
        <SearchField value={filter} onChange={setFilter} placeholder="Filter by topic or name" className="shrink-0" />
      ) : null}
      {shown.length === 0 ? (
        <EmptyState size="inline" title="No final cuts match." className="rounded-md border border-border px-3" />
      ) : (
        <div className="min-h-0 min-w-0 flex-auto overflow-y-auto rounded-md border border-border">
          <ul aria-label="Final cuts ready to add" className="divide-y divide-border">
            {shown.map((row) => {
              const busy = busyId === row.id;
              return (
                <ListRow
                  key={row.id}
                  title={<Wrapped>{row.groupTopic || "Untitled group"}</Wrapped>}
                  subtitle={<Wrapped>{queuePackageSubtitle(row)}</Wrapped>}
                  busy={busy}
                  disabled={uploading}
                  onClick={busy ? undefined : () => onAdd(row.id)}
                  meta={
                    busy ? undefined : (
                      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-green)]">
                        <Plus className="h-4 w-4" aria-hidden />
                        Add
                      </span>
                    )
                  }
                />
              );
            })}
          </ul>
        </div>
      )}
      <p className="shrink-0 text-[13px] text-muted-foreground">
        Adding keeps this open, so you can add several in a row.
      </p>
    </>
  );
}

/**
 * Add package (producers): pick a ready final cut, or upload a titled video. Each lands on the
 * next empty show. The dialog can't close while an upload runs.
 */
export function AddPackageDialog({
  open,
  onOpenChange,
  candidates,
  candidatesStatus,
  busyId,
  onAddCandidate,
  onRetryCandidates,
  onCustomAdded
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: Candidate[];
  candidatesStatus: CandidatesStatus;
  busyId: string | null;
  onAddCandidate: (rowId: string) => void;
  onRetryCandidates: () => void;
  onCustomAdded: (showDate: string | null) => Promise<void>;
}) {
  const [tab, setTab] = useRememberedState<AddTab>("publishing-queue:add-tab:v1", "final-cuts", isAddTab);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function resetCustomForm() {
    setTitle("");
    setFile(null);
    setUploading(false);
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (uploading && !next) return;
    onOpenChange(next);
    if (!next) resetCustomForm();
  }

  function chooseFile(next: File | null) {
    setFile(next);
    if (next && !title.trim()) {
      setTitle(next.name.replace(/\.[^/.]+$/, "").trim() || next.name);
    }
  }

  async function addCustom() {
    const trimmed = title.trim();
    if (!trimmed || !file || uploading) return;
    setUploading(true);
    setProgress(0);
    try {
      const showDate = await uploadCustomPackage(trimmed, file, setProgress);
      resetCustomForm();
      onOpenChange(false);
      await onCustomAdded(showDate);
    } catch (error) {
      // Keep the title and file, so trying again is one click.
      toast.error(error instanceof Error ? error.message : "Could not add the custom package.");
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Same layout as Past shows: fixed header and switch, one scrolling body, a bordered footer that never scrolls away. */}
      <DialogContent
        hideClose={uploading}
        className="flex max-h-[85dvh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:p-0 [&>*]:min-w-0"
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 sm:px-6">
          <DialogTitle>Add to publishing queue</DialogTitle>
          <DialogDescription>
            Packages with a final cut that are not already queued, or a video you upload. Each lands on the next empty show.
          </DialogDescription>
        </DialogHeader>
        <div className="shrink-0 px-4 pt-4 sm:px-6">
          <SegmentedControl
            ariaLabel="Add from"
            value={tab}
            onChange={setTab}
            fullWidth
            options={[
            {
              value: "final-cuts",
              label: "Final cuts",
              count: candidatesStatus === "ready" ? candidates.length : undefined,
                disabled: uploading
              },
              { value: "upload", label: "Upload a video", disabled: uploading }
            ]}
          />
        </div>
        {tab === "final-cuts" ? (
          <div className="flex min-h-0 flex-auto flex-col gap-3 px-4 py-4 sm:px-6">
            <FinalCutList
              candidates={candidates}
              status={candidatesStatus}
              busyId={busyId}
              uploading={uploading}
              onAdd={onAddCandidate}
              onRetry={onRetryCandidates}
              onUploadInstead={() => setTab("upload")}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-auto space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            <Field label="Title" htmlFor="custom-package-title">
              <Input
                id="custom-package-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title"
                disabled={uploading}
                maxLength={150}
              />
            </Field>
            {/* The dialog description already says where it lands, so no hint here. */}
            <Field label="Video" htmlFor="custom-package-video">
              <FilePickerButton
                id="custom-package-video"
                accept="video/*"
                disabled={uploading}
                file={file}
                inputRef={fileRef}
                onChange={chooseFile}
              />
            </Field>
            {progress != null ? (
              <ProgressBar value={progress} label="Upload progress" caption="Uploading" showValue />
            ) : null}
          </div>
        )}
        <DialogFooter className="shrink-0 border-t border-border px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" disabled={uploading} onClick={() => handleOpenChange(false)}>
            Close
          </Button>
          {tab === "upload" ? (
            <Button type="button" disabled={!title.trim() || !file || uploading} onClick={() => void addCustom()}>
              {uploading ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <Upload aria-hidden />}
              {uploading ? "Uploading…" : "Add custom package"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
