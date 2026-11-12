import { handleRouteError } from "@/src/lib/api-errors";
import { buildCsv, csvFilename, csvResponse } from "@/src/lib/csv";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { loadExportViewer } from "@/src/server/export-viewer";

type Person = { name: string | null; nickname: string | null; email: string | null };

function label(person: Person | null | undefined) {
  return person ? userDisplayName(person) || person.email || "" : "";
}

/**
 * Every extension request with its decision, days requested and granted, and each producer's vote.
 * Producers (AP+) see the whole queue on /extension-requests; students only their own groups, so
 * the full-record export is producers only.
 */
export async function GET() {
  try {
    const { role } = await loadExportViewer();
    if (!hasPlatformRole(role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const personSelect = { select: { id: true, name: true, nickname: true, email: true } } as const;
    const requests = await prisma.packageExtensionRequest.findMany({
      select: {
        cycleNumber: true,
        requestedDays: true,
        grantedDays: true,
        grantedUserIds: true,
        producerGranted: true,
        reason: true,
        status: true,
        decidedAt: true,
        createdAt: true,
        user: personSelect,
        progressRow: {
          select: {
            groupTopic: true,
            members: { select: { user: personSelect } }
          }
        },
        approvals: {
          select: { approved: true, reason: true, createdAt: true, user: personSelect },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ cycleNumber: "desc" }, { createdAt: "desc" }]
    });

    const csv = buildCsv(
      [
        "Cycle",
        "Package",
        "Requested by",
        "Requested at",
        "Kind",
        "Reason",
        "Days requested",
        "Days granted",
        "Covers",
        "Status",
        "Decided at",
        "Producer votes"
      ],
      requests.map((request) => {
        const members = request.progressRow?.members.map((member) => member.user) ?? [];
        const covered = request.grantedUserIds.length
          ? members.filter((member) => request.grantedUserIds.includes(member.id))
          : members;
        const granted = request.status === "APPROVED" ? request.grantedDays ?? request.requestedDays : null;
        return [
          request.cycleNumber,
          request.progressRow?.groupTopic ?? "",
          label(request.user),
          request.createdAt.toISOString(),
          request.producerGranted ? "Producer grant" : "Student request",
          request.reason,
          request.requestedDays,
          granted,
          request.grantedUserIds.length ? covered.map(label).join("; ") : "Whole group",
          request.status,
          request.decidedAt?.toISOString() ?? "",
          request.approvals
            .map((vote) => `${label(vote.user)}: ${vote.approved ? "approved" : "denied"}${vote.reason ? ` (${vote.reason})` : ""}`)
            .join("; ")
        ];
      })
    );
    return csvResponse(csvFilename("extension-requests"), csv);
  } catch (error) {
    return handleRouteError(error);
  }
}
