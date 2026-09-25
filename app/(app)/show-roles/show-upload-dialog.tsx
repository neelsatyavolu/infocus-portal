"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ExternalLink, Loader2, Upload } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NasUploadFields } from "@/src/lib/nas-upload-client";
import { SHOW_DESCRIPTION_MAX, SHOW_THUMBNAIL_SECONDS, SHOW_TITLE_MAX } from "@/src/lib/show-publication";

type Publication = {
  status: string;
  title: string;
  description: string;
  publishAt: string;
  seasonNumber: number | null;
  watchUrl: string | null;
  lastError: string | null;
};

type Defaults = {
  title: string;
  description: string;
  publishDate: string;
  publishTime: string;
  seasonNumber: number | null;
  existingSeasons: number[] | null;
};

type State = { showDate: string; configured: boolean; publication: Publication | null; defaults: Defaults | null };
type Form = { title: string; description: string; publishDate: string; publishTime: string; seasonNumber: string };
type Phase = "loading" | "pick" | "uploading" | "review" | "status";

const ACTIVE = new Set(["UPLOADING", "PROCESSING", "FINALIZING"]);
const STATUS_LABELS: Record<string, string> = {
  UPLOADING: "Uploading to YouTube…",
  PROCESSING: "YouTube is processing the video…",
  FINALIZING: "Setting the thumbnail and playlist…",
  SCHEDULED: "Scheduled",
  FAILED: "Needs attention"
};
const THUMBNAIL_MAX_WIDTH = 1280;

const pacificDateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!response.ok || body.data === undefined) throw new Error(body.error?.message ?? fallback);
  return body.data;
}

async function captureThumbnail(file: File, seconds: number) {
  const { captureVideoThumbnail } = await import("@/src/lib/video-thumbnail-client");
  return captureVideoThumbnail(file, seconds, { exact: true, maxWidth: THUMBNAIL_MAX_WIDTH });
}

function formFromDefaults(defaults: Defaults): Form {
  return {
    title: defaults.title,
    description: defaults.description,
    publishDate: defaults.publishDate,
    publishTime: defaults.publishTime,
    seasonNumber: defaults.seasonNumber ? String(defaults.seasonNumber) : ""
  };
}

