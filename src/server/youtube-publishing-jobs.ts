import { inngest } from "@/src/lib/inngest";
import { advanceYoutubePublication, dueYoutubePackageIds } from "@/src/server/youtube-publishing";

// Wakes every 15 minutes (on the hour, so packages start at the publish hour). While packages are
// due it keeps checking each minute until none are left (or the next tick is due, which skips
// while this run is still going).
const ACTIVE_POLL_ROUNDS = 14;

export const discoverYoutubePublications = inngest.createFunction(
  { id: "youtube-publications-discover", singleton: { mode: "skip" } },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    let count = 0;
    for (let round = 0; round < ACTIVE_POLL_ROUNDS; round++) {
      if (round > 0) await step.sleep(`wait-${round}`, "1m");
      let cursor: string | undefined;
      let found = 0;
      for (let page = 0; ; page++) {
        const afterId = cursor;
        const ids: string[] = await step.run(`find-due-packages-${round}-${page}`, () => dueYoutubePackageIds(new Date(), afterId));
        if (ids.length) await step.sendEvent(`advance-due-packages-${round}-${page}`, ids.map((rowId) => ({
          name: "youtube/publication.advance", data: { rowId }
        })));
        found += ids.length;
        if (ids.length < 100) break;
        cursor = ids[ids.length - 1];
      }
      count += found;
      if (!found) break;
    }
    return { count };
  }
);

export const publishYoutubePackage = inngest.createFunction(
  { id: "youtube-package-publish", concurrency: { limit: 1, key: "event.data.rowId" } },
  { event: "youtube/publication.advance" },
  async ({ event, step }) => {
    const rowId = event.data.rowId;
    if (typeof rowId !== "string" || !rowId) return { skipped: true };
    for (let chunk = 0; chunk < 8; chunk++) {
      // Secrets and signed URLs stay inside the step; only a boolean is persisted by Inngest.
      const result = await step.run(`advance-${chunk}`, () => advanceYoutubePublication(rowId));
      if (!result.more) break;
    }
    return { checked: true };
  }
);
