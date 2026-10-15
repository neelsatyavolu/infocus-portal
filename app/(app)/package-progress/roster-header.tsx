import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, Eye } from "lucide-react";
import { cycleLabel } from "@/components/kit/format";
import { SaveState, StatusTag, type SaveStateValue } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import type { CycleStatus, CycleTab } from "./roster-model";

const DEFAULT_DESCRIPTION = "Topics, reporters and one producer for each package.";

const CYCLE_STATUS_TAG: Record<CycleStatus, { label: string; tone: "success" | "neutral" | "muted" }> = {
  active: { label: "Active", tone: "success" },
  planned: { label: "Planned", tone: "neutral" },
  closed: { label: "Closed", tone: "muted" }
};

/**
 * The header plate. Eyebrow "Roster · Cycle 03" with the cycle's Active / Planned / Closed tag
 * and the save state (or View only). While editing, the save tag always shows, so editors can see
 * that changes save automatically before their first edit. The line of context is the cycle's
 * focus (or the default line when it has none) and the cycle's span ("Sep 2 – Oct 3"), one line
 * on phones. Actions: Open Groups, then the one primary, Add group. Beside Add group on phones,
 * Open Groups is a square icon button so Add group gets the rest of the row.
 */
export function RosterHeader({
  cycle,
  status,
  span,
  canEdit,
  editing,
  saveState,
  addGroup
}: {
  cycle: CycleTab | null;
  status: CycleStatus | null;
  /** Pitch date to Final Cut date, when both are set. */
  span: string | null;
  canEdit: boolean;
  /** Edit mode (editors only). */
  editing: boolean;
  saveState: SaveStateValue;
  /** The Add group button (editors, when the roster has groups). */
  addGroup: ReactNode;
}) {
  const about = cycle?.focus?.trim() || DEFAULT_DESCRIPTION;
  return (
    <PageHeader
      eyebrow={`Roster · ${cycle ? cycleLabel(cycle.cycleNumber) : "Cycle —"}`}
      status={
        <>
          {status ? (
            <StatusTag tone={CYCLE_STATUS_TAG[status].tone} dot={status === "active"}>
              {CYCLE_STATUS_TAG[status].label}
            </StatusTag>
          ) : null}
          {canEdit ? (
            <SaveState
              state={saveState}
              idleLabel={editing ? "Saves automatically" : undefined}
              savedLabel="All changes saved"
              errorLabel="Not saved"
              title="Changes save automatically."
            />
          ) : (
            <StatusTag tone="neutral" icon={Eye} title="Executives, the adviser and super admin edit the roster.">
              View only
            </StatusTag>
          )}
        </>
      }
      title="Package Cycle"
      description={
        <span className="block max-sm:line-clamp-1">
          {about}
          {span ? <span className="tabular-nums"> · {span}</span> : null}
        </span>
      }
      actions={
        <>
          <Link
            href={"/groups" as never}
            className={cn(
              buttonVariants({ variant: "outline" }),
              // ActionBar keeps .aspect-square children square on phones instead of sharing the row.
              addGroup && "aspect-square px-0 sm:aspect-auto sm:px-4"
            )}
          >
            <ArrowUpRight aria-hidden />
            <span className={addGroup ? "max-sm:sr-only" : undefined}>Open Groups</span>
          </Link>
          {addGroup}
        </>
      }
    />
  );
}
