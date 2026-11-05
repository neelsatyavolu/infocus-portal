"use client";

import { useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Camera, Film, Upload } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { Field, fieldLabelClass } from "@/components/kit/field";
import { ProgressBar } from "@/components/kit/progress";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SHOW_DESCRIPTION_MAX, SHOW_TITLE_MAX } from "@/src/lib/show-publication";

export type Publication = {
  status: string;
  title: string;
  description: string;
  publishAt: string;
  seasonNumber: number | null;
  uploadedBytes: number | null;
  totalBytes: number | null;
  watchUrl: string | null;
  lastError: string | null;
};

export type Form = { title: string; description: string; publishDate: string; publishTime: string; seasonNumber: string };

export const ACTIVE = new Set(["UPLOADING", "PROCESSING", "FINALIZING"]);
const STATUS_LABELS: Record<string, string> = {
  UPLOADING: "Uploading to YouTube…",
  PROCESSING: "YouTube is processing the video…",
  FINALIZING: "Setting the thumbnail and playlist…",
  SCHEDULED: "Scheduled",
  FAILED: "Needs attention"
};
/** Short tag words for the YouTube states that are still running. */
const ACTIVE_TAG: Record<string, string> = { UPLOADING: "Uploading", PROCESSING: "Processing", FINALIZING: "Finalizing" };

const pacificDateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const THUMBNAIL_CAPTION_ID = "show-thumbnail-caption";

/** The kit field-label look (11px caps); a caption, not a <label>, since the preview isn't a form control. */
function ThumbnailCaption() {
  return (
    <p id={THUMBNAIL_CAPTION_ID} className={fieldLabelClass}>
      Thumbnail
    </p>
  );
}

function formatBytes(bytes: number) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

/** A progress bar with its caption below in tabular figures (the caption wraps, never truncates). */
function Progress({ value, label, children }: { value: number; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <ProgressBar value={value} label={label} />
      <p className="text-xs tabular-nums text-muted-foreground">{children}</p>
    </div>
  );
}

/** The YouTube state as one tag beside the dialog title. */
export function PublicationTag({ status }: { status: string }) {
  const tone = status === "SCHEDULED" ? "success" : status === "FAILED" ? "danger" : "neutral";
  return (
    <StatusTag tone={tone} spinner={ACTIVE.has(status)}>
      {ACTIVE_TAG[status] ?? STATUS_LABELS[status] ?? status}
    </StatusTag>
  );
}

/** 16:9 preview of the grabbed frame (local blob), or why there isn't one. */
export function ThumbnailPreview({ file, capturing }: { file: Blob | null; capturing: boolean }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-[var(--ink-3)]">
      {file ? (
        <BlobImage file={file} />
      ) : (
        <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
          {capturing ? "Grabbing frame…" : "No frame. YouTube will pick one."}
        </div>
      )}
    </div>
  );
}

/** Shows a local Blob; the object URL lives exactly as long as this file is shown. */
function BlobImage({ file }: { file: Blob }) {
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (imgRef.current) imgRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // eslint-disable-next-line @next/next/no-img-element -- local blob preview
  return <img ref={imgRef} alt="Thumbnail preview" className="h-full w-full object-cover" />;
}

export function LoadingView() {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Spinner />
      Loading…
    </div>
  );
}

export function PickView({
  configured,
  onChoose,
  input
}: {
  configured: boolean;
  onChoose: () => void;
  /** The hidden file input. */
  input: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {!configured ? (
        <Alert tone="danger" compact>
          YouTube publishing is not configured on this server.
        </Alert>
      ) : null}
      {input}
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-input px-4 py-8 text-center">
        <Film className="h-8 w-8 text-muted-foreground" aria-hidden />
        <Button type="button" onClick={onChoose} disabled={!configured}>
          <Upload aria-hidden />
          Choose show video
        </Button>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Uploads to InFocus Drive first. You can review everything before it goes to YouTube.
        </p>
      </div>
    </div>
  );
}

/** Upload progress, with the thumbnail being grabbed beside it (same layout as the review). */
export function UploadingView({
  fileName,
  progress,
  thumbnail
}: {
  fileName: string;
  progress: number;
  thumbnail: ReactNode;
}) {
  return (
    <div className="@container">
      <div className="grid gap-4 @2xl:grid-cols-2 @2xl:items-center">
        <div role="group" aria-labelledby={THUMBNAIL_CAPTION_ID} className="min-w-0 space-y-2">
          <ThumbnailCaption />
          {thumbnail}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-sm">
            Uploading <span className="break-all font-mono-broadcast text-[13px]">{fileName}</span>…
          </p>
          <Progress value={progress} label="Upload to InFocus Drive">
            {Math.round(progress)}% · keep this window open until it finishes
          </Progress>
        </div>
      </div>
    </div>
  );
}

