/**
 * Client `diag` messages: parsed strictly (flat primitives, small), rate limited per socket, and
 * logged as `{ evt: "client", mid, uid, kind, ...data }`. Never fanned out to other people.
 */
import {
  MEETING_DIAG_MAX_BYTES,
  type MeetingClientMessage,
  type MeetingDiagData,
  type MeetingDiagKind
} from "../../../src/lib/meetings/protocol";
import { logLine } from "./log";
import type { RateRule } from "./rate-limit";

const MAX_KEYS = 80;
const KEY = /^[A-Za-z0-9_.:-]{1,48}$/;
const MAX_STRING = 300;
/** Keys the log line owns; client data can't overwrite them. */
const RESERVED = new Set(["evt", "mid", "uid", "kind"]);

/** Periodic stats: 1 per 5 s per socket. Events: bursts of 3 per 5 s per socket. */
export const DIAG_RATE_RULES: Record<MeetingDiagKind, RateRule> = {
  periodic: { limit: 1, windowMs: 5_000 },
  event: { limit: 3, windowMs: 5_000 }
};

export function diagRateKey(socketId: string, kind: MeetingDiagKind): string {
  return `socket:${socketId}:diag:${kind}`;
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.length <= MAX_STRING;
}

/** The `diag` message, or null when it isn't one we accept (raw size checked by the caller). */
export function parseDiag(msg: Record<string, unknown>): Extract<MeetingClientMessage, { t: "diag" }> | null {
  if (msg.kind !== "periodic" && msg.kind !== "event") return null;
  const data = msg.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length > MAX_KEYS) return null;
  const clean: MeetingDiagData = {};
  for (const [key, value] of entries) {
    if (!KEY.test(key) || RESERVED.has(key) || !isPrimitive(value)) return null;
    clean[key] = value;
  }
  return { t: "diag", kind: msg.kind, data: clean };
}

export function isDiagWithinSize(raw: string): boolean {
  return new TextEncoder().encode(raw).byteLength <= MEETING_DIAG_MAX_BYTES;
}

export function diagLogLine(mid: string | null, uid: string, message: Extract<MeetingClientMessage, { t: "diag" }>): string {
  return logLine("client", mid, uid, { kind: message.kind, ...message.data });
}
