import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { PrompterRecording, makeRecordingId, type RecordingMeta } from "@/src/lib/teleprompter-recording";
import { downloadRecording, uploadRecording } from "./teleprompter-recording-upload";

/*
 * Run mode's "Record for tuning": started and stopped by hand while Auto is listening. Auto
 * follow writes the audio and its log into `recordingRef`; stopping (or Auto stopping, the limit,
 * or leaving run mode) saves it to InFocus Drive. A recording is never dropped: until it's saved,
 * closing the tab asks first, a failed save keeps it for Try again / Save to this computer, and a
 * save that fails after run mode closed downloads the files instead.
 */

export type RecordingState =
  | { phase: "off" }
  | { phase: "recording"; startedAt: number }
  | { phase: "saving"; progress: number }
  | { phase: "saved"; folder: string }
  | { phase: "failed"; message: string };

export type PrompterRecordingControls = {
  state: RecordingState;
  /** Auto is listening and no earlier recording is still unsaved. */
  canStart: boolean;
  start: () => void;
  stop: () => void;
  /** After a failed save: try Drive again, save the files to this computer, or throw it away. */
  retry: () => void;
  download: () => void;
  discard: () => void;
};

const LIMIT_CHECK_MS = 1000;

// Recordings not yet on Drive, across run-mode openings: closing the tab asks first while any remain.
const unsaved = new Set<PrompterRecording>();
const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();

function holdUnsaved(recording: PrompterRecording) {
  if (unsaved.size === 0) window.addEventListener("beforeunload", warnBeforeUnload);
  unsaved.add(recording);
}

function releaseUnsaved(recording: PrompterRecording) {
  unsaved.delete(recording);
  if (unsaved.size === 0) window.removeEventListener("beforeunload", warnBeforeUnload);
}

export function usePrompterRecording({
  recordingRef,
  listening,
  doc,
  sections,
  meta
}: {
  recordingRef: RefObject<PrompterRecording | null>;
  listening: boolean;
  doc: { id: string; showDate: string | null };
  sections: Array<{ id: string; label: string; content: string }>;
  meta: Omit<RecordingMeta, "startedAt" | "userAgent">;
}): PrompterRecordingControls {
  const [state, setState] = useState<RecordingState>({ phase: "off" });
  /** The recording being saved, or whose save failed. */
  const pendingRef = useRef<PrompterRecording | null>(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  });

  const save = useCallback((recording: PrompterRecording) => {
    pendingRef.current = recording;
    savingRef.current = true;
    setState({ phase: "saving", progress: 0 });
    uploadRecording(recording, docRef.current.id, (progress) => setState({ phase: "saving", progress }))
      .then((folder) => {
        pendingRef.current = null;
        releaseUnsaved(recording);
        setState({ phase: "saved", folder });
      })
      .catch((error: unknown) => {
        if (!mountedRef.current) {
          // Nobody is left to press Try again.
          downloadRecording(recording);
          releaseUnsaved(recording);
          return;
        }
        const reason = error instanceof Error ? error.message : String(error);
        setState({ phase: "failed", message: `Not saved: ${reason}` });
      })
      .finally(() => {
        savingRef.current = false;
      });
  }, []);

  const stop = useCallback(() => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (recording) save(recording);
  }, [recordingRef, save]);

  const canStart = listening && state.phase !== "saving" && state.phase !== "failed";

  const start = useCallback(() => {
    if (!canStart || recordingRef.current) return;
    const now = new Date();
    const recording = new PrompterRecording(
      makeRecordingId(now),
      { ...meta, startedAt: now.toISOString(), userAgent: navigator.userAgent },
      performance.now()
    );
    recording.log({ type: "script", docId: docRef.current.id, showDate: docRef.current.showDate, sections }, performance.now());
    holdUnsaved(recording);
    recordingRef.current = recording;
    setState({ phase: "recording", startedAt: Date.now() });
  }, [canStart, meta, recordingRef, sections]);

  // Auto stopped (turned off, or failed): save what was recorded.
  useEffect(() => {
    if (!listening) stop();
  }, [listening, stop]);

  // An edit mid-show renumbers the words: the log gets the new script.
  useEffect(() => {
    recordingRef.current?.log({ type: "script", docId: doc.id, showDate: doc.showDate, sections }, performance.now());
  }, [doc.id, doc.showDate, recordingRef, sections]);

  useEffect(() => {
    if (state.phase !== "recording") return;
    const timer = window.setInterval(() => {
      if (recordingRef.current?.full) stop();
    }, LIMIT_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [recordingRef, state.phase, stop]);

  // Leaving run mode saves it (the upload carries on in the background); one whose save already
  // failed goes to this computer.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
      const failed = pendingRef.current;
      if (failed && !savingRef.current) {
        downloadRecording(failed);
        releaseUnsaved(failed);
      }
    };
  }, [stop]);

  const retry = useCallback(() => {
    if (pendingRef.current) save(pendingRef.current);
  }, [save]);
  const download = useCallback(() => {
    const recording = pendingRef.current;
    if (!recording) return;
    downloadRecording(recording);
    pendingRef.current = null;
    releaseUnsaved(recording);
    setState({ phase: "off" });
  }, []);
  const discard = useCallback(() => {
    const recording = pendingRef.current;
    if (!recording) return;
    pendingRef.current = null;
    releaseUnsaved(recording);
    setState({ phase: "off" });
  }, []);

  return { state, canStart, start, stop, retry, download, discard };
}
