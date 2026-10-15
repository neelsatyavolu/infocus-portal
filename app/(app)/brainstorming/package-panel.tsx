"use client";

import Link from "next/link";
import { Panel } from "@/components/kit/panel";
import { SectionLabel } from "@/components/kit/section";
import { StatusTag } from "@/components/kit/status-tag";
import { toneFromStatusClass } from "@/components/kit/tone";
import { StageComments } from "@/components/package-cycle/stage-comments";
import { WhereItStands } from "@/components/package-stages/where-it-stands";
import { PROOF_OF_CONTACT_REQUIRED, PROOF_OF_CONTACT_SLOTS } from "@/src/lib/package-brainstorm";
import {
  CYCLE_STAGE_STATUS_CLASS,
  CYCLE_STAGE_STATUS_LABELS,
  type CycleStageStatus
} from "@/src/lib/package-stage-status";
import { cn } from "@/src/lib/utils";
import { BRAINSTORM_INSTRUCTIONS, nextStep, packageStatus, type BrainstormPackage } from "./brainstorm-view";
import { DocLinkField } from "./doc-link-field";
import { ProofSlot } from "./proof-slot";

export function BrainstormStatusTag({ status }: { status: CycleStageStatus }) {
  return (
    <StatusTag
      tone={toneFromStatusClass(CYCLE_STAGE_STATUS_CLASS[status])}
      dot={status === "approved"}
      srLabel="Brainstorming status: "
    >
      {CYCLE_STAGE_STATUS_LABELS[status]}
    </StatusTag>
  );
}

/** The next-step sentence, plus a link on to A-roll/B-roll once approved on the current cycle. */
function NextStepText({ pkg, showARollLink }: { pkg: BrainstormPackage; showARollLink: boolean }) {
  return (
    <>
      {nextStep(pkg)}
      {showARollLink ? (
        <>
          {" "}
          <Link href={"/a-roll" as never} className="whitespace-nowrap text-[var(--brand-green)] underline-offset-2 hover:underline">
            Open A-roll/B-roll →
          </Link>
        </>
      ) : null}
    </>
  );
}

export type MaterialsProps = {
  pkg: BrainstormPackage;
  uploadingKey: string | null;
  removalPending: boolean;
  draft: string | undefined;
  docError: string | null;
  savingDoc: boolean;
  onUpload: (slot: number, file: File) => void;
  onRemove: (slot: number) => void;
  onDraftChange: (value: string) => void;
  onSaveDoc: () => void;
};

/** The three proofs of contact (with a "2 of 3" count) and the Google Doc link. */
function Materials({
  pkg,
  uploadingKey,
  removalPending,
  draft,
  docError,
  savingDoc,
  onUpload,
  onRemove,
  onDraftChange,
  onSaveDoc
}: MaterialsProps) {
  const proofsId = `brainstorm-${pkg.id}-proofs`;
  return (
    <>
      <section aria-labelledby={proofsId} className="space-y-2">
        <SectionLabel
          as="h3"
          id={proofsId}
          end={
            <span className="font-mono-broadcast tabular-nums">
              {pkg.proofs.length} of {PROOF_OF_CONTACT_REQUIRED}
            </span>
          }
        >
          Proofs of contact
        </SectionLabel>
        <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
          {PROOF_OF_CONTACT_SLOTS.map((slot) => (
            <ProofSlot
              key={slot}
              slot={slot}
              proof={pkg.proofs.find((item) => item.slot === slot)}
              canEdit={pkg.canEdit}
              uploading={uploadingKey === `${pkg.id}-${slot}`}
              busy={uploadingKey !== null}
              removeDisabled={removalPending}
              onFile={(file) => onUpload(slot, file)}
              onRemove={() => onRemove(slot)}
            />
          ))}
        </div>
      </section>

      <DocLinkField
        saved={pkg.brainstormDocUrl}
        draft={draft}
        canEdit={pkg.canEdit}
        saving={savingDoc}
        error={docError}
        onDraftChange={onDraftChange}
        onSave={onSaveDoc}
      />
    </>
  );
}

/**
 * The package's turn-in card ("Materials", like Footage or Versions on the other stage pages;
 * the topic is the page title): the three proofs and the Google Doc link, with the instruction
 * line above them until the producer approves.
 */
export function MaterialsPanel(props: MaterialsProps) {
  return (
    <Panel
      titleAs="h2"
      title="Materials"
      description={packageStatus(props.pkg) === "approved" ? undefined : BRAINSTORM_INSTRUCTIONS}
      padding="md"
      className="h-auto"
      bodyClassName="space-y-5"
    >
      <Materials {...props} />
    </Panel>
  );
}

/**
 * One package's body, the same layout as the other student stage pages: the materials beside
 * the rail from xl (Where it stands, then Feedback; the rail sticks and scrolls as one area).
 * Below xl it is one column. The other stage pages keep their upload in the header; here the
 * turn-in is the materials card, so while the group is turning in or waiting for review the
 * materials come first, then Where it stands. Once there is producer feedback to act on (newer
 * than the last proof, also while materials are still missing) or the stage is approved, Where
 * it stands leads, then Feedback with its notes, then the materials. Feedback waits at the
 * bottom while it is empty or loading.
 */
export function PackageWorkspace({
  canApprove,
  showARollLink,
  feedbackRefreshSignal,
  ...props
}: MaterialsProps & { canApprove: boolean; showARollLink: boolean; feedbackRefreshSignal: number }) {
  const { pkg } = props;
  const materialsFirst = !pkg.proofOfContact && !pkg.needsChanges;
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className={cn("min-w-0", materialsFirst ? "max-xl:order-1" : "max-xl:order-3")}>
        <MaterialsPanel {...props} />
      </div>
      <div className="min-w-0 max-xl:contents xl:sticky xl:top-[calc(var(--app-header-h,0px)+1rem)] xl:max-h-[calc(100dvh-var(--app-header-h,0px)-2rem)] xl:space-y-5 xl:overflow-y-auto">
        <WhereItStands
          className={materialsFirst ? "max-xl:order-2" : "max-xl:order-1"}
          nextStep={<NextStepText pkg={pkg} showARollLink={showARollLink} />}
        />
        <StageComments
          key={pkg.id}
          variant="panel"
          rowId={pkg.id}
          stage="brainstorming"
          canWrite={canApprove}
          highlightNew={!canApprove}
          scrollNotes={false}
          refreshSignal={feedbackRefreshSignal}
          className={materialsFirst ? "max-xl:order-3" : "max-xl:order-2"}
          emptyClassName="max-xl:order-5"
        />
      </div>
    </div>
  );
}
