"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ClipboardList, RotateCw, UsersRound } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { cycleLabel } from "@/components/kit/format";
import { IconButton } from "@/components/kit/icon-button";
import { CyclePicker } from "@/components/kit/pickers";
import { useRememberedState } from "@/components/kit/remembered-state";
import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { ViewTabPanel } from "@/components/kit/view-tabs";
import ProducerFeedbackDialog from "@/components/package-cycle/producer-feedback-dialog";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { requestNavStatusRefresh } from "@/src/lib/sidebar-nav";
import { cn } from "@/src/lib/utils";
import {
  BRAINSTORM_INSTRUCTIONS,
  cycleSearch,
  metaLine,
  packageStatus,
  packageTitle,
  parseCycleParam,
  type BrainstormPackage
} from "./brainstorm-view";
import { BrainstormingBodySkeleton, LOADING_LABEL } from "./brainstorming-skeleton";
import { BrainstormStatusTag, PackageWorkspace, type MaterialsProps } from "./package-panel";
import { isPackageId, PACKAGE_CHOICE_KEY, PACKAGE_TABS_ID, PackageTabs } from "./package-tabs";
import { useBrainstormEdits } from "./use-brainstorm-edits";
import { cachedPayload, useBrainstorming, type InitialBrainstorming } from "./use-brainstorming";

/** One 40px row on phones: each header action carries it (PageHeader holds children to h-9). */
const TOUCH = "max-sm:h-10";

/**
 * /brainstorming: a student package's turn-in (three proofs of contact and the brainstorm Google
 * Doc), under the shell's stage bar. It reads like the other stage pages: the header plate
 * ("Cycle 03 · Brainstorming" with the status tag, the topic, members and producer, Refresh),
 * then the materials beside the rail (Where it stands, Feedback). Without a package the header
 * names the cycle and the page and keeps the instruction line. A viewer on several packages
 * picks one with tabs (remembered); the header follows the chosen one. Review stays on Groups.
 */
