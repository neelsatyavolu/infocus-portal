"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";
import * as tus from "tus-js-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UploadProgressToast } from "@/components/upload-progress-toast";

type UploadPanelProps = {
  projectId: string;
  canUpload: boolean;
};

type UploadState = "idle" | "preparing" | "uploading" | "processing" | "error";

export function UploadPanel({ projectId, canUpload }: UploadPanelProps) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadSpeedBytesPerSecond, setUploadSpeedBytesPerSecond] = useState(0);
  const [uploadEtaSeconds, setUploadEtaSeconds] = useState<number | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);

  async function onUpload() {
    if (!file || !title.trim()) {
      setMessage("Provide a title and choose a file.");
      return;
    }

    setState("preparing");
    setUploadFileName(file.name);
    setUploadSpeedBytesPerSecond(0);
    setUploadEtaSeconds(null);
    setMessage(null);

    const initRes = await fetch("/api/media/init-upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        projectId,
        title,
        fileName: file.name
      })
    });

    if (!initRes.ok) {
      setState("error");
      setMessage("Failed to initialize upload.");
      return;
    }

    const init = (await initRes.json()) as {
      data: {
        media?: { id: string };
        version?: { id: string };
        upload: {
          provider?: "NAS" | "BUNNY";
          uploadUrl: string;
          signature: string;
          expiresAt: number;
          videoId: string;
          libraryId: string;
          token?: string;
          path?: string;
        };
      };
    };

    setState("uploading");
    const speedTracker = {
      loaded: 0,
      timestampMs: performance.now(),
      speedBytesPerSecond: 0,
      progress: 0
    };

    const trackProgress = (bytesUploaded: number, bytesTotal: number) => {
      if (!bytesTotal) return;
      const nowMs = performance.now();
      const elapsedSeconds = (nowMs - speedTracker.timestampMs) / 1000;
      const bytesDelta = bytesUploaded - speedTracker.loaded;
      if (elapsedSeconds > 0 && bytesDelta >= 0) {
        speedTracker.speedBytesPerSecond = bytesDelta / elapsedSeconds;
        setUploadSpeedBytesPerSecond(speedTracker.speedBytesPerSecond);
        speedTracker.loaded = bytesUploaded;
        speedTracker.timestampMs = nowMs;
      }
      const speed = speedTracker.speedBytesPerSecond;
      const bytesRemaining = Math.max(0, bytesTotal - bytesUploaded);
      setUploadEtaSeconds(speed > 0 ? bytesRemaining / speed : null);
      const nextProgress = Math.max(speedTracker.progress, Math.round((bytesUploaded / bytesTotal) * 100));
      speedTracker.progress = nextProgress;
      setProgress(nextProgress);
    };

    // NAS: direct multipart upload to drive.infocuspaly.com (Package Cycles path)
    if (init.data.upload.provider === "NAS") {
      try {
        const { completeNasUpload, uploadFileToNas } = await import("@/src/lib/nas-upload-client");
        await uploadFileToNas(file, init.data.upload, trackProgress);
        const mediaId = init.data.media?.id;
        const versionId = init.data.version?.id;
        if (mediaId && versionId) {
          await completeNasUpload(mediaId, versionId);
          const { uploadNasPosterBestEffort } = await import("@/src/lib/video-thumbnail-client");
          await uploadNasPosterBestEffort(file, mediaId, versionId);
        }
        setState("idle");
        setMessage("Upload complete. Stored on InFocus Drive (Package Cycles).");
        setUploadSpeedBytesPerSecond(0);
        setUploadEtaSeconds(null);
        setFile(null);
        setTitle("");
        setProgress(0);
      } catch (err) {
        setState("error");
        setMessage(err instanceof Error ? err.message : "Upload to NAS failed.");
        setUploadEtaSeconds(null);
      }
      return;
    }

    const uploader = new tus.Upload(file, {
      endpoint: init.data.upload.uploadUrl,
      retryDelays: [0, 1500, 3000, 5000],
      headers: {
        AuthorizationSignature: init.data.upload.signature,
        AuthorizationExpire: String(init.data.upload.expiresAt),
        VideoId: init.data.upload.videoId,
        LibraryId: init.data.upload.libraryId
      },
      metadata: {
        filetype: file.type || "video/mp4",
        title
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        trackProgress(bytesUploaded, bytesTotal);
      },
      onSuccess: () => {
        setState("processing");
        setMessage("Upload complete. Bunny is processing your video.");
        setUploadSpeedBytesPerSecond(0);
        setUploadEtaSeconds(null);
        setFile(null);
        setTitle("");
        setProgress(0);
      },
      onError: () => {
        setState("error");
        setMessage("Upload failed. Check Bunny credentials and try again.");
        setUploadEtaSeconds(null);
      }
    });

    uploader.start();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload New Video</CardTitle>
        <CardDescription>
          Uploads go to {process.env.NEXT_PUBLIC_MEDIA_STORAGE_HINT || "configured media storage"} (Bunny Stream or
          InFocus Drive / Package Cycles).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canUpload ? (
          <p className="text-sm text-muted-foreground">Uploads are available to workspace users who can access this project.</p>
        ) : (
          <>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Cut name (e.g. Promo v1)"
            />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-accent px-4 py-6 text-sm text-foreground">
              <UploadCloud className="h-4 w-4 text-muted-foreground" />
              <span>{file?.name ?? "Select a video file"}</span>
              <input
                type="file"
                className="hidden"
                accept="video/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {state === "uploading" ? (
              <div className="space-y-2">
                <div className="h-2 w-full rounded-full bg-secondary">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">Uploading... {progress}%</p>
              </div>
            ) : null}
            <Button onClick={onUpload} disabled={!file || !title.trim() || state === "preparing" || state === "uploading"}>
              {state === "preparing" ? "Preparing..." : state === "uploading" ? "Uploading..." : "Upload"}
            </Button>
          </>
        )}

        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </CardContent>
      <UploadProgressToast
        items={
          state === "preparing" || state === "uploading"
            ? [
                {
                  id: "upload-panel",
                  fileName: uploadFileName ?? "Video file",
                  status: state === "preparing" ? "PREPARING" : "UPLOADING",
                  progress,
                  speedBytesPerSecond: uploadSpeedBytesPerSecond,
                  etaSeconds: uploadEtaSeconds
                }
              ]
            : []
        }
      />
    </Card>
  );
}
