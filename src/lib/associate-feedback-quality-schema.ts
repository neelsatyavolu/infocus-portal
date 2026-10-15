import { z } from "zod";
import { QUALITY_DIMENSIONS, type QualitySample } from "@/src/lib/associate-feedback-quality";

// Zod schema and the parse step live apart from associate-feedback-quality so
// client components importing its constants don't bundle zod.
const rating = z.number().int().min(0).max(4);
export const qualityResultSchema = z.object({ items: z.array(z.object({
  ref: z.string().min(1), specificity: rating, actionability: rating, reasoning: rating, constructiveness: rating,
  reason: z.string().min(1).max(500), quote: z.string().min(1).max(600)
}).strict()).min(1).max(12) }).strict();
export type QualityResult = z.infer<typeof qualityResultSchema>;

export function summarizeQuality(result: unknown, samples: QualitySample[]) {
  const parsed = qualityResultSchema.parse(result);
  if (parsed.items.length !== samples.length || new Set(parsed.items.map((i) => i.ref)).size !== samples.length) throw new Error("Invalid evaluation coverage");
  const items = parsed.items.map((item) => {
    const sample = samples.find((s) => s.ref === item.ref);
    if (!sample || !sample.text.includes(item.quote)) throw new Error("Unsupported evaluation evidence");
    const score = Object.entries(QUALITY_DIMENSIONS).reduce((sum, [key, weight]) => sum + item[key as keyof typeof QUALITY_DIMENSIONS] / 4 * weight, 0);
    return { ...item, noteId: sample.noteId, rowId: sample.rowId, stage: sample.stage, score: Math.round(score) };
  });
  const groupIds = [...new Set(items.map((i) => i.rowId))];
  const averageGroups = (value: (i: typeof items[number]) => number) => groupIds.reduce((sum, id) => {
    const group = items.filter((i) => i.rowId === id);
    return sum + group.reduce((total, i) => total + value(i), 0) / group.length;
  }, 0) / groupIds.length;
  return {
    score: Math.round(averageGroups((i) => i.score)), items,
    dimensions: Object.fromEntries(Object.keys(QUALITY_DIMENSIONS).map((k) => [k, Math.round(averageGroups((i) => i[k as keyof typeof QUALITY_DIMENSIONS] * 25))])) as Record<keyof typeof QUALITY_DIMENSIONS, number>
  };
}
