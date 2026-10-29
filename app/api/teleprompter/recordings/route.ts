import { createHash } from "node:crypto";
import { z } from "zod";
import { dateKeyInTimeZone } from "@/src/lib/announcement-submission";
import { handleRouteError } from "@/src/lib/api-errors";
import { fail, okNoStore } from "@/src/lib/http";
import { buildTeleprompterRecordingNasPath, isNasStorageEnabled, nasMintUploadSession } from "@/src/lib/nas-storage";
import { TELEPROMPTER_TIME_ZONE } from "@/src/lib/teleprompter-template";
import { RECORDING_ID_PATTERN } from "@/src/lib/teleprompter-recording";
import { requireTeleprompterActor, requireTeleprompterDocAccess } from "@/src/server/teleprompter-access";

/*
 * Upload slots for a run-mode Auto follow recording (audio + log), on InFocus Drive under
 * Package Storage/Teleprompter Recordings/<date>/. Anyone who can run the script can record.
 */

const recordingSchema = z.object({
  docId: z.string().trim().min(1).max(64),
  recordingId: z.string().regex(RECORDING_ID_PATTERN),
  kind: z.enum(["audio", "log"])
});
/** Long enough for an hour's audio over a slow tunnel. */
const UPLOAD_TTL_SECONDS = 2 * 3600;
const OWNER_TAG_LENGTH = 10;

export async function POST(request: Request) {
  try {
    const payload = recordingSchema.parse(await request.json());
    const { userId, email } = await requireTeleprompterActor();
    await requireTeleprompterDocAccess({ docId: payload.docId, userId, email });
    if (!isNasStorageEnabled()) {
      return fail("Recordings are saved to InFocus Drive, which isn't set up here.", 503);
    }

    // The file name carries who asked, so one person's slot can never reach another's recording.
    const owner = createHash("sha256").update(userId).digest("hex").slice(0, OWNER_TAG_LENGTH);
    const path = buildTeleprompterRecordingNasPath({
      dateKey: dateKeyInTimeZone(new Date(), TELEPROMPTER_TIME_ZONE),
      recordingId: `${payload.recordingId}-${owner}`,
      ext: payload.kind === "audio" ? "wav" : "json"
    });
    let upload: Awaited<ReturnType<typeof nasMintUploadSession>>;
    try {
      upload = await nasMintUploadSession(path, UPLOAD_TTL_SECONDS);
    } catch (error) {
      console.error("Teleprompter recording: Drive upload slot failed", error);
      return fail("InFocus Drive didn't answer. Try saving again in a minute.", 502);
    }
    return okNoStore({
      path: upload.path,
      upload: { provider: upload.provider, uploadUrl: upload.uploadUrl, path: upload.path, token: upload.token, expiresAt: upload.expiresAt }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail("Bad request", 400);
    }
    return handleRouteError(error);
  }
}
