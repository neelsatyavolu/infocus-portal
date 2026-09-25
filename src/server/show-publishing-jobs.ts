import { inngest } from "@/src/lib/inngest";
import { advanceShowPublication, dueShowPublicationIds } from "@/src/server/show-publishing-worker";

export const SHOW_PUBLICATION_EVENT = "youtube/show-publication.advance";

export const discoverShowPublications = inngest.createFunction(
  { id: "youtube-show-publications-discover", concurrency: 1 },
  { cron: "* * * * *" },
  async ({ step }) => {
    const ids: string[] = await step.run("find-active-shows", () => dueShowPublicationIds());
    if (ids.length) await step.sendEvent("advance-active-shows", ids.map((id) => ({
      name: SHOW_PUBLICATION_EVENT, data: { id }
    })));
    return { count: ids.length };
  }
);

// Global limit 1: shows are one per day, and it keeps two uploads from both creating a new season.
export const publishYoutubeShow = inngest.createFunction(
  { id: "youtube-show-publish", concurrency: { limit: 1 } },
  { event: SHOW_PUBLICATION_EVENT },
  async ({ event, step }) => {
    const id = event.data.id;
    if (typeof id !== "string" || !id) return { skipped: true };
    for (let chunk = 0; chunk < 8; chunk++) {
      // Secrets and signed URLs stay inside the step; only a boolean is persisted by Inngest.
      const result = await step.run(`advance-${chunk}`, () => advanceShowPublication(id));
      if (!result.more) break;
    }
    return { checked: true };
  }
);
