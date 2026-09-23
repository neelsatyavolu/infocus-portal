import { z } from "zod";

// Temporarily paused at the user's request; re-enable only when they ask.
export const PRODUCER_FEEDBACK_ENABLED = false;
export const PRODUCER_FEEDBACK_ACTION = "group.producer.feedback";
export const producerFeedbackSchema = z.object({
  helpfulness: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  support: z.number().int().min(1).max(5),
  body: z.string().trim().min(10).max(2000)
});
export const savedProducerFeedbackSchema = producerFeedbackSchema.extend({
  cycleNumber: z.number().int().positive(), producerId: z.string().min(1), groupTopic: z.string()
});
export type GroupProducerFeedback = z.infer<typeof savedProducerFeedbackSchema> & { rowId: string; updatedAt: string };
export type ProducerFeedbackGroup = {
  rowId: string; cycleNumber: number; topic: string; producerName: string | null; submitted: boolean
};
