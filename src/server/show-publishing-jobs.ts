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

// Each step sends one 8 MiB chunk as its own request; 600 steps covers a ~4.7 GB show in one run.
const MAX_STEPS_PER_RUN = 600;

// Singleton: one run at a time globally (shows are one per day, and it keeps two uploads from
// both creating a new season). While a run is sending, the minute-by-minute discovery is skipped.
export const publishYoutubeShow = inngest.createFunction(
  { id: "youtube-show-publish", singleton: { mode: "skip" } },
  { event: SHOW_PUBLICATION_EVENT },
  async ({ event, step }) => {
    const id = event.data.id;
    if (typeof id !== "string" || !id) return { skipped: true };
    for (let chunk = 0; chunk < MAX_STEPS_PER_RUN; chunk++) {
      // Secrets and signed URLs stay inside the step; only a boolean is persisted by Inngest.
      const result = await step.run(`advance-${chunk}`, () => advanceShowPublication(id));
      if (!result.more) break;
    }
    return { checked: true };
  }
);
