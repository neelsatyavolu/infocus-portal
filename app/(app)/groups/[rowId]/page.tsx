import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { pendingGroupNavSlug } from "@/src/lib/package-stages";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

export default async function GroupDetailPage({ params }: { params: Promise<{ rowId: string }> }) {
  const { platformRole } = await getCurrentAppUser();
  if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
    redirect("/access-denied");
  }

  const { rowId } = await params;
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: rowId },
    select: {
      pitching: true,
      proofOfContact: true,
      aRollBRoll: true,
      finalCut: true,
      approval: { select: { stage: true } }
    }
  });
  if (!row) {
    redirect("/groups");
  }

  redirect(
    `/groups/${rowId}/${pendingGroupNavSlug({
      pitching: row.pitching,
      proofOfContact: row.proofOfContact,
      aRollBRoll: row.aRollBRoll,
      finalCut: row.finalCut,
      approvalStage: row.approval?.stage ?? "DRAFT"
    })}` as never
  );
}