function StatusView({ publication }: { publication: Publication }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2 font-semibold">
        {ACTIVE.has(publication.status) ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {STATUS_LABELS[publication.status] ?? publication.status}
      </div>
      <div className="space-y-1 rounded-lg border border-border p-3">
        <div className="font-medium">{publication.title}</div>
        <div className="text-xs text-muted-foreground">
          Goes public {pacificDateTime.format(new Date(publication.publishAt))} Pacific
          {publication.seasonNumber ? ` · InFocus News | Season ${publication.seasonNumber}` : ""}
        </div>
      </div>
      {publication.lastError ? <p className="text-xs text-destructive">{publication.lastError}</p> : null}
      {publication.watchUrl ? (
        <a href={publication.watchUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">
          Open on YouTube <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
      <p className="text-xs text-muted-foreground">To change anything now, use YouTube Studio.</p>
    </div>
  );
}

export function ShowUploadDialog({
  open,
  onOpenChange,
  showDate,
  showLabel
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showDate: string;
  showLabel: string;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<State | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [thumbnail, setThumbnail] = useState<Blob | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailSeconds, setThumbnailSeconds] = useState(String(SHOW_THUMBNAIL_SECONDS));
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const next = await readJson<State>(
      await fetch(`/api/show-roles/publication?date=${encodeURIComponent(showDate)}`, { cache: "no-store" }),
      "Could not load the show upload."
    );
    setState(next);
    return next;
  }, [showDate]);

  useEffect(() => {
    if (!open) return;
    setPhase("loading");
    setFile(null);
    setThumbnail(null);
    load()
      .then((next) => setPhase(next.publication && next.publication.status !== "DRAFT" ? "status" : "pick"))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not load the show upload.");
        onOpenChange(false);
      });
  }, [open, load, onOpenChange]);

  useEffect(() => {
    if (!thumbnail) {
      setThumbnailUrl(null);
      return;
    }
    const url = URL.createObjectURL(thumbnail);
    setThumbnailUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnail]);

  const publicationStatus = state?.publication?.status;
  useEffect(() => {
    if (!open || phase !== "status" || !publicationStatus || !ACTIVE.has(publicationStatus)) return;
    const timer = window.setInterval(() => void load().catch(() => {}), 10_000);
    return () => window.clearInterval(timer);
  }, [open, phase, publicationStatus, load]);

  async function retakeThumbnail(source: File, seconds: number) {
    setCapturing(true);
    try {
      setThumbnail(await captureThumbnail(source, seconds));
    } catch {
      toast.error("Could not grab a frame there. Try another time, or YouTube will pick one.");
    } finally {
      setCapturing(false);
    }
  }

  async function startUpload(picked: File) {
    setFile(picked);
    setProgress(0);
    setPhase("uploading");
    void retakeThumbnail(picked, SHOW_THUMBNAIL_SECONDS);
    try {
      const init = await readJson<{ upload: NasUploadFields }>(
        await fetch("/api/show-roles/publication", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "init", showDate, fileName: picked.name })
        }),
        "Could not start the upload."
      );
      const { uploadFileToNas } = await import("@/src/lib/nas-upload-client");
      await uploadFileToNas(picked, init.upload, (sent, total) => {
        if (total) setProgress((sent / total) * 100);
      });
      const next = await load();
      if (!next.defaults) throw new Error("This show was already sent to YouTube.");
      setForm(formFromDefaults(next.defaults));
      setPhase("review");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
      setPhase("pick");
    }
  }

  async function schedule() {
    if (!form) return;
    const seasonNumber = Number(form.seasonNumber);
    if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
      toast.error("Enter a season number.");
      return;
    }
    setSubmitting(true);
    try {
      if (thumbnail) {
        const body = new FormData();
        body.set("showDate", showDate);
        body.set("file", thumbnail, "poster.jpg");
        await readJson(await fetch("/api/show-roles/publication/poster", { method: "POST", body }), "Could not save the thumbnail.");
      }
      const next = await readJson<State>(
        await fetch("/api/show-roles/publication", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm", showDate, ...form, seasonNumber })
        }),
        "Could not schedule the show."
      );
      setState(next);
      setPhase("status");
      toast.success("Sent to YouTube. It uploads in the background.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not schedule the show.");
    } finally {
      setSubmitting(false);
    }
  }

  const existingSeasons = state?.defaults?.existingSeasons ?? null;
  const seasonNumber = Number(form?.seasonNumber);
  const seasonHint = !existingSeasons
    ? "Couldn't read playlists from YouTube. Check the number."
    : Number.isInteger(seasonNumber) && seasonNumber > 0 && !existingSeasons.includes(seasonNumber)
      ? `New playlist: "InFocus News | Season ${seasonNumber}" will be created.`
      : "Adds to the existing playlist.";

  return (
    <Dialog open={open} onOpenChange={(next) => (phase === "uploading" && !next ? undefined : onOpenChange(next))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload show</DialogTitle>
          <DialogDescription>{showLabel}</DialogDescription>
        </DialogHeader>

        {phase === "loading" ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

        {phase === "pick" ? (
          <div className="space-y-3">
            {state && !state.configured ? (
              <p className="text-sm text-destructive">YouTube publishing is not configured on this server.</p>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => {
                const picked = event.target.files?.[0];
                event.target.value = "";
                if (picked) void startUpload(picked);
              }}
            />
            <Button type="button" onClick={() => inputRef.current?.click()} disabled={!state?.configured}>
              <Upload className="h-4 w-4" />
              Choose show video
            </Button>
            <p className="text-xs text-muted-foreground">
              Uploads to InFocus Drive first. You can review everything before it goes to YouTube.
            </p>
          </div>
        ) : null}

        {phase === "uploading" ? (
          <div className="space-y-2">
            <p className="text-sm">Uploading {file?.name}…</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs tabular-nums text-muted-foreground">
              {Math.round(progress)}% · keep this window open until it finishes
            </p>
          </div>
        ) : null}

        {phase === "review" && form ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Thumbnail</Label>
              <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
                {thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                  <img src={thumbnailUrl} alt="Thumbnail preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    {capturing ? "Grabbing frame…" : "No frame. YouTube will pick one."}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={thumbnailSeconds}
                  onChange={(event) => setThumbnailSeconds(event.target.value)}
                  className="w-24"
                  aria-label="Thumbnail time in seconds"
                />
                <span className="text-xs text-muted-foreground">seconds</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!file || capturing}
                  onClick={() => file && void retakeThumbnail(file, Math.max(0, Number(thumbnailSeconds) || 0))}
                >
                  <Camera className="h-3.5 w-3.5" />
                  Retake
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="show-title">Title</Label>
              <Input
                id="show-title"
                value={form.title}
                maxLength={SHOW_TITLE_MAX}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="show-date">Goes public</Label>
                <Input
                  id="show-date"
                  type="date"
                  value={form.publishDate}
                  onChange={(event) => setForm({ ...form, publishDate: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="show-time">Time (Pacific)</Label>
                <Input
                  id="show-time"
                  type="time"
                  value={form.publishTime}
                  onChange={(event) => setForm({ ...form, publishTime: event.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="show-season">Playlist</Label>
              <div className="flex items-center gap-2 text-sm">
                <span className="shrink-0 text-muted-foreground">InFocus News | Season</span>
                <Input
                  id="show-season"
                  type="number"
                  min={1}
                  value={form.seasonNumber}
                  onChange={(event) => setForm({ ...form, seasonNumber: event.target.value })}
                  className="w-24"
                />
              </div>
              <p className="text-xs text-muted-foreground">{seasonHint}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="show-description">Description</Label>
              <Textarea
                id="show-description"
                rows={5}
                value={form.description}
                maxLength={SHOW_DESCRIPTION_MAX}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>
          </div>
        ) : null}

        {phase === "status" && state?.publication ? <StatusView publication={state.publication} /> : null}

        {phase === "review" ? (
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => setPhase("pick")}>
              Choose a different file
            </Button>
            <Button type="button" disabled={submitting || capturing || !form?.title.trim()} onClick={() => void schedule()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Schedule on YouTube
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