/** Review before scheduling: thumbnail on the left, the YouTube fields on the right (stacked on phones). */
export function ReviewForm({
  form,
  setForm,
  seasonHint,
  thumbnail,
  thumbnailSeconds,
  onThumbnailSecondsChange,
  canRetake,
  onRetake,
  retakeControls = true
}: {
  form: Form;
  setForm: Dispatch<SetStateAction<Form | null>>;
  seasonHint: string;
  thumbnail: ReactNode;
  thumbnailSeconds: string;
  onThumbnailSecondsChange: (value: string) => void;
  canRetake: boolean;
  onRetake: () => void;
  /** False for an automatic edit: the editing Mac already saved its poster. */
  retakeControls?: boolean;
}) {
  const update = (patch: Partial<Form>) => setForm((current) => (current ? { ...current, ...patch } : current));
  return (
    <div className="@container">
      <div className="grid gap-5 @2xl:grid-cols-2">
        <div role="group" aria-labelledby={THUMBNAIL_CAPTION_ID} className="min-w-0 space-y-2">
          <ThumbnailCaption />
          {thumbnail}
          <div className={retakeControls ? "flex items-center gap-2" : "hidden"}>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={thumbnailSeconds}
              onChange={(event) => onThumbnailSecondsChange(event.target.value)}
              className="w-24"
              aria-label="Thumbnail time in seconds"
            />
            <span className="text-[13px] text-muted-foreground">seconds</span>
            <Button type="button" variant="outline" disabled={!canRetake} onClick={onRetake}>
              <Camera aria-hidden />
              Retake
            </Button>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <Field label="Title" htmlFor="show-title">
            <Input
              id="show-title"
              value={form.title}
              maxLength={SHOW_TITLE_MAX}
              onChange={(event) => update({ title: event.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Goes public" htmlFor="show-date">
              <Input
                id="show-date"
                type="date"
                value={form.publishDate}
                onChange={(event) => update({ publishDate: event.target.value })}
              />
            </Field>
            <Field label="Time (Pacific)" htmlFor="show-time">
              <Input
                id="show-time"
                type="time"
                value={form.publishTime}
                onChange={(event) => update({ publishTime: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Playlist" htmlFor="show-season" hint={seasonHint}>
            <div className="flex items-center gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground">InFocus News | Season</span>
              <Input
                id="show-season"
                type="number"
                min={1}
                value={form.seasonNumber}
                onChange={(event) => update({ seasonNumber: event.target.value })}
                className="w-24"
                // The kit Field gives the hint this id; it is the only warning that a new playlist will be made.
                aria-describedby="show-season-hint"
              />
            </div>
          </Field>
          <Field label="Description" htmlFor="show-description">
            <Textarea
              id="show-description"
              rows={5}
              value={form.description}
              maxLength={SHOW_DESCRIPTION_MAX}
              onChange={(event) => update({ description: event.target.value })}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

/** After scheduling: what goes public when, YouTube's progress, and any error. */
export function StatusView({ publication }: { publication: Publication }) {
  const { uploadedBytes, totalBytes } = publication;
  const showProgress = publication.status === "UPLOADING" && uploadedBytes !== null && totalBytes;
  const percent = showProgress ? Math.min(100, (uploadedBytes / totalBytes) * 100) : 0;
  return (
    <div className="space-y-3 text-sm">
      {ACTIVE.has(publication.status) ? (
        <p className="text-[var(--ink-text)]">{STATUS_LABELS[publication.status]}</p>
      ) : null}
      <div className="space-y-1 rounded-md border border-border p-3">
        <div className="font-medium">{publication.title}</div>
        <div className="text-[13px] text-muted-foreground">
          Goes public {pacificDateTime.format(new Date(publication.publishAt))} Pacific
          {publication.seasonNumber ? ` · InFocus News | Season ${publication.seasonNumber}` : ""}
        </div>
      </div>
      {showProgress ? (
        <Progress value={percent} label="Upload to YouTube">
          {Math.floor(percent)}% · {formatBytes(uploadedBytes)} of {formatBytes(totalBytes)}. You can close this window.
        </Progress>
      ) : null}
      {publication.lastError ? (
        <Alert tone="danger" compact>
          {publication.lastError}
        </Alert>
      ) : null}
      <p className="text-[13px] text-muted-foreground">To change anything now, use YouTube Studio.</p>
    </div>
  );
}
