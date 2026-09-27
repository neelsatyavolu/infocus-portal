import { createPartFromUri, FileState, GoogleGenAI, MediaResolution } from "@google/genai";
import { z } from "zod";
import { resolveOriginalDownloadUrl } from "@/src/lib/media-playback";
import {
  isNasVideoId,
  nasDeriveWebPlaybackUrl,
  nasMintDownloadUrl,
  nasTranscriptPath,
  nasUploadBytes
} from "@/src/lib/nas-storage";

export const TRANSCRIPT_GEMINI_MODEL = "gemini-3.5-flash-lite";

const GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
/** Gemini File API limit per file. */
const MAX_SOURCE_BYTES = 2 * 1024 ** 3;
const FILE_POLL_MS = 2_000;
const FILE_READY_TIMEOUT_MS = 120_000;
const SOURCE_URL_TTL_SECONDS = 30 * 60;

const TRANSCRIPT_PROMPT = [
  "Transcribe all speech in this video word for word, in the language spoken.",
  "Split the speech into segments of one or two sentences.",
  "For each segment, start is when the segment begins, as M:SS (or H:MM:SS), and text is the words spoken.",
  "Do not summarize, correct, or add words. Do not describe music, sound effects, or visuals.",
  "If there is no speech, return an empty segments list."
].join("\n");

const responseJsonSchema = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: { type: "string" },
          text: { type: "string" }
        },
        required: ["start", "text"],
        additionalProperties: false
      }
    }
  },
  required: ["segments"],
  additionalProperties: false
} as const;

const geminiOutputSchema = z.object({
  segments: z.array(z.object({ start: z.string(), text: z.string() }))
});

const transcriptSchema = z.object({
  versionId: z.string(),
  model: z.string(),
  createdAt: z.string(),
  segments: z.array(z.object({ start: z.number().min(0), text: z.string() }))
});

export type MediaTranscript = z.infer<typeof transcriptSchema>;

export type TranscribableVersion = {
  id: string;
  bunnyVideoId: string;
  storageProvider: string | null;
  nasPath: string | null;
  durationSeconds: number | null;
};

/** Message is safe to show the user. Other errors are logged and replaced with a generic message. */
export class TranscriptError extends Error {}

function isNasVersion(version: TranscribableVersion) {
  return (version.storageProvider || "BUNNY").toUpperCase() === "NAS" || isNasVideoId(version.bunnyVideoId);
}

function geminiApiKey() {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || null;
}

/** "1:05" → 65, "1:02:03" → 3723, "12.5" → 12.5. Returns null when unreadable. */
export function parseTranscriptTimestamp(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) {
    return null;
  }
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

export function normalizeTranscriptSegments(
  segments: Array<{ start: string; text: string }>,
  durationSeconds: number | null
) {
  const maxStart = durationSeconds && durationSeconds > 0 ? durationSeconds : Number.POSITIVE_INFINITY;
  return segments
    .map((segment) => ({
      start: Math.min(parseTranscriptTimestamp(segment.start) ?? 0, maxStart),
      text: segment.text.replace(/\s+/g, " ").trim()
    }))
    .filter((segment) => segment.text.length > 0)
    .sort((a, b) => a.start - b.start);
}

/** Cached transcript from Drive, or null when there is none. Bunny (legacy) versions are never cached. */
export async function readCachedTranscript(version: TranscribableVersion): Promise<MediaTranscript | null> {
  if (!isNasVersion(version) || !version.nasPath) {
    return null;
  }
  try {
    const url = await nasMintDownloadUrl(nasTranscriptPath(version.nasPath), 5 * 60);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const parsed = transcriptSchema.safeParse(await response.json());
    return parsed.success && parsed.data.versionId === version.id ? parsed.data : null;
  } catch (error) {
    console.warn("[transcript] cache read failed", { versionId: version.id, error });
    return null;
  }
}

async function sourceVideoUrl(version: TranscribableVersion) {
  if (isNasVersion(version)) {
    if (!version.nasPath) {
      throw new TranscriptError("This video has no file in storage.");
    }
    // H.264/AAC proxy: camera originals (ProRes, XAVC) are not readable by Gemini.
    return nasDeriveWebPlaybackUrl(await nasMintDownloadUrl(version.nasPath, SOURCE_URL_TTL_SECONDS));
  }
  const url = await resolveOriginalDownloadUrl(version);
  if (!url) {
    throw new TranscriptError("This video has no file in storage.");
  }
  return url;
}

