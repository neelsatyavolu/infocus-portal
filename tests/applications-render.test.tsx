import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/applications/manage/r1" }));
import { AnswersStep } from "@/components/applications/answers-step";
import { ApplicantsWorkspace } from "@/components/applications/applicants-workspace";
import { ApplicationSummary } from "@/components/applications/application-summary";
import { CutStep } from "@/components/applications/cut-step";
import { FactsStep } from "@/components/applications/facts-step";
import { MyPicks } from "@/components/applications/my-picks";
import { RoundSettingsForm } from "@/components/applications/round-settings-form";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EMPTY_ANSWERS } from "@/src/lib/applications/answers";
import { applicantConfig, DEFAULT_APPLICATION_CONFIG } from "@/src/lib/applications/config";
import type { ApplicationDetail, RoundOverview } from "@/src/server/applications/review";

// The applications shell provides TooltipProvider (IconButton needs it); render the same way.
const render = (node: ReactNode) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
const config = applicantConfig(DEFAULT_APPLICATION_CONFIG);
const answers = {
  ...EMPTY_ANSWERS,
  grade: "11",
  answer1: "A plan",
  cutNotes: [{ id: "n1", t: 65, category: "Audio", text: "Music too loud" }]
};

describe("applications pages render", () => {
  it("renders the student steps and summary", () => {
    const noop = () => undefined;
    expect(render(<FactsStep answers={answers} config={config} applicantName="Abby" onChange={noop} />)).toContain("Skills");
    expect(render(<AnswersStep answers={answers} config={config} onChange={noop} />)).toContain("Question 1");
    expect(render(<CutStep roundId="r1" hasRoughCut={false} answers={answers} config={config} onChange={noop} />)).toContain("1:05");
    const summary = render(<ApplicationSummary answers={answers} config={config} />);
    expect(summary).not.toContain("Role preferences");
  });

  it("renders the pick lists", () => {
    const html = render(
      <MyPicks
        roundId="r1"
        lists={DEFAULT_APPLICATION_CONFIG.pickLists}
        applicants={[{ id: "a1", name: "Abby Mock", isMock: true, ai: null }]}
        initialPicks={{ ep: ["a1"] }}
        initialReasons={{ a1: "Strong plan" }}
        submittedAt={null}
      />
    );
    expect(html).toContain("Pick 2 for Executive Producer and 3 for Associate Producer");
    expect(html).toContain("Strong plan");
  });

  it("renders round settings", () => {
    const html = render(
      <RoundSettingsForm
        readOnly={false}
        initial={{ id: "r1", title: "T", positionLabel: "EP", intro: "", status: "DRAFT", opensAt: null, dueAt: "2027-03-01T07:59:00.000Z", allowUnsubmit: true, roughCutSource: "", config: DEFAULT_APPLICATION_CONFIG }}
      />
    );
    expect(html).toContain("Answer key");
  });

  it("renders the reviewer workspace with the sidebar and transcript section", () => {
    const voter = { id: "u1", name: "Pat" };
    const tally = { counts: {}, winner: null, needed: 1, cast: 0 };
    const overview: RoundOverview = {
      round: { id: "r1", title: "T", positionLabel: "EP", status: "DRAFT", opensAt: null, dueAt: "2027-03-01T07:59:00.000Z", releaseAt: null, released: false },
      decisions: DEFAULT_APPLICATION_CONFIG.decisions,
      rubric: DEFAULT_APPLICATION_CONFIG.rubric,
      voters: [voter],
      viewer: { userId: "u1", canManage: true, isVoter: true },
      myPicks: null,
      pickLists: DEFAULT_APPLICATION_CONFIG.pickLists,
      seesOthers: false,
      rankers: [],
      applications: [
        { id: "a1", name: "Abby Mock", isMock: true, status: "SUBMITTED", submittedAt: "2026-11-12T00:00:00.000Z", updatedAt: "2026-11-12T00:00:00.000Z", grade: "11", notes: 0, picks: null, ai: null, tally, myVote: null, decisionKey: null, extensionUntil: null }
      ]
    };
    const detail: ApplicationDetail = {
      round: { id: "r1", title: "T", positionLabel: "EP", dueAt: "2027-03-01T07:59:00.000Z", releaseAt: null, roughCutUrl: null, roughCutSource: "" },
      config: DEFAULT_APPLICATION_CONFIG,
      viewer: { userId: "u1", canManage: true, isVoter: true },
      application: { id: "a1", name: "Abby Mock", email: null, isMock: true, status: "SUBMITTED", submittedAt: "2026-11-12T00:00:00.000Z", version: 1, answers, extensionUntil: null, extensionNote: null, decisionKey: null, decisionMessage: null },
      notes: [{ id: "t1", kind: "TRANSCRIPT", text: "Formal interview\nQ: Why?", createdAt: "2026-11-12T00:00:00.000Z", authorId: "u1", author: "Pat" }],
      votes: { voters: [voter], byVoter: {}, tally },
      ai: null
    };
    const html = render(<ApplicantsWorkspace overview={overview} detail={detail} showDetailOnPhone />);
    expect(html).toContain("Interview transcripts");
    expect(html).toContain("Formal interview");
    expect(html).toContain('aria-current="page"');
  });
});
