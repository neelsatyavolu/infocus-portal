import { z } from "zod";

// Zod schemas live apart from producer-feedback so client components importing
// its constants and types don't bundle zod.
export const producerFeedbackSchema = z.object({
  helpfulness: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  support: z.number().int().min(1).max(5),
  body: z.string().trim().min(10).max(2000)
});
export const savedProducerFeedbackSchema = producerFeedbackSchema.extend({
  cycleNumber: z.number().int().positive(), producerId: z.string().min(1), groupTopic: z.string()
});
