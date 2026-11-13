import Link from "next/link";
import { FileText } from "lucide-react";
import { DecisionCard } from "@/components/applications/decision-card";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatPacific } from "@/src/lib/applications/format";
import { cn } from "@/src/lib/utils";
import { getApplicationsViewer } from "@/src/server/applications/access";
import { getApplicantHome } from "@/src/server/applications/applicant";

export default async function ApplicationsHomePage() {
  const viewer = await getApplicationsViewer();
  const rounds = await getApplicantHome(viewer);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="InFocus leadership"
        title="Applications"
        description={
          viewer.isReviewer
            ? "You're a reviewer. Opening an application here makes a test copy that's marked Mock, so you can try the form."
            : "Apply for open InFocus leadership positions. Your answers save as you go."
        }
        actions={
          viewer.isReviewer ? (
            <Link href={"/applications/manage" as never} className={buttonVariants({ variant: "default" })}>
              Review applications
            </Link>
          ) : null
        }
      />
      {rounds.length === 0 ? (
        <EmptyState
          size="page"
          icon={FileText}
          title="No open applications"
          description="When a leadership application opens, it shows up here."
        />
      ) : (
        <div className="space-y-4">
          {rounds.map((round) => (
            <div key={round.id} className="space-y-3">
              {round.decision ? <DecisionCard title={round.title} decision={round.decision} /> : null}
              <Panel
                title={round.title}
                eyebrow={round.positionLabel}
                status={<RoundStatus status={round.status} canEdit={round.canEdit} />}
                description={
                  round.submittedAt
                    ? `Submitted ${formatPacific(round.submittedAt)}`
                    : `Due ${formatPacific(round.dueAt)}`
                }
                actions={
                  <Link
                    href={`/applications/${round.id}` as never}
                    className={cn(buttonVariants({ variant: round.status === "SUBMITTED" || !round.canEdit ? "outline" : "default", size: "sm" }))}
                  >
                    {round.status === "SUBMITTED" || !round.canEdit ? "View" : round.status === "DRAFT" ? "Continue" : "Start"}
                  </Link>
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoundStatus({ status, canEdit }: { status: "DRAFT" | "SUBMITTED" | null; canEdit: boolean }) {
  if (status === "SUBMITTED") return <StatusTag tone="success">Submitted</StatusTag>;
  if (!canEdit) return <StatusTag tone="muted">Closed</StatusTag>;
  if (status === "DRAFT") return <StatusTag tone="warning">Draft</StatusTag>;
  return <StatusTag tone="info">Open</StatusTag>;
}
