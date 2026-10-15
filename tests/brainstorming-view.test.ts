import { describe, expect, it } from "vitest";
import {
  brainstormScreen,
  cycleSearch,
  docState,
  isDocDirty,
  mapPackage,
  memberLine,
  mergeSavedPackage,
  metaLine,
  nextStep,
  packageStatus,
  packageTitle,
  parseCycleParam,
  withoutProof,
  withProof,
  type BrainstormPackage,
  type BrainstormPayload,
  type SavedBrainstormPackage
} from "@/app/(app)/brainstorming/brainstorm-view";

const DOC = "https://docs.google.com/document/d/abc/edit";

function proof(slot: number) {
  return {
    id: `proof-${slot}`,
    slot,
    fileName: `proof-${slot}.jpg`,
    mimeType: "image/jpeg",
    imageUrl: `/api/brainstorming/proofs/proof-${slot}/image`
  };
}

function pkg(overrides: Partial<BrainstormPackage> = {}): BrainstormPackage {
  return {
    id: "row-1",
    cycleNumber: 3,
    groupTopic: "Lunch line wait times",
    brainstormDocUrl: "",
    proofOfContact: false,
    needsChanges: false,
    canEdit: true,
    assignedProducer: { userId: "u-rowan", name: "Rowan", email: "rowan@example.edu" },
    members: [
      { userId: "u-abby", name: "Abby", email: "abby@example.edu" },
      { userId: "u-otto", name: null, email: "otto@example.edu" },
      { userId: "u-sage", name: null, email: null }
    ],
    proofs: [],
    ...overrides
  };
}

describe("brainstorming view: identity", () => {
  it("falls back to Untitled package", () => {
    expect(packageTitle(pkg({ groupTopic: "  " }))).toBe("Untitled package");
    expect(packageTitle(pkg())).toBe("Lunch line wait times");
  });

  it("lists members in roster order by name, else email, else Member", () => {
    expect(memberLine(pkg().members)).toBe("Abby, otto@example.edu, Member");
    expect(memberLine([])).toBe("No members");
  });

  it("adds the producer after the members, like the other stage pages", () => {
    expect(metaLine(pkg())).toBe("Abby, otto@example.edu, Member · Producer: Rowan");
    expect(metaLine(pkg({ assignedProducer: null, members: [] }))).toBe("No members · Producer: not assigned yet");
  });
});

describe("brainstorming view: next step", () => {
  it("says what is still missing", () => {
    expect(nextStep(pkg())).toBe("Add 3 proofs and the Google Doc link.");
    expect(nextStep(pkg({ proofs: [proof(1)] }))).toBe("Add 2 more proofs and the Google Doc link.");
    expect(nextStep(pkg({ proofs: [proof(1), proof(2)], brainstormDocUrl: DOC }))).toBe("Add 1 more proof.");
    expect(nextStep(pkg({ proofs: [proof(1), proof(2), proof(3)] }))).toBe("Add the Google Doc link.");
    expect(nextStep(pkg({ proofs: [proof(1), proof(2), proof(3)], brainstormDocUrl: "https://example.com/doc" }))).toBe(
      "Add the Google Doc link."
    );
  });

  it("waits for the producer once everything is in", () => {
    const ready = pkg({ proofs: [proof(1), proof(2), proof(3)], brainstormDocUrl: DOC });
    expect(packageStatus(ready)).toBe("submitted");
    expect(nextStep(ready)).toBe("Everything is in. Waiting for Rowan to review.");
    expect(nextStep({ ...ready, assignedProducer: null })).toBe("Everything is in. Waiting for your producer to review.");
  });

  it("asks for a remove and re-upload on revisions, and reports approval", () => {
    const revisions = pkg({ proofs: [proof(1), proof(2), proof(3)], brainstormDocUrl: DOC, needsChanges: true });
    expect(packageStatus(revisions)).toBe("needs-revisions");
    expect(nextStep(revisions)).toContain("remove a proof and upload a new one");
    expect(nextStep(pkg({ proofOfContact: true }))).toBe("Approved by your producer.");
  });
});

describe("brainstorming view: doc field", () => {
  it("is dirty only when the trimmed draft differs from the saved link", () => {
    expect(isDocDirty(DOC, undefined)).toBe(false);
    expect(isDocDirty(DOC, ` ${DOC} `)).toBe(false);
    expect(isDocDirty(DOC, "")).toBe(true);
    expect(isDocDirty("", "https://docs.google.com/x")).toBe(true);
  });

  it("names the state", () => {
    expect(docState(DOC, undefined)).toBe("linked");
    expect(docState("", undefined)).toBe("missing");
    expect(docState(DOC, "")).toBe("dirty");
  });
});

