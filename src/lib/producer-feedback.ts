import type { z } from "zod";
import type { savedProducerFeedbackSchema } from "@/src/lib/producer-feedback-schema";

// Temporarily paused at the user's request; re-enable only when they ask.
export const PRODUCER_FEEDBACK_ENABLED = false;
export const PRODUCER_FEEDBACK_ACTION = "group.producer.feedback";
export type GroupProducerFeedback = z.infer<typeof savedProducerFeedbackSchema> & { rowId: string; updatedAt: string };
export type ProducerFeedbackGroup = {
  rowId: string; cycleNumber: number; topic: string; producerName: string | null; submitted: boolean
};
