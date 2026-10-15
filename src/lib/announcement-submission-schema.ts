import { z } from "zod";
import {
  MAX_SHOW_DAYS,
  RUN_ON_OPTIONS,
  showDatesInRange,
  SUBMITTER_KIND_OPTIONS,
  type RunOn,
  type SubmitterKind
} from "@/src/lib/announcement-submission";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";

// Zod schema lives apart from announcement-submission so client components
// importing its options and date helpers don't bundle zod.

const submitterKindValues = SUBMITTER_KIND_OPTIONS.map((option) => option.value) as [SubmitterKind, ...SubmitterKind[]];
const runOnValues = RUN_ON_OPTIONS.map((option) => option.value) as [RunOn, ...RunOn[]];

export const announcementSubmitSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email."),
    name: z.string().trim().min(1, "Name is required.").max(120),
    submitterKind: z.enum(submitterKindValues),
    runOn: z.enum(runOnValues),
    announcement: z.string().trim().min(1, "Announcement text is required.").max(4000),
    startDate: z.string().regex(DATE_KEY_PATTERN, "Start date is required."),
    endDate: z.string().regex(DATE_KEY_PATTERN, "End date is required."),
    policyAgreed: z.literal(true, {
      errorMap: () => ({ message: "You must agree to the InFocus announcement policy." })
    }),
    mediaLink: z
      .string()
      .trim()
      .max(500)
      .optional()
      .or(z.literal(""))
      .transform((value) => value || undefined)
      .refine((value) => !value || /^https?:\/\//i.test(value), "Media link must be a full URL."),
    moreInfo: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .or(z.literal(""))
      .transform((value) => value || undefined)
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date cannot be before the start date."
      });
      return;
    }

    if (showDatesInRange(value.startDate, value.endDate).length > MAX_SHOW_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: `Announcements can run for at most ${MAX_SHOW_DAYS} consecutive show days.`
      });
    }
  });
