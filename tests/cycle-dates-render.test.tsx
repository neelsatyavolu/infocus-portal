import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CycleDatesColumns } from "@/app/(app)/package-cycles/cycle-dates-columns";
import { orderCycles, soonestDeadline, type PackageCycle } from "@/app/(app)/package-cycles/cycle-dates-utils";
import { CycleEditor } from "@/app/(app)/package-cycles/cycle-editor";
import {
  CARDS_ONLY,
  EDITOR_CARDS_ONLY,
  EDITOR_TABLE_ONLY,
  TABLE_ONLY
} from "@/app/(app)/package-cycles/cycle-parts";
import { CycleSchedule } from "@/app/(app)/package-cycles/cycle-schedule";
import { CycleWinners } from "@/app/(app)/package-cycles/cycle-winners";
import { SemesterStrip } from "@/app/(app)/package-cycles/semester-strip";

const TODAY = new Date(2026, 9, 15);

const CYCLES: PackageCycle[] = [
  {
    cycleNumber: 1,
    focus: "",
    pitchingDate: "2026-08-20",
    proofOfContactDate: "2026-09-01",
    aRollBRollDate: "2026-09-10",
    initialCutDate: "2026-09-20",
    finalCutDate: "2026-09-30"
  },
  {
    cycleNumber: 2,
    focus: "",
    pitchingDate: "2026-10-01",
    proofOfContactDate: "2026-10-08",
    aRollBRollDate: "2026-10-14",
    initialCutDate: "2026-10-18",
    finalCutDate: "2026-10-28"
  },
  { cycleNumber: 3, focus: "", pitchingDate: null, proofOfContactDate: null, aRollBRollDate: null, initialCutDate: null, finalCutDate: null }
];

function renderSchedule() {
  const ordered = orderCycles(CYCLES, TODAY);
  return renderToStaticMarkup(<CycleSchedule ordered={ordered} today={TODAY} soonest={soonestDeadline(CYCLES, TODAY)} />);
}

describe("Cycle Dates schedule", () => {
  it("says Completed for past stages, TBD for missing dates, and marks the next stage", () => {
    const html = renderSchedule();
    expect(html).toContain("Completed");
    expect(html).not.toContain("Passed");
    expect(html).toContain("TBD");
    expect(html).toContain("Next");
    expect(html).toContain("Soonest deadline, ");
    expect(html).toContain("Cycle 2");
    expect(html).toContain("Active");
    expect(html).toContain("Planned");
    expect(html).toContain("Closed");
  });

  it("keeps the next stage's countdown in narrow columns and drops only the Next prefix", () => {
    const html = renderSchedule();
    expect(html).toContain('<span class="@max-[6.75rem]:sr-only">Next · </span>in 3d');
    expect(html).toContain('title="Next stage · in 3d"');
  });

  it("names every stage in full for screen readers", () => {
    const html = renderSchedule();
    expect(html).toContain("Brainstorming &amp; Proof of Contact");
    expect(html).toContain("Stage dates by cycle");
  });
});

describe("Cycle Dates editor", () => {
  function renderEditor(drafts: PackageCycle[]) {
    const ordered = orderCycles(CYCLES, TODAY);
    return renderToStaticMarkup(
      <CycleEditor
        saved={CYCLES}
        rows={{ open: drafts.filter((cycle) => cycle.cycleNumber !== 1), closed: drafts.filter((cycle) => cycle.cycleNumber === 1) }}
        sections={new Map(ordered.map((entry) => [entry.cycle.cycleNumber, entry.section]))}
        today={TODAY}
        savingCycles={[]}
        onSavingChange={() => undefined}
        onChange={() => undefined}
        onSaved={() => undefined}
      />
    );
  }

  it("ties each table row's date fields to that row's form, so Enter saves the cycle", () => {
    const html = renderEditor(CYCLES);
    expect(html).toContain('id="cycle-2-row-form"');
    expect(html.match(/form="cycle-2-row-form"/g)).toHaveLength(5);
  });

  it("keeps every cycle, closed ones included, and disables Save until something changes", () => {
    const html = renderEditor(CYCLES);
    expect(html).toContain("cycle-1-row-form");
    expect(html).toContain("cycle-1-edit-title");
    expect(html).not.toContain("Unsaved");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>/);
  });

  it("shows Unsaved on a changed cycle", () => {
    const html = renderEditor(CYCLES.map((cycle) => (cycle.cycleNumber === 2 ? { ...cycle, finalCutDate: "2026-10-30" } : cycle)));
    expect(html).toContain("Unsaved");
  });

  it("measures the same box as the read view, but shows its table only where the whole table fits", () => {
    const schedule = renderSchedule();
    const editor = renderEditor(CYCLES);
    for (const html of [editor, schedule]) expect(html).toContain('class="@container/dates"');
    expect(schedule).toContain(TABLE_ONLY);
    expect(schedule).toContain(CARDS_ONLY);
    expect(editor).toContain(EDITOR_TABLE_ONLY);
    expect(editor).toContain(EDITOR_CARDS_ONLY);
    expect(editor).not.toContain(TABLE_ONLY);
    expect(editor).toContain("@min-[48rem]/dates:grid-cols-3");
  });

  it("folds closed cycles under the schedule's remembered Closed cycles disclosure", () => {
    const html = renderEditor(CYCLES);
    const fold = html.indexOf("Closed cycles");
    expect(fold).toBeGreaterThan(-1);
    expect(html.slice(0, fold)).toContain("cycle-2-edit-title");
    expect(html.slice(0, fold)).not.toContain("cycle-1-edit-title");
    expect(html.slice(fold)).toContain("cycle-1-edit-title");
    expect(html).toContain('aria-expanded="false"');
  });
});

describe("Cycle Dates page columns", () => {
  it("stays one column when there is nothing for the side rail", () => {
    const html = renderToStaticMarkup(<CycleDatesColumns strip={null} dates={<p>dates</p>} winners={null} />);
    expect(html).not.toContain("grid-cols-");
  });

  it("puts the winners beside the dates on very wide screens, after them in reading order", () => {
    const html = renderToStaticMarkup(<CycleDatesColumns strip={null} dates={<p>DATES-BODY</p>} winners={<p>WINNERS-BODY</p>} />);
    expect(html).toContain("@min-[86rem]/cycles:grid-cols-[minmax(0,1fr)_20rem]");
    expect(html.indexOf("DATES-BODY")).toBeGreaterThan(-1);
    expect(html.indexOf("DATES-BODY")).toBeLessThan(html.indexOf("WINNERS-BODY"));
  });
});

describe("Package of the Cycle", () => {
  it("renders nothing without winners", () => {
    expect(renderToStaticMarkup(<CycleWinners data={null} />)).toBe("");
    expect(renderToStaticMarkup(<CycleWinners data={{ viewerUserId: "u1", canDownloadAll: false, winners: [] }} />)).toBe("");
  });
});

describe("Semester strip", () => {
  it("skips browser validation so Enter saves the clamped count", () => {
    const html = renderToStaticMarkup(<SemesterStrip savedCount={3} onSaved={async () => undefined} />);
    expect(html.toLowerCase()).toContain("novalidate");
    expect(html).toContain('min="1"');
    expect(html).toContain('max="8"');
    expect(html).toContain("Save count");
  });
});
