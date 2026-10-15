import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BrainstormPackage } from "@/app/(app)/brainstorming/brainstorm-view";
import { BrainstormingBodySkeleton } from "@/app/(app)/brainstorming/brainstorming-skeleton";
import { DocLinkField } from "@/app/(app)/brainstorming/doc-link-field";
import { MaterialsPanel, PackageWorkspace } from "@/app/(app)/brainstorming/package-panel";
import { PackageTabs } from "@/app/(app)/brainstorming/package-tabs";
import { ProofSlot } from "@/app/(app)/brainstorming/proof-slot";
import CycleInformationPage from "@/app/(app)/information/page";
import { TooltipProvider } from "@/components/ui/tooltip";

const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
const noop = () => {};
const DOC = "https://docs.google.com/document/d/abc/edit";
const proof = (slot: number) => ({
  id: `p${slot}`,
  slot,
  fileName: `call-log-${slot}.jpg`,
  mimeType: "image/jpeg",
  imageUrl: `/api/brainstorming/proofs/p${slot}/image`
});

const slotProps = { slot: 2, canEdit: true, uploading: false, busy: false, removeDisabled: false, onFile: noop, onRemove: noop };

describe("ProofSlot", () => {
  it("is an upload target when empty", () => {
    const markup = html(<ProofSlot {...slotProps} proof={undefined} />);
    expect(markup).toContain("Upload or drop image");
    expect(markup).toContain("Missing");
    expect(markup).toContain('accept="image/*"');
    expect(markup).not.toContain("Remove proof 2");
  });

  it("links the image to the full size and offers remove", () => {
    const markup = html(<ProofSlot {...slotProps} proof={proof(2)} />);
    expect(markup).toContain('href="/api/brainstorming/proofs/p2/image"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('alt="call-log-2.jpg"');
    expect(markup).toContain('aria-label="Remove proof 2"');
    expect(markup).not.toContain("Upload or drop image");
  });

  it("shows the busy and read-only states", () => {
    expect(html(<ProofSlot {...slotProps} proof={undefined} uploading busy />)).toContain("Uploading…");
    const readOnly = html(<ProofSlot {...slotProps} proof={undefined} canEdit={false} />);
    expect(readOnly).toContain("No proof yet");
    expect(readOnly).not.toContain("<button");
    // No upload icon for someone who can't upload.
    expect(readOnly).not.toContain("lucide-upload");
    expect(readOnly).toContain("lucide-image-off");
  });

  it("keeps the image link's focus ring inside the tile and says it opens a new tab", () => {
    const markup = html(<ProofSlot {...slotProps} proof={proof(2)} />);
    expect(markup).toContain("focus-visible:outline-offset-[-2px]");
    expect(markup).toContain("(opens in a new tab)");
    expect(markup).not.toContain("sm:h-8");
  });
});

describe("DocLinkField", () => {
  const props = { saved: DOC, draft: undefined, canEdit: true, saving: false, error: null, onDraftChange: noop, onSave: noop };

  it("names the field with its visible label and ties the saved state to it", () => {
    const markup = html(<DocLinkField {...props} />);
    expect(markup).toMatch(/<h3[^>]*><label[^>]*for="([^"]+)"[^>]*>Brainstorm Google Doc<\/label><\/h3>[\s\S]*<input[^>]*id="\1"/);
    expect(markup).not.toContain("aria-label=");
    const stateId = markup.match(/<span id="([^"]+)"[^>]*>[\s\S]*?Linked/)?.[1];
    expect(stateId).toBeTruthy();
    expect(markup).toContain(`aria-describedby="${stateId}"`);
    expect(markup).toContain("Open<");
  });

  it("keeps Save link available (outline) when nothing changed, and filled once edited", () => {
    const idle = html(<DocLinkField {...props} />);
    const idleSave = idle.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";
    expect(idleSave).not.toContain('disabled=""');
    expect(idleSave).toContain("border-input");
    const edited = html(<DocLinkField {...props} draft="https://docs.google.com/document/d/new" />);
    expect(edited.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toContain("bg-primary");
    expect(html(<DocLinkField {...props} saving />).match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toContain('disabled=""');
  });

  it("marks unsaved changes and turns an emptied link into Remove link", () => {
    expect(html(<DocLinkField {...props} draft="https://docs.google.com/document/d/new" />)).toContain("Unsaved changes");
    expect(html(<DocLinkField {...props} draft="" />)).toContain("Remove link");
  });

  it("shows an inline error tied to the field", () => {
    const markup = html(<DocLinkField {...props} saved="" draft="nope" error="Paste a Google Docs or Drive link." />);
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Paste a Google Docs or Drive link.");
    expect(markup).not.toContain("Open<");
  });
});

describe("Package layout", () => {
  const pkg: BrainstormPackage = {
    id: "row-1",
    cycleNumber: 3,
    groupTopic: "Lunch line wait times",
    brainstormDocUrl: "",
    proofOfContact: false,
    needsChanges: false,
    canEdit: true,
    assignedProducer: { userId: "u-rowan", name: "Rowan", email: null },
    members: [
      { userId: "u-abby", name: "Abby", email: null },
      { userId: "u-otto", name: "Otto", email: null }
    ],
    proofs: [proof(1)]
  };
  const materials = {
    pkg,
    uploadingKey: null,
    removalPending: false,
    draft: undefined,
    docError: null,
    savingDoc: false,
    onUpload: noop,
    onRemove: noop,
    onDraftChange: noop,
    onSaveDoc: noop
  };

  it("titles the materials card by its job (the topic is the page title)", () => {
    const markup = html(<MaterialsPanel {...materials} />);
    expect(markup).toMatch(/<h2[^>]*>Materials<\/h2>/);
    expect(markup).not.toContain("Lunch line wait times");
    expect(markup).toMatch(/<h3[^>]*>Proofs of contact<\/h3>/);
    expect(markup).toContain(">1 of 3<");
    expect(markup).not.toMatch(/view feedback/i);
  });

  it("puts the materials beside the rail (Where it stands, Feedback), like the other stage pages", () => {
    const markup = html(<PackageWorkspace {...materials} canApprove={false} showARollLink={false} feedbackRefreshSignal={0} />);
    expect(markup).toContain("xl:grid-cols-[minmax(0,1fr)_22rem]");
    // Wide screens: materials first in the DOM (left column), then the rail.
    expect(markup.indexOf(">Materials<")).toBeLessThan(markup.indexOf(">Where it stands<"));
    expect(markup.indexOf(">Where it stands<")).toBeLessThan(markup.indexOf(">Feedback<"));
    // Narrow screens, while there is something to turn in: the materials lead, then Where it stands.
    expect(markup).toContain("max-xl:contents");
    expect(markup).toContain("min-w-0 max-xl:order-1");
    expect(markup).toMatch(/<section[^>]*class="[^"]*max-xl:order-2[^"]*"[^>]*>[\s\S]*?>Where it stands</);
    // Feedback waits at the bottom while it is loading or empty (it moves up once it has notes).
    expect(markup).toMatch(/<div class="min-w-0 max-xl:order-5"><section id="stage-feedback-brainstorming"/);
    expect(markup).toMatch(/<h2[^>]*>Feedback<\/h2>/);
    expect(markup).not.toMatch(/view feedback/i);
  });

  it("leads with Where it stands on narrow screens once there is feedback to act on", () => {
    const revisions = html(
      <PackageWorkspace {...materials} pkg={{ ...pkg, brainstormDocUrl: DOC, proofs: [proof(1), proof(2), proof(3)], needsChanges: true }} canApprove={false} showARollLink={false} feedbackRefreshSignal={0} />
    );
    expect(revisions).toContain("Your producer asked for changes.");
    expect(revisions).toContain("min-w-0 max-xl:order-3");
    expect(revisions).toMatch(/<section[^>]*class="[^"]*max-xl:order-1[^"]*"[^>]*>[\s\S]*?>Where it stands</);
    // Feedback that arrived while proofs were still missing (PENDING) is read first too.
    const pendingWithFeedback = html(
      <PackageWorkspace {...materials} pkg={{ ...pkg, needsChanges: true }} canApprove={false} showARollLink={false} feedbackRefreshSignal={0} />
    );
    expect(pendingWithFeedback).toContain("min-w-0 max-xl:order-3");
  });

  it("says what happens next and keeps the instruction line until approval", () => {
    const pending = html(<PackageWorkspace {...materials} canApprove={false} showARollLink={false} feedbackRefreshSignal={0} />);
    expect(pending).toContain("Add 2 more proofs and the Google Doc link.");
    expect(pending).toContain("Your producer reviews this on Groups and approves the check-in.");
    expect(pending).not.toContain("Open A-roll/B-roll");

    const approved = html(
      <PackageWorkspace {...materials} pkg={{ ...pkg, proofOfContact: true }} canApprove={false} showARollLink feedbackRefreshSignal={0} />
    );
    expect(approved).toContain("Approved by your producer.");
    expect(approved).toContain('href="/a-roll"');
    expect(approved).not.toContain("Your producer reviews this on Groups and approves the check-in.");
    // The instruction line sits on the materials card, above the controls it describes.
    expect(html(<MaterialsPanel {...materials} />)).toContain("Upload three proofs of contact");
  });

  it("loads in the same order as the page, so nothing jumps", () => {
    const markup = html(<BrainstormingBodySkeleton />);
    expect(markup).toContain("xl:grid-cols-[minmax(0,1fr)_22rem]");
    const order = [...markup.matchAll(/max-xl:order-(\d)/g)].map((match) => match[1]);
    expect(order).toEqual(["1", "2", "5"]);
    expect(markup).toContain("max-xl:contents");
  });

  it("switches between several packages with tabs naming each one and its status", () => {
    const second: BrainstormPackage = {
      ...pkg,
      id: "row-2",
      groupTopic: "Robotics team season",
      brainstormDocUrl: DOC,
      proofs: [proof(1), proof(2), proof(3)]
    };
    const markup = html(<PackageTabs packages={[pkg, second]} value="row-2" onChange={noop} />);
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="Your packages"');
    expect(markup).toMatch(/<button[^>]*id="brainstorm-package-tab-row-1"[^>]*aria-selected="false"/);
    expect(markup).toMatch(/<button[^>]*id="brainstorm-package-tab-row-2"[^>]*aria-selected="true"/);
    expect(markup).toContain("Lunch line wait times");
    expect(markup).toContain("Robotics team season");
    expect(markup).toContain("PENDING");
    expect(markup).toContain("SUBMITTED");
    expect(markup).not.toContain("status-pill-lg");
  });
});

describe("Cycle guide", () => {
  it("keeps the anchors and numbers the stages like the stage bar", () => {
    const markup = renderToStaticMarkup(<CycleInformationPage />);
    expect(markup).toMatch(/<h1[^>]*>Cycle guide<\/h1>/);
    for (const id of ["stages", "package-pitching", "approval"]) {
      expect(markup).toContain(`id="${id}"`);
      expect(markup).toContain(`href="#${id}"`);
    }
    expect(markup).toContain(">3.1<");
    expect(markup).toContain("our our executive producer team");
    expect(markup).not.toContain("max-w-3xl space-y-5");
    // Two columns only from xl (readable lines beside the sidebar); prose and callouts span their cards (one right edge).
    expect(markup).toContain("grid gap-5 xl:grid-cols-2");
    expect(markup).toContain("xl:hidden");
    expect(markup).not.toContain("max-w-[72ch]");
  });

  it("uses only the supplied copy, with the approval stages as headings", () => {
    const markup = renderToStaticMarkup(<CycleInformationPage />);
    expect(markup).not.toContain("Before the cycle");
    expect(markup).not.toContain("See the approval process");
    for (const stage of ["Stage 1", "Stage 2", "Stage 3"]) {
      expect(markup).toMatch(new RegExp(`<h3[^>]*>${stage}</h3>`));
    }
    expect(markup).toContain(
      'Where students will pitch ideas to the producer for the upcoming package cycle. See the <a href="#package-pitching"'
    );
  });
});
