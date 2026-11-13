import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { RoundHeader } from "@/components/applications/round-header";
import { RoundSettingsForm } from "@/components/applications/round-settings-form";
import { Alert } from "@/components/kit/alert";
import { parseApplicationConfig } from "@/src/lib/applications/config";
import { getApplicationsViewer } from "@/src/server/applications/access";
import { getRoundOrThrow, roughCutSourceText } from "@/src/server/applications/rounds";

export const metadata: Metadata = { title: "Round settings" };

export default async function RoundSettingsPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const viewer = await getApplicationsViewer();
  if (!viewer.isReviewer) redirect("/applications" as never);
  const round = await getRoundOrThrow(roundId).catch(() => notFound());
  const header = {
    id: round.id,
    title: round.title,
    positionLabel: round.positionLabel,
    status: round.status,
    dueAt: round.dueAt.toISOString(),
    releaseAt: round.releaseAt?.toISOString() ?? null
  };

  return (
    <div className="space-y-5">
      <RoundHeader round={header} tab="settings" />
      {viewer.canManage ? null : <Alert tone="info" title="View only">Only executive producers and the super admin change round settings.</Alert>}
      <RoundSettingsForm
        // Remount after each save so the form holds the round's new updatedAt (stale-save check).
        key={round.updatedAt.toISOString()}
        readOnly={!viewer.canManage}
        initial={{
          ...header,
          updatedAt: round.updatedAt.toISOString(),
          intro: round.intro,
          opensAt: round.opensAt?.toISOString() ?? null,
          allowUnsubmit: round.allowUnsubmit,
          roughCutSource: roughCutSourceText(round),
          config: parseApplicationConfig(round.config)
        }}
      />
    </div>
  );
}
