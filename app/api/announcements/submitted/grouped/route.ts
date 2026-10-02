import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import {
  airWindowFor,
  formatAnnouncementCopy,
  formatAnnouncementListCopy,
  groupSubmittedAnnouncements,
  runOnLabel,
  submitterKindLabel
} from "@/src/lib/announcement-submission";
import { COLLEGE_VISITS_SPREADSHEET_ID } from "@/src/lib/college-visits";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole, isExecutiveProducer } from "@/src/lib/platform-admin";
import { fetchSubmittedAnnouncements } from "@/src/server/announcement-submissions";

/**
 * Submitted announcements already grouped the way /announcements/submitted shows them (same
 * buckets, labels and copy text), so the iPhone app never re-implements the air-date rules.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const data = await fetchSubmittedAnnouncements({ includeSchoologyOnly: true });
    const windows = data.announcements.map((entry) => airWindowFor(entry));
    return ok({
      canDelete: hasPlatformRole(access.role, "ASSOCIATE_PRODUCER"),
      canInvite: isExecutiveProducer(access.role),
      collegeVisitsUrl: `https://docs.google.com/spreadsheets/d/${COLLEGE_VISITS_SPREADSHEET_ID}/edit?usp=sharing`,
      retrievedAt: data.meta.retrievedAt,
      total: data.announcements.length,
      airToday: windows.filter((window) => window.airsToday).length,
      airTomorrow: windows.filter((window) => window.airsTomorrow && !window.airsToday).length,
      buckets: groupSubmittedAnnouncements(data.announcements).map((bucket) => ({
        id: bucket.id,
        title: bucket.title,
        defaultOpen: bucket.defaultOpen,
        copyText: formatAnnouncementListCopy(bucket.entries.map((entry) => entry.announcement)),
        entries: bucket.entries.map((entry) => ({
          id: entry.id,
          announcement: entry.announcement,
          copyText: formatAnnouncementCopy(entry.announcement),
          destination: runOnLabel(entry.runOn) || entry.category,
          submitterRole: submitterKindLabel(entry.submitterKind),
          name: entry.name,
          email: entry.email,
          isPermanent: Boolean(entry.isPermanent),
          startDate: entry.startDateIso?.slice(0, 10) || entry.startDate,
          endDate: entry.endDateIso?.slice(0, 10) || entry.endDate,
          submittedAt: entry.timestampIso ?? entry.timestamp,
          mediaLink: entry.mediaLink,
          moreInfo: entry.moreInfo
        }))
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
