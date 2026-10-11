import { NonRetriableError } from "inngest";
import { IDEA_MIN_ITEMS } from "@/src/lib/ideas";
import { inngest } from "@/src/lib/inngest";
import { checkIdeaRunDue, loadIdeaFeedItems, requestIdeas, storeIdeaBatch } from "@/src/server/ideas";

/** Asks for a run now. It still only generates when a batch is due. */
export const IDEAS_GENERATE_EVENT = "ideas/generate.requested";

export const generateIdeasDaily = inngest.createFunction(
  // A run that starts while another is going is skipped, so two can never both call the model.
  { id: "ideas-generate-daily", singleton: { mode: "skip" }, retries: 1 },
  // 23:30 UTC, half an hour before Cloudflare's free daily neurons reset, so a run spends what
  // would expire anyway and the evening's meetings start with a full allowance.
  [{ cron: "30 23 * * *" }, { event: IDEAS_GENERATE_EVENT }],
  async ({ step }) => {
    const check = await step.run("check-due", () => checkIdeaRunDue());
    if (!check.due) return { status: check.reason };
    const items = await step.run("load-feeds", () => loadIdeaFeedItems());
    if (items.length < IDEA_MIN_ITEMS) return { status: "too_few_items" as const, items: items.length };
    const generated = await step.run("request-ideas", async () => {
      try {
        return await requestIdeas(items);
      } catch (error) {
        // A reply that was cut off or unusable has already been billed. Never retry the model
        // call: one attempt a run, and the next daily check tries again.
        throw new NonRetriableError(error instanceof Error ? error.message : "The ideas request failed.", { cause: error });
      }
    });
    return step.run("store-batch", () => storeIdeaBatch({ runDate: check.runDate, itemCount: items.length, ...generated }));
  }
);
