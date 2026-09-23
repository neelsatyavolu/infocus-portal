"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import * as tus from "tus-js-client";
import { Button } from "@/components/ui/button";
import { UploadProgressToast } from "@/components/upload-progress-toast";
import { upsertUploadHistory } from "@/src/lib/upload-history";

type SimpleVideoUploadProps = {
  projectId: string;
  canUpload: boolean;
};

function titleFromFileName(fileName: string) {
  const cleaned = fileName.replace(/\.[^/.]+$/, "").trim();
  return cleaned.length > 0 ? cleaned : "Untitled upload";
}

export function SimpleVideoUpload({ projectId, canUpload }: SimpleVideoUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const speedTrackingRef = useRef({ loaded: 0, timestampMs: 0, speedBytesPerSecond: 0, progress: 0 });
  const [uploadState, setUploadState] = useState<"idle" | "preparing" | "uploading" | "processing">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeedBytesPerSecond, setUploadSpeedBytesPerSecond] = useState(0);
  const [uploadEtaSeconds, setUploadEtaSeconds] = useState<number | null>(null);
  const [activeFileName, setActiveFileName] = useState<string | undefined>();

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploadState("preparing");
    setUploadProgress(0);
    setUploadSpeedBytesPerSecond(0);
    setUploadEtaSeconds(null);
    setActiveFileName(file.name);
    speedTrackingRef.current = { loaded: 0, timestampMs: performance.now(), speedBytesPerSecond: 0, progress: 0 };
    const uploadId = `simple-${Date.now()}`;
    upsertUploadHistory({ id: uploadId, name: file.name, status: "PREPARING", progress: 0, etaSeconds: null });

    try {
      const initResponse = await fetch("/api/media/init-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId,
          title: titleFromFileName(file.name),
          fileName: file.name
        })
      });

      if (!initResponse.ok) {
        throw new Error("Upload init failed");
      }

      const init = (await initResponse.json()) as {
        data: {
          media?: { id: string };
          version?: { id: string };
          upload: {
            provider?: string;
            uploadUrl: string;
            signature: string;
            expiresAt: number;
            videoId: string;
            libraryId: string;
            path?: string;
            token?: string;
          };
        };
      };

      const upload = init.data.upload;
      setUploadState("uploading");

      const reportProgress = (bytesUploaded: number, bytesTotal: number) => {
        if (!bytesTotal) return;
        const nowMs = performance.now();
        const elapsedSeconds = (nowMs - speedTrackingRef.current.timestampMs) / 1000;
        const bytesDelta = bytesUploaded - speedTrackingRef.current.loaded;
        if (elapsedSeconds > 0 && bytesDelta >= 0) {
          speedTrackingRef.current.speedBytesPerSecond = bytesDelta / elapsedSeconds;
          setUploadSpeedBytesPerSecond(speedTrackingRef.current.speedBytesPerSecond);
          speedTrackingRef.current = {
            loaded: bytesUploaded,
            timestampMs: nowMs,
            speedBytesPerSecond: speedTrackingRef.current.speedBytesPerSecond,
            progress: speedTrackingRef.current.progress
          };
        }
        const progress = Math.max(speedTrackingRef.current.progress, (bytesUploaded / bytesTotal) * 100);
        speedTrackingRef.current.progress = progress;
        setUploadProgress(progress);
        const speed = speedTrackingRef.current.speedBytesPerSecond;
        const bytesRemaining = Math.max(0, bytesTotal - bytesUploaded);
        const etaSeconds = speed > 0 ? bytesRemaining / speed : null;
        setUploadEtaSeconds(etaSeconds);
        upsertUploadHistory({
          id: uploadId,
          name: file.name,
          status: "UPLOADING",
          progress,
          bytesUploaded,
          bytesTotal,
          speedBytesPerSecond: speed,
          etaSeconds
        });
      };

      if ((upload.provider || "").toUpperCase() === "NAS") {
        const { completeNasUpload, uploadFileToNas } = await import("@/src/lib/nas-upload-client");
        await uploadFileToNas(file, upload, reportProgress);
        if (init.data.media?.id && init.data.version?.id) {
          await completeNasUpload(init.data.media.id, init.data.version.id);
          const { uploadNasPosterBestEffort } = await import("@/src/lib/video-thumbnail-client");
          await uploadNasPosterBestEffort(file, init.data.media.id, init.data.version.id);
        }
        setUploadProgress(100);
        setUploadSpeedBytesPerSecond(0);
        setUploadState("processing");
        setUploadEtaSeconds(null);
        upsertUploadHistory({ id: uploadId, name: file.name, status: "DONE", progress: 100, etaSeconds: null });
      } else {
        await new Promise<void>((resolve, reject) => {
          const uploader = new tus.Upload(file, {
            endpoint: upload.uploadUrl,
            retryDelays: [0, 1500, 3000, 5000],
            headers: {
              AuthorizationSignature: upload.signature,
              AuthorizationExpire: String(upload.expiresAt),
              VideoId: upload.videoId,
              LibraryId: upload.libraryId
            },
            metadata: {
              filetype: file.type || "video/mp4",
              title: titleFromFileName(file.name)
            },
            onError: (error) => reject(error),
            onProgress: (bytesUploaded, bytesTotal) => {
              reportProgress(bytesUploaded, bytesTotal);
            },
            onSuccess: () => {
              setUploadProgress(100);
              setUploadSpeedBytesPerSecond(0);
              resolve();
            }
          });

          uploader.start();
        });

        setUploadState("processing");
        setUploadEtaSeconds(null);
        upsertUploadHistory({ id: uploadId, name: file.name, status: "PROCESSING", progress: 100, etaSeconds: null });
      }
      window.setTimeout(() => {
        setUploadState("idle");
        setUploadProgress(0);
        setUploadEtaSeconds(null);
        setActiveFileName(undefined);
        router.refresh();
      }, 1200);
    } catch {
      window.alert("Video upload failed. Please try again.");
      setUploadState("idle");
      setUploadProgress(0);
      setUploadSpeedBytesPerSecond(0);
      setUploadEtaSeconds(null);
      setActiveFileName(undefined);
      upsertUploadHistory({ id: uploadId, name: file.name, status: "FAILED", progress: 0, etaSeconds: null });
    }
  }

  if (!canUpload) {
    return null;
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onFileSelected} />
      <Button onClick={() => inputRef.current?.click()} disabled={uploadState !== "idle"} className="gap-2">
        <Plus className="h-4 w-4" />
        {uploadState === "idle" ? "Upload Video" : "Uploading..."}
      </Button>
      <UploadProgressToast
        items={
          uploadState === "idle"
            ? []
            : [
                {
                  id: "simple-upload",
                  fileName: activeFileName ?? "Video file",
                  status:
                    uploadState === "preparing"
                      ? "PREPARING"
                      : uploadState === "processing"
                        ? "PROCESSING"
                        : "UPLOADING",
                  progress: uploadProgress,
                  speedBytesPerSecond: uploadSpeedBytesPerSecond,
                  etaSeconds: uploadEtaSeconds
                }
              ]
        }
      />
    </>
  );
}