/** Streams the video from storage into the Gemini File API without buffering it in memory. */
async function uploadToGemini(apiKey: string, sourceUrl: string, displayName: string) {
  const source = await fetch(sourceUrl, { cache: "no-store", headers: { "Accept-Encoding": "identity" } });
  if (!source.ok || !source.body) {
    await source.body?.cancel();
    throw new TranscriptError("Could not read the video from storage. Try again.");
  }
  const size = Number(source.headers.get("content-length"));
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SOURCE_BYTES) {
    await source.body.cancel();
    throw new TranscriptError(
      size > MAX_SOURCE_BYTES ? "This video is too large to transcribe (over 2 GB)." : "Could not read the video size."
    );
  }
  const mimeType = source.headers.get("content-type")?.split(";")[0]?.trim() || "video/mp4";

  const start = await fetch(GEMINI_UPLOAD_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ file: { display_name: displayName } })
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  await start.body?.cancel();
  if (!start.ok || !uploadUrl) {
    await source.body.cancel();
    throw new Error(`Gemini upload start failed: ${start.status}`);
  }

  const finished = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: source.body,
    duplex: "half"
  } as RequestInit & { duplex: "half" });
  if (!finished.ok) {
    throw new Error(`Gemini upload failed: ${finished.status} ${await finished.text()}`);
  }
  const payload = (await finished.json()) as { file?: { name?: string } };
  if (!payload.file?.name) {
    throw new Error("Gemini upload returned no file name.");
  }
  return payload.file.name;
}

async function waitUntilActive(client: GoogleGenAI, name: string) {
  const deadline = Date.now() + FILE_READY_TIMEOUT_MS;
  for (;;) {
    const file = await client.files.get({ name });
    if (file.state === FileState.ACTIVE && file.uri && file.mimeType) {
      return { uri: file.uri, mimeType: file.mimeType };
    }
    if (file.state === FileState.FAILED) {
      throw new TranscriptError("Gemini could not read this video.");
    }
    if (Date.now() > deadline) {
      throw new TranscriptError("Gemini took too long to process this video. Try again.");
    }
    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_MS));
  }
}

async function saveCachedTranscript(version: TranscribableVersion, transcript: MediaTranscript) {
  if (!isNasVersion(version) || !version.nasPath) {
    return;
  }
  try {
    await nasUploadBytes(
      nasTranscriptPath(version.nasPath),
      Buffer.from(JSON.stringify(transcript)),
      "transcript.json",
      "application/json"
    );
  } catch (error) {
    console.warn("[transcript] cache write failed", { versionId: version.id, error });
  }
}

export async function generateTranscript(version: TranscribableVersion): Promise<MediaTranscript> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw new TranscriptError("Transcription is unavailable because no Gemini API key is configured.");
  }
  const client = new GoogleGenAI({ apiKey });
  let fileName: string | null = null;

  try {
    fileName = await uploadToGemini(apiKey, await sourceVideoUrl(version), `transcript-${version.id}`);
    const file = await waitUntilActive(client, fileName);
    const response = await client.models.generateContent({
      model: TRANSCRIPT_GEMINI_MODEL,
      contents: [createPartFromUri(file.uri, file.mimeType), TRANSCRIPT_PROMPT],
      config: {
        temperature: 0,
        maxOutputTokens: 32_768,
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
        responseMimeType: "application/json",
        responseJsonSchema
      }
    });
    const output = geminiOutputSchema.parse(JSON.parse(response.text || "{}"));
    const transcript: MediaTranscript = {
      versionId: version.id,
      model: TRANSCRIPT_GEMINI_MODEL,
      createdAt: new Date().toISOString(),
      segments: normalizeTranscriptSegments(output.segments, version.durationSeconds)
    };
    await saveCachedTranscript(version, transcript);
    return transcript;
  } catch (error) {
    if (error instanceof TranscriptError) {
      throw error;
    }
    console.error("[transcript] generation failed", { versionId: version.id, error });
    throw new TranscriptError("Transcription failed. Try again.");
  } finally {
    if (fileName) {
      // Gemini deletes uploads after 48 hours anyway; this just frees quota sooner.
      await client.files.delete({ name: fileName }).catch(() => {});
    }
  }
}
