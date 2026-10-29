import { dateKeyInTimeZone } from "@/src/lib/announcement-submission";
import { relativizeShowDayDates } from "@/src/lib/announcement-relative-dates";
import { loadCollegeVisitBulletinAnnouncement } from "@/src/lib/college-visits-sheet";
import { mergeCollegeVisitIntoBulletin } from "@/src/lib/college-visits";
import { formatAnnouncementsForTeleprompter } from "@/src/lib/teleprompter-announcement-formatting";
import {
  TELEPROMPTER_TIME_ZONE,
  renderA2BulletinContent,
  renderA2UnavailableContent,
  selectAnnouncementsForBulletin
} from "@/src/lib/teleprompter-template";
import { fetchSubmittedAnnouncements } from "@/src/server/announcement-submissions";
import type { SubmittedAnnouncement } from "@/src/lib/submitted-announcements";

export type BulletinAutofill =
  | {
      status: "ok";
    }
  | {
      status: "warning";
      message: string;
    }
  | {
      status: "unavailable";
      message: string;
    };

export async function loadA2Bulletin(showDate: Date, options: { pa?: boolean } = {}): Promise<{
  content: string;
  announcements: SubmittedAnnouncement[];
  autofill: BulletinAutofill;
}> {
  const showDateKey = dateKeyInTimeZone(showDate, TELEPROMPTER_TIME_ZONE);
  const relativize = (list: SubmittedAnnouncement[]) =>
    list.map((entry) => ({ ...entry, announcement: relativizeShowDayDates(entry.announcement, showDateKey) }));
  let selected: SubmittedAnnouncement[] = [];
  let announcementsFailed = false;

  try {
    const submitted = await fetchSubmittedAnnouncements({ includeSchoologyOnly: false });
    selected = selectAnnouncementsForBulletin({
      announcements: submitted.announcements,
      showDate,
      timeZone: TELEPROMPTER_TIME_ZONE,
      pa: options.pa
    });
  } catch {
    announcementsFailed = true;
  }

  let merged = selected;
  try {
    const collegeVisit = await loadCollegeVisitBulletinAnnouncement(showDate);
    merged = mergeCollegeVisitIntoBulletin(selected, collegeVisit);
  } catch (error) {
    console.error("A2 bulletin: college visits unavailable", error);
    merged = selected;
  }

  if (merged.length === 0) {
    return {
      content: announcementsFailed ? renderA2UnavailableContent() : "",
      announcements: [],
      autofill: announcementsFailed
        ? {
            status: "unavailable",
            message: "Announcements autofill is unavailable right now. A2 was created with empty announcement slots."
          }
        : {
            status: "ok"
          }
    };
  }

  try {
    const formatted = await formatAnnouncementsForTeleprompter(merged);
    const announcements = relativize(formatted.announcements);
    const content = renderA2BulletinContent(announcements);
    if (selected.length > 0 && !formatted.usedGemini) {
      return {
        content,
        announcements,
        autofill: {
          status: "warning",
          message:
            "Announcements were loaded, but Gemini formatting is unavailable right now, so A2 kept the original wording."
        }
      };
    }

    if (announcementsFailed) {
      return {
        content,
        announcements,
        autofill: {
          status: "warning",
          message: "Submitted announcements could not be loaded, so A2 includes college visits only."
        }
      };
    }

    return {
      content,
      announcements,
      autofill: {
        status: "ok"
      }
    };
  } catch {
    const announcements = relativize(merged);
    return {
      content: renderA2BulletinContent(announcements),
      announcements,
      autofill: {
        status: "warning",
        message: "Announcements were loaded, but Gemini formatting failed, so A2 kept the original wording."
      }
    };
  }
}
