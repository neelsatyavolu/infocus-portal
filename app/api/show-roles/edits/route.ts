import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, okNoStore } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import {
  SHOW_EDIT_BACKENDS, SHOW_EDIT_FIX_MAX, SHOW_EDIT_NOTE_MAX, SHOW_EDITOR_COMMANDS,
  SHOW_EDITOR_HOUSE_RULES_MAX, SHOW_EDITOR_VERSION_PATTERN, SHOW_RECORDINGS_FOLDER
} from "@/src/lib/show-editor";
import {
  MAX_SHOW_EDIT_SOURCES, normalizeSources, SHOW_EDIT_SOURCE_ROLES, sourceSelectionError
} from "@/src/lib/show-editor-sources";
import {
  approveShowEdit, cancelShowEdit, redoShowEdit, requestShowFix, showEditState, ShowEditError, startShowEdit, unlinkEditorDevice
} from "@/src/server/show-editor";
import { queueEditorCommand } from "@/src/server/show-editor-commands";
import { recordingPreviewUrl, setupAppDownloadUrl } from "@/src/server/show-editor-drive";
import { activateEditorDevice, decideEditorLink, describeEditorLink } from "@/src/server/show-editor-link";
import { createPairing } from "@/src/server/show-editor-pairing";
import { saveEditorSettings } from "@/src/server/show-editor-settings";
import { showEditSummary } from "@/src/server/show-editor-summary";

const dateKey = z.string().regex(DATE_KEY_PATTERN);
const jobId = z.string().min(1).max(64);
const deviceId = z.string().min(1).max(64);
const recordingPath = z.string().max(512).refine(
  (path) => path.startsWith(`${SHOW_RECORDINGS_FOLDER}/`) && !path.split("/").includes(".."),
  `Pick recordings from the ${SHOW_RECORDINGS_FOLDER} folder.`
);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    date: dateKey,
    // Each file with its role; `sourcePaths` (plain paths, all on Auto) is still accepted from older pages.
    sources: z.array(z.object({ path: recordingPath, role: z.enum(SHOW_EDIT_SOURCE_ROLES) })).max(MAX_SHOW_EDIT_SOURCES, `Pick at most ${MAX_SHOW_EDIT_SOURCES} files.`).optional(),
    sourcePaths: z.array(recordingPath).max(MAX_SHOW_EDIT_SOURCES, `Pick at most ${MAX_SHOW_EDIT_SOURCES} files.`).optional()
  }),
  z.object({ action: z.literal("cancel"), id: jobId }),
  // The note for the editor is optional.
  z.object({ action: z.literal("redo"), id: jobId, note: z.string().trim().max(SHOW_EDIT_NOTE_MAX).optional() }),
  z.object({ action: z.literal("fix"), id: jobId, text: z.string().trim().min(1).max(SHOW_EDIT_FIX_MAX), remember: z.boolean() }),
  // Schedule the edit under review with Upload show's defaults.
  z.object({ action: z.literal("approve"), id: jobId }),
  // A sign-in for one machine; without deviceId, the active one.
  z.object({ action: z.literal("pair"), backend: z.enum(SHOW_EDIT_BACKENDS), deviceId: deviceId.optional() }),
  // Approve (or, with approve: false, turn down) the machine waiting on this link code. Other machines stay
  // linked; with activate (the default) the new one becomes the active editor.
  z.object({
    action: z.literal("link"), userCode: z.string().trim().min(8).max(12),
    approve: z.boolean().default(true), activate: z.boolean().default(true)
  }),
  z.object({ action: z.literal("activate"), deviceId }),
  z.object({ action: z.literal("unlink"), deviceId }),
  z.object({
    action: z.literal("settings"),
    autoStart: z.boolean().nullable().optional(),
    autoPublish: z.boolean().nullable().optional(),
    targetVersion: z.string().trim().regex(SHOW_EDITOR_VERSION_PATTERN, "Version looks like v1.2.3.").nullable().optional(),
    agentOrder: z.array(z.enum(SHOW_EDIT_BACKENDS)).min(1, "Keep at least one AI account.")
      .refine((order) => new Set(order).size === order.length, "List each AI account once.").optional(),
    houseRules: z.string().max(SHOW_EDITOR_HOUSE_RULES_MAX).nullable().optional()
  }),
  z.object({ action: z.literal("command"), deviceId, kind: z.enum(SHOW_EDITOR_COMMANDS) })
]);

/** Same gate as Upload show (app/api/show-roles/publication): any producer can start, cancel, redo, fix and approve. */
async function requireProducer() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
    throw new Error("FORBIDDEN");
  }
  return userId;
}

function routeError(error: unknown) {
  if (error instanceof ShowEditError) return fail(error.message, error.status);
  return handleRouteError(error);
}

// Responses can carry signed Drive preview links: never cached.
export async function GET(request: Request) {
  try {
    await requireProducer();
    const params = new URL(request.url).searchParams;
    const linkCode = params.get("link");
    // The confirm screen for /editing?link=CODE: which Mac is asking to be linked.
    if (linkCode !== null) return okNoStore({ link: await describeEditorLink(linkCode) });
    // Machines' "Download the setup app": a short-lived Drive link, for producers only.
    if (params.get("setup") === "1") {
      return new Response(null, { status: 302, headers: { Location: await setupAppDownloadUrl(), "Cache-Control": "no-store" } });
    }
    // The picker's Preview: a playable link for one listed recording, minted only when asked for.
    const preview = params.get("preview");
    if (preview !== null) return okNoStore({ url: await recordingPreviewUrl(preview) });
    const date = params.get("date");
    if (!date || !DATE_KEY_PATTERN.test(date)) return fail("A valid date is required.", 400);
    // The Show's one-line summary: no Drive listing, no preview links.
    if (params.get("summary") === "1") return okNoStore(await showEditSummary(date));
    return okNoStore(await showEditState(date));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireProducer();
    const parsed = actionSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    const body = parsed.data;
    switch (body.action) {
      case "start": {
        const sources = body.sources ?? normalizeSources(body.sourcePaths ?? []);
        const invalid = sourceSelectionError(sources);
        if (invalid) return fail(invalid, 400);
        return okNoStore(await startShowEdit({ userId, showDate: body.date, sources }));
      }
      case "cancel":
        return okNoStore(await cancelShowEdit({ id: body.id }));
      case "redo":
        return okNoStore(await redoShowEdit({ userId, id: body.id, note: body.note }));
      case "fix":
        return okNoStore(await requestShowFix({ userId, id: body.id, text: body.text, remember: body.remember }));
      case "approve":
        return okNoStore(await approveShowEdit({ id: body.id, userId }));
      case "pair":
        return okNoStore(await createPairing({ userId, backend: body.backend, deviceId: body.deviceId }));
      case "link":
        return okNoStore(await decideEditorLink({ userId, userCode: body.userCode, approve: body.approve, activate: body.activate }));
      case "activate":
        return okNoStore(await activateEditorDevice(body.deviceId));
      case "unlink":
        return okNoStore(await unlinkEditorDevice(body.deviceId));
      case "settings": {
        const { autoStart, autoPublish, targetVersion, agentOrder, houseRules } = body;
        // An emptied rules box means "use the editor's built-in rules".
        const rules = typeof houseRules === "string" && !houseRules.trim() ? null : houseRules;
        return okNoStore(await saveEditorSettings({ autoStart, autoPublish, targetVersion, agentOrder, houseRules: rules }, userId));
      }
      case "command":
        return okNoStore(await queueEditorCommand({ userId, deviceId: body.deviceId, kind: body.kind }));
    }
  } catch (error) {
    return routeError(error);
  }
}
