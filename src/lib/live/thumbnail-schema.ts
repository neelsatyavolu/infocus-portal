import { z } from "zod";
import { THUMBNAIL_FORMATS, THUMBNAIL_TEMPLATES } from "@/src/lib/live/thumbnail";

// Zod schema lives apart from thumbnail so the live dashboard doesn't bundle zod.

const MAX_FINAL_SCORE = 999;
const finalScoreSchema = z.coerce.number().int().min(0).max(MAX_FINAL_SCORE).default(0);

export const thumbnailQuerySchema = z.object({
  template: z.enum(THUMBNAIL_TEMPLATES).default("matchup"),
  format: z.enum(THUMBNAIL_FORMATS).default("youtube"),
  home: z.string().trim().max(18).default("Paly"),
  away: z.string().trim().max(18).default(""),
  line: z.string().trim().max(40).default(""),
  homeScore: finalScoreSchema,
  awayScore: finalScoreSchema,
  title: z.string().trim().max(60).default(""),
  location: z.string().trim().max(30).default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  download: z.enum(["1"]).optional()
});
