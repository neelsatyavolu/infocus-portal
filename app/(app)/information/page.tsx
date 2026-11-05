import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Alert } from "@/components/kit/alert";
import { JumpLinks } from "@/components/kit/layout";
import { Panel } from "@/components/kit/panel";
import { PageHeader } from "@/components/page-header";

// The copy on this page was supplied word for word; change grouping and styling only.
const STAGES = [
  {
    title: "Package Pitching",
    body: "Where students will pitch ideas to the producer for the upcoming package cycle. See the package pitching section for more information."
  },
  {
    title: "Brainstorming & Proof of Contact",
    body: "In this stage, students are required to contact at least 3 possible interviewees. Students are also required to write up a brainstorm document complete with b-roll ideas, a-roll information, and a preliminary script. Please note that your script is expected to be completed with your final cut and will be included in your grade."
  },
  {
    title: "A-roll/b-roll",
    body: "In this stage, students are expected to upload their a-roll and b-roll to the InFocus Drive. Students will not be strictly graded on timeliness on this stage but are encouraged to aim to turn it in on time."
  },
  {
    title: "Initial Cut Stage 1",
    body: "In this stage, students are required to upload a polished draft cut to the InFocus Portal and inform their assigned producer. Students will receive feedback from that producer and then are expected to improve the package, submitting as many updated cuts as needed. Until your assigned producer approves your package, you may not move onto Stage 2."
  },
  {
    title: "Initial Cut Stage 2",
    body: "In this stage, students’ packages will be sent off to our adviser. Like Stage 1, the adviser will give you feedback on your package. You are expected, like before, to make as many revisions as needed until you receive the adviser’s approval. Until the adviser approves your package, you may not move onto Stage 3."
  },
  {
    title: "Initial Cut Stage 3",
    body: "In this final stage, students’ packages will be sent off to our our executive producer team. At least two executive producers will give you feedback on your package. You are expected, like before, to make as many revisions as needed until you receive the at least two executive producers’ approval. Until two executive producers approve your package, you may not submit your Final Cut."
  },
  {
    title: "Final Cut",
    body: "At this stage, students are expected to have passed Stage 3 of the approval process and made any remaining changes. Students are then expected to submit their final cut, where the executive producer team will review your submitted package together and give you a grade within 1 week of submission. Your package will also be sent to the publishing queue."
  }
] as const;

const APPROVAL_STAGES = [
  {
    title: "Stage 1",
    body: "Your assigned producer must greenlight your package for it to move forward. If they deny it, revise and resubmit to them until it is greenlit."
  },
  {
    title: "Stage 2",
    body: "The adviser. Once your assigned producer greenlights the package, it goes to him. If he gives the green light, the package is allowed to advance to the last stage. This stage also includes initial cut feedback given by the class."
  },
  {
    title: "Stage 3",
    body: "Two executive producers must give the final sign-off before the package is permitted to air on our show. Please note that any executive producer can deny a package as well and send it back."
  }
] as const;

const [PITCHING, BRAINSTORMING, A_ROLL, STAGE_1, STAGE_2, STAGE_3, FINAL_CUT] = STAGES;

const LINK = "text-[var(--brand-green)] underline-offset-2 hover:underline";
/**
 * Prose spans its panel, so text, callouts and rows share the card's right edge. Lines stay
 * readable because the panels sit two across only from xl (where each column still holds a
 * comfortable line beside the sidebar), and between md and xl (one column) the step rows put
 * their titles in a side column.
 */
const PROSE = "text-pretty text-sm leading-6 text-[var(--ink-text)]";
/** A rule called out from the prose: recessed box, 1px line, Info icon, the full width of the card. */
const CALLOUT = "bg-background";
/** Panels clear the sticky top bar when a jump link scrolls to them. */
const ANCHOR = "scroll-mt-20";

/** `text` with its `phrase` turned into an in-page link (the copy itself stays as supplied). */
function withLink(text: string, phrase: string, href: string): ReactNode {
  const at = text.indexOf(phrase);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <a href={href} className={LINK}>
        {phrase}
      </a>
      {text.slice(at + phrase.length)}
    </>
  );
}

type GuideRow = { key: string; marker?: string; title: string; body: ReactNode };

/** Numbered like the stage bar above the page: 1 Brainstorming, 2 A-roll/B-roll, 3 Initial Cut (3.1–3.3), 4 Final Cut. */
const GUIDE: GuideRow[] = [
  { key: "pitching", marker: "", title: PITCHING.title, body: withLink(PITCHING.body, "package pitching section", "#package-pitching") },
  { key: "brainstorming", marker: "1", title: BRAINSTORMING.title, body: BRAINSTORMING.body },
  { key: "a-roll", marker: "2", title: A_ROLL.title, body: A_ROLL.body },
  { key: "stage-1", marker: "3.1", title: STAGE_1.title, body: STAGE_1.body },
  { key: "stage-2", marker: "3.2", title: STAGE_2.title, body: STAGE_2.body },
  { key: "stage-3", marker: "3.3", title: STAGE_3.title, body: STAGE_3.body },
  { key: "final-cut", marker: "4", title: FINAL_CUT.title, body: FINAL_CUT.body }
];