describe("brainstorming view: state updates", () => {
  it("keeps canEdit when the saved package has none (PATCH response)", () => {
    const saved: SavedBrainstormPackage = { ...pkg({ brainstormDocUrl: DOC }), canEdit: undefined };
    const merged = mergeSavedPackage(pkg({ canEdit: true }), saved);
    expect(merged.canEdit).toBe(true);
    expect(merged.brainstormDocUrl).toBe(DOC);
    expect(mergeSavedPackage(pkg({ canEdit: true }), { ...saved, canEdit: false }).canEdit).toBe(false);
  });

  it("puts a proof in its slot, sorted, and clears needsChanges", () => {
    const current = pkg({ proofs: [proof(3), proof(1)], needsChanges: true });
    const next = withProof(current, { ...proof(1), id: "new-1" });
    expect(next.proofs.map((item) => item.id)).toEqual(["new-1", "proof-3"]);
    expect(next.needsChanges).toBe(false);
    expect(withProof(current, proof(2)).proofs.map((item) => item.slot)).toEqual([1, 2, 3]);
    expect(current.proofs).toHaveLength(2);
  });

  it("removes a proof without touching the doc link", () => {
    const next = withoutProof(pkg({ proofs: [proof(1), proof(2)], brainstormDocUrl: DOC }), 1);
    expect(next.proofs.map((item) => item.slot)).toEqual([2]);
    expect(next.brainstormDocUrl).toBe(DOC);
  });

  it("updates one package of the current payload and leaves the rest", () => {
    const payload: BrainstormPayload = {
      currentUserId: "u-abby",
      canApprove: false,
      activeCycleNumber: 3,
      cycles: [{ cycleNumber: 3, focus: "" }],
      packages: [pkg(), pkg({ id: "row-2" })]
    };
    const next = mapPackage(payload, "row-2", (item) => ({ ...item, brainstormDocUrl: DOC }));
    expect(next.packages[0]).toBe(payload.packages[0]);
    expect(next.packages[1].brainstormDocUrl).toBe(DOC);
    expect(mapPackage(payload, "missing", (item) => item)).toBe(payload);
  });
});

describe("brainstorming view: screen state", () => {
  const payload = (cycle: number): BrainstormPayload => ({
    currentUserId: "u-abby",
    canApprove: false,
    activeCycleNumber: cycle,
    cycles: [],
    packages: [pkg({ cycleNumber: cycle })]
  });

  it("loads until a view answers the wanted cycle", () => {
    expect(brainstormScreen(null, null, null)).toEqual({ state: "loading", displayCycle: null, packages: [] });
    // A cycle switch with no cached copy: the old cycle's packages are not shown.
    const switching = brainstormScreen({ payload: payload(3), requested: null }, 2, null);
    expect(switching).toEqual({ state: "loading", displayCycle: 2, packages: [] });
  });

  it("is ready on the wanted cycle, or on the default when no cycle is known yet", () => {
    const ready = brainstormScreen({ payload: payload(2), requested: 2 }, 2, null);
    expect(ready.state).toBe("ready");
    expect(ready.packages).toHaveLength(1);
    const firstVisit = brainstormScreen({ payload: payload(3), requested: null }, null, null);
    expect(firstVisit).toMatchObject({ state: "ready", displayCycle: 3 });
    expect(brainstormScreen({ payload: payload(3), requested: 2 }, null, null).state).toBe("loading");
  });

  it("shows the error only when nothing for the wanted cycle is on screen", () => {
    expect(brainstormScreen(null, 2, "Boom").state).toBe("error");
    expect(brainstormScreen({ payload: payload(2), requested: 2 }, 2, "Boom").state).toBe("ready");
  });
});

describe("brainstorming view: cycle in the URL", () => {
  it("reads only positive integers", () => {
    expect(parseCycleParam("2")).toBe(2);
    expect(parseCycleParam("0")).toBeNull();
    expect(parseCycleParam("-1")).toBeNull();
    expect(parseCycleParam("2.5")).toBeNull();
    expect(parseCycleParam("abc")).toBeNull();
    expect(parseCycleParam(null)).toBeNull();
  });

  it("writes ?cycle=N and drops it only on the known current cycle", () => {
    expect(cycleSearch("", 2, 3)).toBe("?cycle=2");
    expect(cycleSearch("?cycle=2", 3, 3)).toBe("");
    expect(cycleSearch("?cycle=2", 3, null)).toBe("?cycle=3");
    expect(cycleSearch("?cycle=2&x=1", 3, 3)).toBe("?x=1");
  });
});
