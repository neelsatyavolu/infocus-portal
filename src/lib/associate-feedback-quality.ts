import type { QualityResult } from "@/src/lib/associate-feedback-quality-schema";

export type { QualityResult } from "@/src/lib/associate-feedback-quality-schema";

export const FEEDBACK_QUALITY_MODEL = "gemini-3.1-flash-lite";
export const FEEDBACK_QUALITY_RUBRIC = "producer-feedback-v1";
export const QUALITY_DIMENSIONS = { specificity: 30, actionability: 30, reasoning: 25, constructiveness: 15 } as const;
export type FeedbackNote = { id: string; rowId: string; topic: string; stage: string; body: string; createdAt: string };
export type QualitySample = { ref: string; noteId: string; rowId: string; stage: string; text: string };
export type FeedbackQuality = {
  status: "ready" | "not_scored" | "pending" | "unavailable" | "no_feedback";
  score: number | null; message: string; model: string; rubric: string;
  evaluatedAt: string | null; sampledNotes: number; totalNotes: number;
  dimensions: Record<keyof typeof QUALITY_DIMENSIONS, number> | null;
  items: Array<QualityResult["items"][number] & { noteId: string; rowId: string; stage: string; score: number }>;
};

export function anonymizeFeedback(text: string, names: string[]) {
  let value = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[link]");
  for (const name of [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 1))].sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    value = value.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[person]");
  }
  return value;
}

/** Round-robin across group/stage buckets rather than letting comment volume choose the sample. */
export function sampleFeedback(notes: FeedbackNote[], names: string[]): QualitySample[] {
  const buckets = new Map<string, FeedbackNote[]>();
  const seen = new Set<string>();
  for (const note of [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))) {
    const key = `${note.rowId}:${note.stage}`;
    const duplicate = `${key}:${note.body.trim()}`;
    if (seen.has(duplicate) || !note.body.trim()) continue;
    seen.add(duplicate);
    const bucket = buckets.get(key) ?? [];
    bucket.push(note);
    buckets.set(key, bucket);
  }
  const selected: QualitySample[] = [];
  const groups = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, notes]) => notes);
  for (let round = 0; selected.length < 12 && groups.some((g) => g[round]); round++) {
    for (const group of groups) {
      const note = group[round];
      if (!note || selected.length >= 12) continue;
      selected.push({ ref: `F${selected.length + 1}`, noteId: note.id, rowId: note.rowId, stage: note.stage,
        text: anonymizeFeedback(note.body.trim(), names).slice(0, 600) });
    }
  }
  return selected;
}
