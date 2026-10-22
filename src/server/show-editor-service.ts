import { z, ZodError } from "zod";
import { fail } from "@/src/lib/http";
import {
  SHOW_EDIT_BACKENDS, SHOW_EDIT_STAGES, SHOW_EDITOR_HOUSE_RULES_MAX, SHOW_EDITOR_MACHINE_KINDS
} from "@/src/lib/show-editor";
import { ShowEditError } from "@/src/server/show-editor-errors";

/** Bodies the editing Mac sends to /api/service/show-editor/* (contract: infocus-editor docs/portal-api.md). */
export const heartbeatSchema = z.object({
  version: z.string().max(40),
  busy: z.boolean(),
  machine: z.object({ name: z.string().trim().min(1).max(80), kind: z.enum(SHOW_EDITOR_MACHINE_KINDS) }).optional(),
  health: z.object({ ok: z.boolean(), problems: z.array(z.string().max(300)).max(20) }),
  // Base64 X25519 key (44 characters); optional so a Mac that hasn't made its key yet can still check in.
  publicKey: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(128).optional(),
  backends: z.array(z.object({ name: z.enum(SHOW_EDIT_BACKENDS), connected: z.boolean(), detail: z.string().max(200) })).max(SHOW_EDIT_BACKENDS.length).optional(),
  credentialAcks: z.array(z.object({ id: z.string().min(1).max(64), ok: z.boolean(), error: z.string().max(300).optional() })).max(10).optional(),
  // Output over the cap is cut to 4000 characters rather than refused, so a long log never loses the ack.
  commandAcks: z.array(z.object({ id: z.string().min(1).max(64), ok: z.boolean(), output: z.string().max(100_000).optional() })).max(10).optional()
});

/** POST pair/<code> from the producer's computer: the sealed sign-in (size and base64 are checked in the service). */
export const pairSubmitSchema = z.object({ ciphertext: z.string() });

/** The run's debug bundle from upload-targets' `log.path`; the service checks it belongs to the job. */
const debugLogPathSchema = z.string().min(1).max(512).optional();

export const progressSchema = z.object({ stage: z.enum(SHOW_EDIT_STAGES), message: z.string().max(300) });

export const completeSchema = z.object({
  outputNasPath: z.string().min(1).max(512),
  decisions: z.array(z.object({ kind: z.string().min(1).max(40), detail: z.string().max(300), flagged: z.boolean() })).max(50),
  checks: z.record(z.string(), z.unknown()),
  needsReview: z.boolean(),
  costUsd: z.number().min(0).max(1000),
  agentSessionId: z.string().max(100),
  reply: z.string().max(1000).optional(),
  houseRules: z.string().max(SHOW_EDITOR_HOUSE_RULES_MAX).optional(),
  debugLogPath: debugLogPathSchema
});

/** Device-code linking from the Mac's setup app (no auth; rate-limited). */
export const linkStartSchema = z.object({ deviceName: z.string().trim().min(1).max(80) });
export const linkPollSchema = z.object({ deviceCode: z.string().min(16).max(128) });

export const failSchema = z.object({ error: z.string().max(1000), cancelled: z.boolean(), debugLogPath: debugLogPathSchema });

export async function readEditorBody(request: Request): Promise<unknown> {
  return request.json().catch(() => ({}));
}

/** Plain refusals keep their status; anything else is a 500 the Mac retries, with details only in the logs. */
export function editorRouteError(error: unknown) {
  if (error instanceof ShowEditError) return fail(error.message, error.status);
  if (error instanceof ZodError) return fail("Invalid request", 400, error.issues.map((issue) => issue.path.join(".")));
  console.error("show editor service route failed", error);
  return fail("Server error. Try again.", 500);
}
