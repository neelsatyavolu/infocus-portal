"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, ChevronRight, Sparkles, Wand2 } from "lucide-react";
import { Panel, PanelLink, PanelSection } from "@/components/kit/panel";
import { SaveState, StatusTag } from "@/components/kit/status-tag";
import { NamePicker } from "@/components/name-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { MAX_PACKAGES_PER_SHOW, queuePackageSubtitle } from "@/src/lib/publishing-queue";
import { cn } from "@/src/lib/utils";
import {
  inConfirmationWindow,
  openSlotCount,
  packagesTag,
  roleStatus,
  rolesSummary,
  showManagerOptions,
  type Overview,
  type OverviewPackage,
  type RoleStatus
} from "./show-overview";

export type SavingTarget = "manager" | "anchors" | "confirm" | null;

/** Panel actions are 32px; on phones the hit area grows to 40px without changing the look. */
const PANEL_ACTION_HIT = "relative max-sm:after:absolute max-sm:after:-inset-1";

const LABEL_CLASS = "text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground";
const ROW_PAD = "px-4 md:px-5";
const ROW_FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

function SavingTag({ active }: { active: boolean }) {
  return <SaveState state={active ? "saving" : "idle"} />;
}

/**
 * One anchor slot. The "Anchors" section title names both pickers (an empty one shows its slot as
 * the placeholder), so the slot's own name is only for screen readers: the trigger shows just the chosen name.
 */
function AnchorSlot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="min-w-0">
      {children}
    </div>
  );
}

/** Show manager and anchors in one card: who is on camera and who runs the show. */
export function CastPanel({
  overview,
  saving,
  onShowManagerChange,
  onAnchorsChange,
  onRandomize
}: {
  overview: Overview;
  saving: SavingTarget;
  onShowManagerChange: (name: string) => void;
  onAnchorsChange: (names: string[]) => void;
  onRandomize: () => void;
}) {
  const busy = saving !== null;
  const manager = overview.showManager ?? { name: "", source: "rotation" as const };
  const anchor1 = overview.anchors[0] ?? "";
  const anchor2 = overview.anchors[1] ?? "";

  return (
    <Panel id="show-cast" divided title="Cast" titleAs="h2">
      <PanelSection
        id="show-cast-manager"
        title="Show manager"
        status={
          <>
            <StatusTag>{manager.source === "manual" ? "Manual" : "Rotation"}</StatusTag>
            <SavingTag active={saving === "manager"} />
          </>
        }
        actions={
          manager.source === "manual" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={PANEL_ACTION_HIT}
              disabled={busy}
              onClick={() => onShowManagerChange("")}
            >
              Use rotation
            </Button>
          ) : undefined
        }
      >
        {/* The section title names the picker (its trigger only shows the chosen name). */}
        <div
          role="group"
          aria-labelledby="show-cast-manager-title"
          aria-describedby={manager.source === "manual" ? undefined : "show-cast-manager-hint"}
        >
          <NamePicker
            value={manager.name}
            options={showManagerOptions(manager.name, overview.showManagerPool ?? [])}
            placeholder="Show manager"
            disabled={busy}
            onChange={onShowManagerChange}
          />
          {/* Visible, not a hover title, so phones see it too; a hand pick shows Use rotation instead. */}
          {manager.source === "manual" ? null : (
            <p id="show-cast-manager-hint" className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              Rotates across EPs and APs.
            </p>
          )}
        </div>
      </PanelSection>
      <PanelSection
        id="show-cast-anchors"
        title="Anchors"
        status={<SavingTag active={saving === "anchors"} />}
        className="@container"
        actions={
          <Button type="button" size="sm" variant="outline" className={PANEL_ACTION_HIT} disabled={busy} onClick={onRandomize}>
            <Sparkles aria-hidden />
            Randomize
          </Button>
        }
      >
        {/*
          Side by side from 20rem of section width, so they stay side by side wherever Cast sits
          beside Show roles (and the two cards stay equal height); stacked on narrow phones.
        */}
        <div className="grid gap-3 @xs:grid-cols-2">
          <AnchorSlot label="Anchor 1">
            <NamePicker
              value={anchor1}
              options={overview.members}
              disabledOptions={[anchor2]}
              placeholder="Anchor 1"
              disabled={busy}
              onChange={(value) => onAnchorsChange([value, anchor2])}
            />
          </AnchorSlot>
          <AnchorSlot label="Anchor 2">
            <NamePicker
              value={anchor2}
              options={overview.members}
              disabledOptions={[anchor1]}
              placeholder="Anchor 2"
              disabled={busy}
              onChange={(value) => onAnchorsChange([anchor1, value])}
            />
          </AnchorSlot>
        </div>
      </PanelSection>
    </Panel>
  );
}

/** The generator's words; an empty role shows a muted dash instead of a tag. */
const ROLE_TAG: Record<RoleStatus, { tone: "success" | "warning"; label: string } | null> = {
  confirmed: { tone: "success", label: "Confirmed" },
  pending: { tone: "warning", label: "Pending" },
  unassigned: null
};

/**
 * The crew for this show, with the generator's per-role status ("confirmed"), and who checked the
 * roles after filming. The two are named apart so the card never says "confirmed" for both.
 */
