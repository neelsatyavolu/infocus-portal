import { inngest } from "@/src/lib/inngest";
import { syncFinalsWeeks } from "@/src/server/finals-calendar-sync";

export const syncFinalsWeeksDaily = inngest.createFunction(
  { id: "finals-weeks-sync-daily", retries: 2 },
  // 10:00 UTC, in the small hours Pacific, so a change to the school's calendar shows up by morning.
  { cron: "0 10 * * *" },
  async ({ step }) => step.run("sync-finals-weeks", () => syncFinalsWeeks())
);
