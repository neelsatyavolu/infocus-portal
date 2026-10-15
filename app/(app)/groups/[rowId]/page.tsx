import { notFound, redirect } from "next/navigation";
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
    notFound();
  }

  const slug = pendingGroupNavSlug({
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    aRollBRoll: row.aRollBRoll,
    finalCut: row.finalCut,
    approvalStage: row.approval?.stage ?? "DRAFT"
  });
  // A cut sent back at Stage 2 or 3 resets the chain to Draft but its revisions stay at that
  // stage. Only the stage page loads what tells them apart, so its initial-cut alias picks the
  // step (the one the Groups tile, stage bar and approval path point at).
  const target = slug === "initial-stage-1" && row.approval?.stage === "DRAFT" ? "initial-cut" : slug;
  redirect(`/groups/${rowId}/${target}` as never);
}