export default function BrainstormingClient({ initial }: { initial?: InitialBrainstorming }) {
  const searchParams = useSearchParams();
  const urlCycle = parseCycleParam(searchParams.get("cycle"));
  const data = useBrainstorming(urlCycle, initial);
  const edits = useBrainstormEdits(data.updatePackage);
  const { payload, currentCycle, state, displayCycle, packages } = data;
  const [chosenId, setChosenId] = useRememberedState<string>(PACKAGE_CHOICE_KEY, "", isPackageId);
  const active = packages.find((pkg) => pkg.id === chosenId) ?? packages[0] ?? null;
  const cycles = payload?.cycles ?? [];
  const canApprove = Boolean(payload?.canApprove);
  const focus = cycles.find((cycle) => cycle.cycleNumber === displayCycle)?.focus?.trim();
  // Bumped on every reload so the feedback panels and the tabs' unread counts fetch again too.
  const [feedbackSignal, setFeedbackSignal] = useState(0);

  /** Reloads this cycle (skipping the cached copy) and its feedback. */
  function reload() {
    edits.resetDrafts();
    setFeedbackSignal((signal) => signal + 1);
    void data.load(urlCycle);
  }

  /** Refresh: the reload, plus the shell's package statuses. */
  function refresh() {
    reload();
    requestNavStatusRefresh(["package"]);
  }

  function switchCycle(cycle: number) {
    edits.resetDrafts();
    // Native history keeps the server page from re-running; useSearchParams picks it up and loads.
    const search = cycleSearch(window.location.search, cycle, currentCycle);
    window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
  }

  function materialsProps(pkg: BrainstormPackage): MaterialsProps {
    return {
      pkg,
      uploadingKey: edits.uploadingKey,
      removalPending: edits.pendingRemoval !== null,
      draft: edits.docDrafts[pkg.id],
      docError: edits.docErrors[pkg.id] ?? null,
      savingDoc: edits.savingDocId === pkg.id,
      onUpload: (slot, file) => void edits.uploadProof(pkg.id, slot, file),
      onRemove: (slot) => edits.setPendingRemoval({ packageId: pkg.id, slot }),
      onDraftChange: (value) => edits.editDraft(pkg.id, value),
      onSaveDoc: () => void edits.saveDoc(pkg)
    };
  }

  const showARollLink = (pkg: BrainstormPackage) =>
    pkg.proofOfContact && currentCycle !== null && pkg.cycleNumber === currentCycle;

  const workspace = (pkg: BrainstormPackage) => (
    <PackageWorkspace
      key={pkg.id}
      {...materialsProps(pkg)}
      canApprove={canApprove}
      showARollLink={showARollLink(pkg)}
      feedbackRefreshSignal={feedbackSignal}
    />
  );

  const loading = state === "loading";
  // Like the sibling stage pages: "Cycle 03 · Brainstorming" over the topic, then the people.
  let eyebrow: ReactNode;
  let description: ReactNode;
  if (active) {
    eyebrow = `${cycleLabel(active.cycleNumber)} · Brainstorming`;
    description = metaLine(active);
  } else {
    eyebrow = displayCycle !== null ? cycleLabel(displayCycle, focus) : "My package";
    description = BRAINSTORM_INSTRUCTIONS;
  }

  let body: ReactNode;
  if (loading) {
    body = (
      <LoadingRegion label={LOADING_LABEL}>
        <BrainstormingBodySkeleton />
      </LoadingRegion>
    );
  } else if (state === "error") {
    body = (
      <Alert
        tone="danger"
        title="Couldn't load brainstorming"
        action={
          <Button type="button" variant="outline" size="sm" onClick={reload}>
            <RotateCw aria-hidden />
            Try again
          </Button>
        }
      >
        {data.error}
      </Alert>
    );
  } else if (packages.length === 0) {
    body = (
      <div className="rounded-md border border-border bg-card">
        {canApprove ? (
          <EmptyState
            size="page"
            icon={ClipboardList}
            title="No packages to review in this cycle."
            description="Open Groups to review brainstorming for a package."
            action={
              <Link href={"/groups" as never} className={buttonVariants({ variant: "outline" })}>
                Open Groups
              </Link>
            }
          />
        ) : (
          <EmptyState
            size="page"
            icon={UsersRound}
            title="You are not on a package group for this cycle yet."
            description="Once a producer adds you on Package Cycle, this page will open for that package."
          />
        )}
      </div>
    );
  } else if (packages.length === 1 || !active) {
    body = workspace(packages[0]);
  } else {
    // Only the chosen package's workspace is mounted: its rail (Where it stands, Feedback) uses
    // page-wide ids, so a second copy would duplicate them. Its feedback thread marks read once
    // its tab is open and on screen; drafts, uploads and errors live in the page's hooks, so
    // switching tabs keeps them. Every tab keeps a (hidden, empty) panel for aria-controls.
    body = (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <PackageTabs packages={packages} value={active.id} onChange={setChosenId} refreshSignal={feedbackSignal} />
        {packages.map((pkg) => (
          <ViewTabPanel key={pkg.id} idPrefix={PACKAGE_TABS_ID} value={pkg.id} active={pkg.id === active.id}>
            {pkg.id === active.id ? workspace(pkg) : null}
          </ViewTabPanel>
        ))}
      </div>
    );
  }

  // The picker while this cycle loads: the live one during a cycle switch (it keeps focus), else
  // a placeholder unless this tab's copy shows there is only one cycle (the picker then hides).
  const knownCycles = (payload ?? cachedPayload(urlCycle))?.cycles;
  const picker = payload ? (
    <CyclePicker
      cycles={cycles}
      value={displayCycle ?? payload.activeCycleNumber}
      currentCycle={currentCycle}
      onChange={switchCycle}
      className={TOUCH}
    />
  ) : loading && (!knownCycles || knownCycles.length > 1) ? (
    <Skeleton className={cn("w-36 rounded-md", TOUCH)} />
  ) : null;

  return (
    // lg:pb-18 keeps the last card clear of the ✱ launcher, as on the other stage pages.
    <div className="route-enter space-y-5 lg:pb-18">
      {/*
        The StudentStageHeader plate of the other stage pages, as one PageHeader in every state,
        so the picker is never remounted (it keeps focus through a cycle switch). While this
        cycle loads it is all placeholder, so no stand-in title shows before the topic.
      */}
      <PageHeader
        eyebrow={loading ? <Skeleton className="h-3 w-40" /> : <span className="min-w-0 truncate">{eyebrow}</span>}
        status={active ? <BrainstormStatusTag status={packageStatus(active)} /> : undefined}
        title={
          loading ? (
            <>
              <span className="sr-only">Brainstorming</span>
              <Skeleton className="h-7 w-64 max-w-full" />
            </>
          ) : active ? (
            packageTitle(active)
          ) : (
            "Brainstorming"
          )
        }
        description={loading ? <Skeleton className="my-0.5 h-4 w-96 max-w-full" /> : description}
        actions={
          <>
            <IconButton
              label="Refresh"
              icon={RotateCw}
              variant="outline"
              busy={data.loading}
              onClick={refresh}
              className={TOUCH}
            />
            {picker}
            <ProducerFeedbackDialog initialCycle={displayCycle ?? undefined} triggerClassName={TOUCH} />
            {canApprove ? (
              <Link href={"/groups" as never} className={cn(buttonVariants({ variant: "outline" }), TOUCH)}>
                Review on Groups
              </Link>
            ) : null}
          </>
        }
      />

      {body}

      <ConfirmDialog
        open={edits.pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) edits.setPendingRemoval(null);
        }}
        title={`Remove proof ${edits.pendingRemoval?.slot ?? ""}?`}
        description="The image is deleted. You can upload a new one afterward."
        confirmLabel="Remove"
        onConfirm={() =>
          edits.pendingRemoval ? edits.removeProof(edits.pendingRemoval.packageId, edits.pendingRemoval.slot) : undefined
        }
      />
    </div>
  );
}
