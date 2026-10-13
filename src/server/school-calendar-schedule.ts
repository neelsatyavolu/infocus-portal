import { inngest } from "@/src/lib/inngest";
import { syncSchoolCalendar } from "@/src/server/school-calendar-sync";

/** Keeps the school calendar current: new school years, summers and finals weeks. */
export const syncSchoolCalendarDaily = inngest.createFunction(
  { id: "school-calendar-sync-daily", retries: 2 },
  // 10:00 UTC, in the small hours Pacific, so a change to the school's calendar shows up by morning.
  { cron: "0 10 * * *" },
  async ({ step }) => step.run("sync-school-calendar", () => syncSchoolCalendar())
);
