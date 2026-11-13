import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { CreateRoundButton } from "@/components/applications/create-round-button";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatPacific } from "@/src/lib/applications/format";
import { getApplicationsViewer } from "@/src/server/applications/access";
import { listRounds } from "@/src/server/applications/rounds";

export const metadata: Metadata = { title: "Review" };

const STATUS = {
  DRAFT: { label: "Hidden draft", tone: "muted" },
  PUBLISHED: { label: "Published", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" }
} as const;

export default async function ManageRoundsPage() {
  const viewer = await getApplicationsViewer();
  if (!viewer.isReviewer) redirect("/applications" as never);
  const rounds = await listRounds();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Reviewers"
        title="Application rounds"
        description="Each round is one application window. Drafts stay hidden from students until you publish them."
        actions={viewer.canManage ? <CreateRoundButton /> : null}
      />
      {rounds.length === 0 ? (
        <EmptyState
          size="page"
          icon={Inbox}
          title="No rounds yet"
          description={viewer.canManage ? "Create one from this year's 3-section template." : "Executive producers create rounds."}
        />
      ) : (
        <div className="space-y-3">
          {rounds.map((round) => (
            <Panel
              key={round.id}
              eyebrow={round.positionLabel}
              title={round.title}
              status={<StatusTag tone={STATUS[round.status].tone}>{STATUS[round.status].label}</StatusTag>}
              description={`Due ${formatPacific(round.dueAt)} · ${round.submitted} submitted`}
              actions={
                <Link href={`/applications/manage/${round.id}` as never} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Open
                </Link>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