export function ShowRolesPanel({
  overview,
  daysOut,
  generatorLink
}: {
  overview: Overview;
  daysOut: number;
  generatorLink: string;
}) {
  const summary = rolesSummary(overview);
  const confirmation = overview.rolesConfirmation;
  const footer =
    inConfirmationWindow(daysOut) && confirmation?.confirmedAt ? (
      <span className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--brand-green)]" aria-hidden />
        Checked after filming{confirmation.confirmedBy ? ` by ${confirmation.confirmedBy}` : ""}.
      </span>
    ) : undefined;

  return (
    <Panel
      id="show-crew"
      padding="none"
      title="Show roles"
      titleAs="h2"
      status={<StatusTag tone={summary.tone}>{summary.label}</StatusTag>}
      actions={
        <Link
          href={generatorLink as never}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), PANEL_ACTION_HIT)}
        >
          <Wand2 aria-hidden />
          <span className="sm:hidden">Generator</span>
          <span className="max-sm:hidden">Open generator</span>
        </Link>
      }
      footer={footer}
      bodyClassName="@container"
    >
      <dl className="divide-y divide-border">
        {overview.roles.map((role) => {
          const assignee = overview.assignments[role];
          const tag = ROLE_TAG[roleStatus(assignee, overview.confirmed[role])];
          return (
            <div
              key={role}
              className={cn(
                "grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 @md:grid-cols-[9.5rem_minmax(0,1fr)_auto]",
                ROW_PAD
              )}
            >
              <dt className={cn(LABEL_CLASS, "col-start-1 row-start-1")}>{role}</dt>
              <dd
                className={cn(
                  "col-start-1 row-start-2 min-w-0 truncate text-sm @md:col-start-2 @md:row-start-1",
                  assignee ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {assignee || (
                  <>
                    <span aria-hidden>—</span>
                    <span className="sr-only">Unassigned</span>
                  </>
                )}
              </dd>
              {tag ? (
                <dd className="col-start-2 row-span-2 row-start-1 flex justify-end @md:col-start-3 @md:row-span-1">
                  <StatusTag tone={tag.tone}>{tag.label}</StatusTag>
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>
    </Panel>
  );
}

function RowIndex({ value }: { value: number }) {
  return (
    <span className="w-5 shrink-0 font-mono-broadcast text-xs tabular-nums text-muted-foreground">
      {String(value).padStart(2, "0")}
    </span>
  );
}

function PackageRow({ row, index }: { row: OverviewPackage; index: number }) {
  const rowClass = cn("flex min-h-14 min-w-0 items-center gap-3 py-2.5", ROW_PAD);
  const topic = <span className="block truncate text-sm font-medium text-foreground">{row.groupTopic || "Untitled group"}</span>;

  if (row.custom) {
    return (
      <div className={rowClass}>
        <RowIndex value={index} />
        <span className="min-w-0 flex-1">{topic}</span>
        <StatusTag>Custom</StatusTag>
      </div>
    );
  }
  return (
    <Link
      href={`/groups/${row.id}/final-cut` as never}
      className={cn(rowClass, ROW_FOCUS, "transition-colors hover:bg-[var(--ink-3)]")}
    >
      <RowIndex value={index} />
      <span className="min-w-0 flex-1">
        {topic}
        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{queuePackageSubtitle(row)}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/**
 * A placeholder, not a link: the panel header's "Publishing queue" is the one way to fill it. The
 * dashed box is inset so its index lines up with the package rows' index.
 */
function OpenSlotRow({ index }: { index: number }) {
  return (
    <div className="flex h-full min-h-14 px-2 py-1.5 md:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-dashed border-[var(--ink-4)] px-[7px] text-muted-foreground">
        <RowIndex value={index} />
        <span className="min-w-0 flex-1 truncate text-sm">Open slot</span>
      </div>
    </div>
  );
}

/**
 * The show's rundown: queued packages, then the open slots up to the show's limit (so the card
 * keeps its size from show to show). Aired shows list only what ran.
 */
export function PackagesPanel({
  packages,
  showSlots,
  className
}: {
  packages: OverviewPackage[];
  showSlots: boolean;
  className?: string;
}) {
  const tag = packagesTag(packages.length, MAX_PACKAGES_PER_SHOW);
  const slots = showSlots ? openSlotCount(packages.length, MAX_PACKAGES_PER_SHOW) : 0;
  const cells = [
    ...packages.map((row, index) => <PackageRow key={row.id} row={row} index={index + 1} />),
    ...Array.from({ length: slots }, (_, index) => <OpenSlotRow key={`slot-${index}`} index={packages.length + index + 1} />)
  ];

  return (
    <Panel
      id="show-packages"
      padding="none"
      title="Packages"
      titleAs="h2"
      count={showSlots ? undefined : packages.length}
      status={showSlots ? <StatusTag tone={tag.tone}>{tag.label}</StatusTag> : undefined}
      actions={
        <PanelLink href="/publishing-queue" className={PANEL_ACTION_HIT}>
          Publishing queue
        </PanelLink>
      }
      className={className}
      bodyClassName="@container flex flex-col"
    >
      {cells.length > 0 ? (
        // 1px gaps over the line color draw the hairlines, in one column or two.
        <ol className="grid gap-px bg-border @2xl:grid-cols-2">
          {cells.map((cell, index) => (
            <li key={cell.key ?? index} className="min-w-0 bg-card @2xl:last:odd:col-span-2">
              {cell}
            </li>
          ))}
        </ol>
      ) : null}
      {/* Open slots already say so on an upcoming show; this line is for an aired or non-show date. */}
      {cells.length === 0 ? (
        <p className={cn("py-3 text-[13px] text-muted-foreground", ROW_PAD)}>
          Nothing from the publishing queue is assigned to this show yet.
        </p>
      ) : null}
    </Panel>
  );
}
