import type { PrompterRecording } from "@/src/lib/teleprompter-recording";

/*
 * Saves a run-mode recording to InFocus Drive: the log first (small, and useful on its own if the
 * audio upload fails), then the audio. Each file gets an upload slot from the Portal and goes
 * straight from the browser to Drive.
 */

type RecordingFile = { kind: "log" | "audio"; file: File };

function recordingFiles(recording: PrompterRecording): RecordingFile[] {
  return [
    { kind: "log", file: new File([recording.logJson()], `${recording.id}.json`, { type: "application/json" }) },
    { kind: "audio", file: new File([recording.wav()], `${recording.id}.wav`, { type: "audio/wav" }) }
  ];
}

/** Uploads both files; returns the Drive folder they're in. `onProgress` gets 0–1. */
export async function uploadRecording(recording: PrompterRecording, docId: string, onProgress: (fraction: number) => void) {
  const { uploadFileToNas } = await import("@/src/lib/nas-upload-client");
  const files = recordingFiles(recording);
  const total = files.reduce((sum, { file }) => sum + file.size, 0);
  let sent = 0;
  let folder = "";
  for (const { kind, file } of files) {
    const response = await fetch("/api/teleprompter/recordings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId, recordingId: recording.id, kind })
    });
    const body = (await response.json().catch(() => null)) as {
      data?: { path: string; upload: Parameters<typeof uploadFileToNas>[1] };
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.data) {
      throw new Error(body?.error?.message ?? `The upload didn't start (${response.status}).`);
    }
    await uploadFileToNas(file, body.data.upload, (bytes) => onProgress((sent + bytes) / total));
    sent += file.size;
    folder = body.data.path.split("/").slice(0, -1).join("/");
  }
  return folder;
}

/** Saves both files to this computer instead, when Drive can't be reached. */
export function downloadRecording(recording: PrompterRecording) {
  for (const { file } of recordingFiles(recording)) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
