import { handleRouteError } from "@/src/lib/api-errors";
import { buildCsv, csvFilename, csvResponse } from "@/src/lib/csv";
import { finalCutHeadline } from "@/src/lib/package-headline";
import { prisma } from "@/src/lib/prisma";
import { isCustomQueuePackage } from "@/src/lib/publishing-queue";
import { todayDateKey } from "@/src/lib/show-assignment";
import { userDisplayName } from "@/src/lib/user-display";
import { loadExportViewer } from "@/src/server/export-viewer";
import { requirePublishingViewer } from "@/src/server/publishing-access";

/**
 * Every package on the Publishing Queue, past shows included (air date before today), newest show
 * first. Same access as the page: producers, plus appointed website managers.
 */
export async function GET() {
  try {
    const { userId, role } = await loadExportViewer();
    await requirePublishingViewer(userId, role);

    const rows = await prisma.packageProgressRow.findMany({
      where: { queuedForAirAt: { not: null } },
      select: {
        cycleNumber: true,
        groupTopic: true,
        groupType: true,
        queuedForAirAt: true,
        queuedForShowDate: true,
        youtubePublication: { select: { status: true, videoId: true, publishedAt: true } },
        assignedProducer: { select: { name: true, nickname: true, email: true } },
        members: { select: { user: { select: { name: true, nickname: true, email: true } } } },
        finalCutMediaItem: { select: { title: true, currentVersion: { select: { nasPath: true } } } }
      },
      orderBy: [{ queuedForShowDate: "desc" }, { queuedForAirAt: "desc" }]
    });

    const today = todayDateKey();
    const csv = buildCsv(
      [
        "Show date",
        "Past show",
        "Cycle",
        "Topic",
        "Headline",
        "Custom",
        "Producer",
        "Members",
        "Queued at",
        "YouTube status",
        "YouTube link",
        "Published at"
      ],
      rows.map((row) => {
        const producer = row.assignedProducer;
        const videoId = row.youtubePublication?.videoId;
        return [
          row.queuedForShowDate ?? "",
          row.queuedForShowDate ? row.queuedForShowDate < today : false,
          row.cycleNumber,
          row.groupTopic,
          finalCutHeadline(row.finalCutMediaItem),
          isCustomQueuePackage(row),
          producer ? userDisplayName(producer) || producer.email : "",
          row.members.map((member) => userDisplayName(member.user) || member.user.email || "").join("; "),
          row.queuedForAirAt?.toISOString() ?? "",
          row.youtubePublication?.status ?? "",
          videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
          row.youtubePublication?.publishedAt?.toISOString() ?? ""
        ];
      })
    );
    return csvResponse(csvFilename("publishing-queue"), csv);
  } catch (error) {
    return handleRouteError(error);
  }
}
