import { z } from "zod";

export const CommentTargetTypes = ["TIMECODE", "FRAME_PIN", "GENERAL"] as const;
export type CommentTargetType = (typeof CommentTargetTypes)[number];

export const commentPayloadSchema = z
  .object({
    mediaVersionId: z.string().cuid(),
    targetType: z.enum(CommentTargetTypes),
    timeSeconds: z.number().min(0).optional(),
    frameNumber: z.number().int().min(0).optional(),
    xPct: z.number().min(0).max(100).optional(),
    yPct: z.number().min(0).max(100).optional(),
    body: z.string().trim().min(1).max(2000),
    parentCommentId: z.string().cuid().optional()
  })
  .superRefine((value, ctx) => {
    if (value.targetType !== "GENERAL" && value.timeSeconds === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "timeSeconds is required for timeline comments",
        path: ["timeSeconds"]
      });
    }

    if (value.targetType === "FRAME_PIN" && value.frameNumber === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "frameNumber is required for frame pin comments",
        path: ["frameNumber"]
      });
    }

    if (
      value.targetType === "FRAME_PIN" &&
      (value.xPct === undefined || value.yPct === undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "xPct and yPct are required for frame pin comments",
        path: ["xPct"]
      });
    }
  });

export const replyPayloadSchema = z.object({
  body: z.string().trim().min(1).max(2000)
});

export function extractMentionUserIds(body: string) {
  const ids = new Set<string>();
  const re = /@\[([^\]|]+)(?:\|[^\]]+)?\]/g;

  let result = re.exec(body);
  while (result) {
    ids.add(result[1]);
    result = re.exec(body);
  }

  return [...ids];
}
