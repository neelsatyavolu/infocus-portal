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
  } catch {
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
    const content = renderA2BulletinContent(formatted.announcements);
    if (selected.length > 0 && !formatted.usedGemini) {
      return {
        content,
        announcements: formatted.announcements,
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
        announcements: formatted.announcements,
        autofill: {
          status: "warning",
          message: "Submitted announcements could not be loaded, so A2 includes college visits only."
        }
      };
    }

    return {
      content,
      announcements: formatted.announcements,
      autofill: {
        status: "ok"
      }
    };
  } catch {
    return {
      content: renderA2BulletinContent(merged),
      announcements: merged,
      autofill: {
        status: "warning",
        message: "Announcements were loaded, but Gemini formatting failed, so A2 kept the original wording."
      }
    };
  }
}
