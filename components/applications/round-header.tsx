import type { ReactNode } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Toolbar } from "@/components/kit/action-bar";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatPacific } from "@/src/lib/applications/format";

export type RoundTab = "applicants" | "desk" | "settings";

const STATUS: Record<"DRAFT" | "PUBLISHED" | "CLOSED", { label: string; tone: "muted" | "success" | "neutral" }> = {
  DRAFT: { label: "Hidden draft", tone: "muted" },
  PUBLISHED: { label: "Published", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" }
};

/** A round's header on the reviewer side, with Applicants / Decision desk / Settings tabs. */
export function RoundHeader({
  round,
  tab,
  toolbar
}: {
  round: { id: string; title: string; positionLabel: string; status: "DRAFT" | "PUBLISHED" | "CLOSED"; dueAt: string; releaseAt: string | null };
  tab: RoundTab;
  /** Round-level tools on the right of the tab row (h-8). */
  toolbar?: ReactNode;
}) {
  const status = STATUS[round.status];
  const base = `/applications/manage/${round.id}`;
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={round.positionLabel}
        status={
          <>
            <StatusTag tone={status.tone}>{status.label}</StatusTag>
            {round.releaseAt ? (
              <StatusTag tone={new Date(round.releaseAt) <= new Date() ? "success" : "info"}>
                {new Date(round.releaseAt) <= new Date() ? "Decisions released" : `Release ${formatPacific(round.releaseAt)}`}
              </StatusTag>
            ) : null}
          </>
        }
        title={round.title}
        description={`Due ${formatPacific(round.dueAt)}`}
        actions={
          // Reviewers can open the student form even while the round is a hidden draft.
          <Link href={`/applications/${round.id}` as never} className={buttonVariants({ variant: "outline" })}>
            <Eye aria-hidden />
            Preview as student
          </Link>
        }
      />
      <Toolbar
        aria-label="Round"
        size="sm"
        className="justify-between"
        start={
          <SegmentedControl
            ariaLabel="Round views"
            size="sm"
            value={tab}
            options={[
              { value: "applicants", label: "Applicants", href: base },
              { value: "desk", label: "Decision desk", href: `${base}/desk` },
              { value: "settings", label: "Settings", href: `${base}/settings` }
            ]}
          />
        }
        end={toolbar}
      />
    </div>
  );
}
