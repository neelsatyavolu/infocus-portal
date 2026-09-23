import { inngest } from "@/src/lib/inngest";
import { advanceYoutubePublication, dueYoutubePackageIds } from "@/src/server/youtube-publishing";

export const discoverYoutubePublications = inngest.createFunction(
  { id: "youtube-publications-discover", concurrency: 1 },
  { cron: "* * * * *" },
  async ({ step }) => {
    let cursor: string | undefined;
    let count = 0;
    for (let page = 0; ; page++) {
      const afterId = cursor;
      const ids: string[] = await step.run(`find-due-packages-${page}`, () => dueYoutubePackageIds(new Date(), afterId));
      if (ids.length) await step.sendEvent(`advance-due-packages-${page}`, ids.map((rowId) => ({
        name: "youtube/publication.advance", data: { rowId }
      })));
      count += ids.length;
      if (ids.length < 100) break;
      cursor = ids[ids.length - 1];
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
