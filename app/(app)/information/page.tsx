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

function StageItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-6 text-muted-foreground text-pretty">{body}</p>
    </div>
  );
}

export default function CycleInformationPage() {
  return (
    <div className="route-enter mx-auto w-full max-w-3xl space-y-5 pb-24">
      <section className="brand-hero-panel relative overflow-hidden p-5 md:p-6">
        <div className="relative min-w-0">
          <div className="eyebrow">The Cycle</div>
          <h1 className="display-md mt-2 text-pretty text-foreground">Information</h1>
        </div>
      </section>

      <section className="space-y-5 rounded-2xl border border-border bg-card p-5 md:p-6">
        <h2 className="text-pretty text-lg font-semibold text-foreground">Stages of a Cycle</h2>
        <div className="space-y-5">
          {STAGES.map((stage) =>
            stage.title === "Package Pitching" ? (
              <div key={stage.title} className="space-y-1.5">
                <h3 className="text-sm font-semibold text-foreground">{stage.title}</h3>
                <p className="text-sm leading-6 text-muted-foreground text-pretty">
                  Where students will pitch ideas to the producer for the upcoming package cycle. See the{" "}
                  <a href="#package-pitching" className="underline underline-offset-2 hover:text-foreground">
                    package pitching section
                  </a>{" "}
                  for more information.
                </p>
              </div>
            ) : (
              <StageItem key={stage.title} title={stage.title} body={stage.body} />
            )
          )}
        </div>
      </section>

      <section id="package-pitching" className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
        <h2 className="text-pretty text-lg font-semibold text-foreground">Package Pitching</h2>
        <p className="text-sm leading-6 text-muted-foreground text-pretty">
          At the start of every package cycle, we will have package pitching. This is when groups will present at least one idea from each category (news, feature, commentary) to the producers. Producers will assign a group to each topic to balance categories. Each group will also be assigned an associate producer to help them throughout the process.
        </p>
        <p className="text-sm leading-6 text-muted-foreground text-pretty">
          Each group will rank their 3 or more topics, and while it is likely that a group will receive their number 1 topic, this is not guaranteed. Additionally, groups and topics may be shuffled around at the producer&apos;s discretion.
        </p>
        <p className="text-sm leading-6 text-muted-foreground text-pretty">
          You are not permitted to repeat group members consecutively. This means that every cycle, your group members should not have been part of your last cycle’s package group.
        </p>
      </section>

      <section className="space-y-5 rounded-2xl border border-border bg-card p-5 md:p-6">
        <h2 className="text-pretty text-lg font-semibold text-foreground">Package Approval & Feedback Process</h2>
        <p className="text-sm leading-6 text-muted-foreground text-pretty">
          Every package moves through a set review chain before it can publish, and each stage must sign off before it advances to the next. You cannot skip a stage.
        </p>
        <p className="text-sm leading-6 text-muted-foreground text-pretty">
          Man-on-the-street packages are prohibited from being your primary package for a cycle. If you would like to produce one, please contact a producer first.
        </p>
        <div className="space-y-5">
          {APPROVAL_STAGES.map((stage) => (
            <StageItem key={stage.title} title={stage.title} body={stage.body} />
          ))}
        </div>
        <p className="text-sm leading-6 text-muted-foreground text-pretty">
          For any packages with content that may be controversial, all executive producers must also approve before the package can move forward.
        </p>
        <p className="text-sm leading-6 text-muted-foreground text-pretty">
          Nothing is permitted to be published under the InFocus name until it has cleared all the above stages. There are exceptions for social media content, which must be directly approved by the Head of Creative & Content.
        </p>
      </section>
    </div>
  );
}
