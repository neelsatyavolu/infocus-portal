import Link from "next/link";
import { MarketingHeader } from "@/components/marketing-header";
import { equipmentAppOrigin } from "@/src/lib/hosts";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Layers,
  MessageSquareText,
  Sparkles,
  UsersRound
} from "lucide-react";

const featureCards = [
  {
    icon: MessageSquareText,
    title: "Editorial review",
    description: "Share video reports with producers and receive feedback linked to specific moments in each video."
  },
  {
    icon: Layers,
    title: "Video revision history",
    description: "Upload revised edits and refer to earlier versions and their feedback throughout production."
  },
  {
    icon: CheckCircle2,
    title: "Assessment and approvals",
    description: "Review assignment grades and follow each video report through the editorial approval process."
  },
  {
    icon: UsersRound,
    title: "Team collaboration",
    description: "Keep production notes, comments, and replies together so reporters and producers can coordinate revisions."
  },
  {
    icon: Sparkles,
    title: "Newsroom updates",
    description: "Stay informed about production updates and announcements shared with the InFocus team."
  },
  {
    icon: Clock3,
    title: "Production planning",
    description: "Access schedules, story assignments, and production resources from a shared newsroom portal."
  }
];

export default function HomePage() {
  return (
    <>
      <MarketingHeader active="home" />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-7 md:p-10">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-50" />
        <div className="relative space-y-7">
          <div className="eyebrow flex items-center gap-2">
            <span className="rec-dot rec-dot-red" />
            InFocus News
          </div>

          <h1 className="display-lg max-w-5xl md:text-[88px] md:leading-[0.92]">
            Student journalism at Palo Alto High School.
          </h1>

          <p className="max-w-3xl text-base text-muted-foreground md:text-lg">
            InFocus is Palo Alto High School&apos;s student-run broadcast publication, covering campus news,
            community stories, and live events. Our student journalists inform and engage the school community
            through news reports, features, and commentary.
          </p>

          <p className="max-w-3xl text-base text-muted-foreground md:text-lg">
            InFocus Portal is our newsroom&apos;s production workspace, where student reporters and producers
            plan stories, review video reports, and coordinate broadcasts. Explore our published work at{" "}
            <a href="https://infocusnews.tv" className="text-foreground underline underline-offset-4 hover:text-primary">
              infocusnews.tv
            </a>. InFocus Portal is open source on{" "}
            <a
              href="https://github.com/neelsatyavolu/infocus-portal"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              GitHub
            </a>.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Open InFocus Portal
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href={process.env.NODE_ENV === "production" ? equipmentAppOrigin() : "/equipment"}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/50 px-5 py-2.5 font-semibold text-foreground backdrop-blur transition hover:bg-card"
            >
              Equipment
            </a>
            <Link
              href="/master-calendar"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/50 px-5 py-2.5 font-semibold text-foreground backdrop-blur transition hover:bg-card"
            >
              View Master Calendar
            </Link>
            <Link
              href={"/submit-announcement" as never}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/50 px-5 py-2.5 font-semibold text-foreground backdrop-blur transition hover:bg-card"
            >
              Submit an announcement
            </Link>
          </div>

          <div className="grid gap-3 pt-1 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { title: "Story Production", desc: "Develop video reports, known as packages, from pitch to final edit." },
              { title: "Editorial Feedback", desc: "Work with producers to refine reporting, editing, and presentation." },
              { title: "Broadcast Planning", desc: "Coordinate show schedules, team assignments, and production deadlines." },
              { title: "Community Announcements", desc: "Submit school announcements for consideration in an InFocus broadcast." }
            ].map((stat) => (
              <div
                key={stat.title}
                className="rounded-xl border border-border bg-[rgb(10,10,10,0.55)] p-4 backdrop-blur"
              >
                <p className="font-display text-xl italic font-extrabold uppercase tracking-tight text-foreground">
                  {stat.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="mt-10 space-y-5">
        <div>
          <div className="eyebrow eyebrow-ink">Inside the newsroom</div>
          <h2 className="display-md mt-2 text-foreground">Supporting every stage of student reporting</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            InFocus Portal brings together the tools our student newsroom uses to prepare stories for publication.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {featureCards.map((feature) => {
            const Icon = feature.icon;

            return (
              <article
                key={feature.title}
                className="rounded-2xl border border-border bg-card p-5 transition hover:border-[var(--brand-green)]/40"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--brand-green)]/30 bg-[var(--brand-green)]/10 text-[var(--brand-green)]">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>
      </main>
    </>
  );
}
