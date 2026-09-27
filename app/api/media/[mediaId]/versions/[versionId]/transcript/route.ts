import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { limitByKey } from "@/src/lib/rate-limit";
import { requireMediaAccess } from "@/src/server/memberships";
import { generateTranscript, readCachedTranscript, TranscriptError } from "@/src/server/media-transcript";

// Streams the video to Gemini and waits for the transcript.
export const maxDuration = 300;

const GENERATE_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 };

/**
 * Transcript for one video version. Returns the cached copy on Drive when there is one,
 * otherwise transcribes the video with Gemini and caches the result beside it.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string; versionId: string }> }
) {
  try {
    const { mediaId, versionId } = await params;
    const { userId } = await requireMediaAccess(mediaId, undefined, { allowVisibility: true });

    const version = await prisma.mediaVersion.findFirst({
      where: { id: versionId, mediaItemId: mediaId },
      select: {
        id: true,
        bunnyVideoId: true,
        storageProvider: true,
        nasPath: true,
        durationSeconds: true,
        sourceType: true,
        status: true
      }
    });
    if (!version) {
      throw new Error("NOT_FOUND");
    }
    if (version.sourceType !== "VIDEO" || version.status !== "READY") {
      throw new TranscriptError("Only a finished video can be transcribed.");
    }

    const cached = await readCachedTranscript(version);
    if (cached) {
      return ok({ transcript: cached });
    }
    if (!limitByKey(`transcript:${userId}`, GENERATE_LIMIT).allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }
    return ok({ transcript: await generateTranscript(version) });
  } catch (error) {
    return handleRouteError(error);
  }
}