const APPROVAL: GuideRow[] = APPROVAL_STAGES.map((stage) => ({ key: stage.title, title: stage.title, body: stage.body }));

/**
 * Step rows. Numbered rows: number gutter, title, text. Between md and xl (one full-width column)
 * the title gets its own 12rem column so the text keeps a readable width; from xl (two columns)
 * it stacks again. Plain rows (approval stages) get a title column in the same range, as wide as
 * the number gutter plus title column, so their text starts on the same line as the stage text.
 */
const NUMBERED_ROW =
  "grid-cols-[2rem_minmax(0,1fr)] md:grid-cols-[2rem_12rem_minmax(0,1fr)] md:gap-x-5 xl:grid-cols-[2rem_minmax(0,1fr)] xl:gap-x-3";
const NUMBERED_TEXT = "col-start-2 md:col-start-3 xl:col-start-2";
const PLAIN_ROW = "grid-cols-1 md:grid-cols-[calc(14rem+1.25rem)_minmax(0,1fr)] md:gap-x-5 xl:grid-cols-1";

/**
 * The one step-row treatment on this page (cycle stages and approval stages): hairline-divided
 * rows, an H3 title and the text in the prose style. The stage numbers are read out with the title.
 */
function GuideList({ rows, numbered = false }: { rows: GuideRow[]; numbered?: boolean }) {
  return (
    <ol className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.key} className={`grid gap-x-3 gap-y-1 py-4 first:pt-0 last:pb-0 ${numbered ? NUMBERED_ROW : PLAIN_ROW}`}>
          {numbered ? (
            <span className="font-mono-broadcast text-xs leading-6 tabular-nums text-muted-foreground">{row.marker}</span>
          ) : null}
          <h3 className="text-sm font-semibold leading-6 text-foreground">{row.title}</h3>
          <div className={numbered ? `${NUMBERED_TEXT} ${PROSE}` : PROSE}>
            {row.body}
          </div>
        </li>
      ))}
    </ol>
  );
}

export const metadata: Metadata = { title: "Cycle guide" };

export default function CycleInformationPage() {
  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow="My package"
        title="Cycle guide"
        description="Stages of a cycle, package pitching, and the approval process."
      />

      {/* Hidden from xl, where both columns show every section at once. */}
      <JumpLinks
        className="xl:hidden [&_a]:max-md:h-10"
        links={[
          { href: "#stages", label: "Stages of a Cycle" },
          { href: "#package-pitching", label: "Package Pitching" },
          { href: "#approval", label: "Package Approval & Feedback Process" }
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel id="stages" titleAs="h2" title="Stages of a Cycle" className={ANCHOR}>
          <GuideList rows={GUIDE} numbered />
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            id="package-pitching"
            titleAs="h2"
            title="Package Pitching"
            className={`h-auto ${ANCHOR}`}
            bodyClassName="space-y-4"
          >
            <p className={PROSE}>
              At the start of every package cycle, we will have package pitching. This is when groups will present at least one idea from each category (news, feature, commentary) to the producers. Producers will assign a group to each topic to balance categories. Each group will also be assigned an associate producer to help them throughout the process.
            </p>
            <p className={PROSE}>
              Each group will rank their 3 or more topics, and while it is likely that a group will receive their number 1 topic, this is not guaranteed. Additionally, groups and topics may be shuffled around at the producer&apos;s discretion.
            </p>
            <Alert tone="neutral" role="note" className={CALLOUT}>
              You are not permitted to repeat group members consecutively. This means that every cycle, your group members should not have been part of your last cycle’s package group.
            </Alert>
          </Panel>

          <Panel
            id="approval"
            titleAs="h2"
            title="Package Approval & Feedback Process"
            className={`h-auto flex-1 ${ANCHOR}`}
            bodyClassName="space-y-5"
          >
            <p className={PROSE}>
              Every package moves through a set review chain before it can publish, and each stage must sign off before it advances to the next. You cannot skip a stage.
            </p>
            <GuideList rows={APPROVAL} />
            <div className="space-y-3">
              <Alert tone="neutral" role="note" className={CALLOUT}>
                Man-on-the-street packages are prohibited from being your primary package for a cycle. If you would like to produce one, please contact a producer first.
              </Alert>
              <Alert tone="neutral" role="note" className={CALLOUT}>
                For any packages with content that may be controversial, all executive producers must also approve before the package can move forward.
              </Alert>
            </div>
            <p className={PROSE}>
              Nothing is permitted to be published under the InFocus name until it has cleared all the above stages. There are exceptions for social media content, which must be directly approved by the Head of Creative & Content.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
