import type { PlatformRole } from "@prisma/client";
import { isPlatformSuperAdmin } from "@/src/lib/platform-admin";

export type AssistantAudience = "member" | "associate" | "executive" | "admin";

/**
 * Gemini 3.1 Flash-Lite quotas are per project and shown in AI Studio.
 * Flash-Lite free tier is historically ~15 RPM / ~250k TPM / ~1k RPD
 * (https://ai.google.dev/gemini-api/docs/rate-limits). Each Portal question is
 * typically 2 generateContent calls (~6–8k input tokens), worst 7.
 *
 * Sized for a ~40-person class with ~50% RPD headroom if everyone hits the
 * daily cap: 25 members × 5 + 10 associates × 12 + 6 execs × 25 = 395
 * questions × 2.5 calls ≈ 990 RPD. Global 5 questions/min stays under 15 RPM.
 */
export const ASSISTANT_USAGE = {
  member: { burstMax: 3, burstWindowMs: 10 * 60 * 1000, dayMax: 5 },
  associate: { burstMax: 6, burstWindowMs: 10 * 60 * 1000, dayMax: 12 },
  executive: { burstMax: 10, burstWindowMs: 10 * 60 * 1000, dayMax: 25 },
  admin: { burstMax: 10, burstWindowMs: 10 * 60 * 1000, dayMax: 25 }
} as const;

export const ASSISTANT_GLOBAL_USAGE = {
  burstMax: 5,
  burstWindowMs: 60_000,
  dayMax: 400,
  dayWindowMs: 24 * 60 * 60 * 1000
} as const;

export const ASSISTANT_PRODUCER_DOC_IDS = new Set([
  "accounts-and-admin",
  "groups-and-review",
  "members",
  "nas-storage",
  "publishing-queue"
]);

const MEMBER_LOOKUPS = ["list_groups", "get_group", "list_cycle_dates"] as const;
const ASSOCIATE_LOOKUPS = [
  "list_people",
  "list_packages",
  "list_groups",
  "list_my_groups",
  "get_group",
  "list_cycle_dates",
  "list_producers",
  "list_queue"
] as const;
const GRADE_LOOKUPS = ["get_grades"] as const;

export function assistantAudience(role: PlatformRole | null): AssistantAudience {
  if (isPlatformSuperAdmin(role)) {
    return "admin";
  }
  if (role === "EXECUTIVE_PRODUCER") {
    return "executive";
  }
  if (role === "ASSOCIATE_PRODUCER") {
    return "associate";
  }
  return "member";
}

export function assistantLookupNames(audience: AssistantAudience): readonly string[] {
  if (audience === "member") {
    return MEMBER_LOOKUPS;
  }
  if (audience === "associate") {
    return ASSOCIATE_LOOKUPS;
  }
  return [...ASSOCIATE_LOOKUPS, ...GRADE_LOOKUPS];
}

export function assistantDocAllowed(id: string, audience: AssistantAudience) {
  if (audience !== "member") {
    return true;
  }
  return !ASSISTANT_PRODUCER_DOC_IDS.has(id);
}

export function assistantUsageFor(audience: AssistantAudience) {
  return ASSISTANT_USAGE[audience];
}

export function assistantRoleLabel(audience: AssistantAudience) {
  if (audience === "member") {
    return "a student";
  }
  if (audience === "associate") {
    return "an associate producer";
  }
  if (audience === "executive") {
    return "an executive producer";
  }
  return "a super admin or the adviser";
}

export function assistantWhoLine(audience: AssistantAudience, actorName?: string | null) {
  const role = assistantRoleLabel(audience);
  const who = actorName?.trim();
  if (!who) {
    return `This person is already signed in as ${role}. Never ask their name or which account they are on.`;
  }
  return `You are talking to ${who}, ${role}. Never ask their name or which account they are on.`;
}

export const ASSISTANT_QUOTA_MESSAGE = "You've asked enough for now. Try again later.";
