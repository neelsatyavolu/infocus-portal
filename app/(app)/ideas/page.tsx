import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Newspaper } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUserId } from "@/src/lib/auth";
import {
  IDEA_CATEGORIES,
  IDEA_CATEGORY_LABELS,
  IDEA_INTERVAL_DAYS,
  formatIdeaRunDate,
  groupRunDatesByMonth,
  type IdeaCategory,
  type IdeaSuggestion
} from "@/src/lib/ideas";
import { cn } from "@/src/lib/utils";
import { getIdeaBatch, listIdeaRunDates } from "@/src/server/ideas";

export const metadata: Metadata = {
  title: "Ideas"
};

const LABEL = "text-[11px] font-medium uppercase tracking-[0.11em]";

const CATEGORY_HINTS: Record<IdeaCategory, string> = {
  news: "Timely and factual",
  feature: "People, places and events",
  commentary: "An opinion you could argue"
};

function IdeaCard({ idea }: { idea: IdeaSuggestion }) {
  return (
    <article className="flex flex-col gap-4 rounded-md border border-border bg-card p-5 md:p-6">
      <div>
        <h3 className="text-balance text-lg font-semibold leading-snug tracking-tight text-foreground">{idea.title}</h3>
        <p className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-[var(--ink-text)]">{idea.pitch}</p>
      </div>
      <div className="border-l-2 border-[var(--brand-fill)] pl-3">
        <p className={cn(LABEL, "text-[var(--brand-green)]")}>Paly angle</p>
        <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-foreground">{idea.angle}</p>
      </div>
      <div className="mt-auto border-t border-border pt-3">
        <p className={cn(LABEL, "text-muted-foreground")}>Based on</p>
        <ul className="mt-1.5 grid gap-1">
          {idea.sources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex min-h-[28px] items-start gap-1.5 rounded-sm text-sm leading-snug text-[var(--ink-text)] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-green)]"
              >
                <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand-green)]" aria-hidden />
                <span>
                  <span className="underline-offset-2 group-hover:underline">{source.title}</span>
                  <span className="text-muted-foreground"> · {source.outlet}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function PastIdeas({ runDates, selected }: { runDates: string[]; selected: string }) {
  return (
    <nav aria-label="Past ideas" className="rounded-md border border-border bg-card p-4 lg:sticky lg:top-4">
      <h2 className={cn(LABEL, "text-muted-foreground")}>Past ideas</h2>
      <div className="mt-3 grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
        {groupRunDatesByMonth(runDates).map((group) => (
          <div key={group.month}>
            <p className="text-xs text-muted-foreground">{group.month}</p>
            <ul className="mt-1 grid gap-0.5">
              {group.runDates.map((runDate) => {
                const active = runDate === selected;
                const latest = runDate === runDates[0];
                return (
                  <li key={runDate}>
                    <Link
                      href={(latest ? "/ideas" : `/ideas?date=${runDate}`) as never}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-[40px] items-center justify-between gap-2 rounded-md px-2.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-green)]",
                        active
                          ? "bg-[var(--brand-fill)] font-medium text-[var(--on-brand)]"
                          : "text-[var(--ink-text)] hover:bg-[var(--ink-3)] hover:text-foreground"
                      )}
                    >
                      <span>{formatIdeaRunDate(runDate, "short")}</span>
                      {latest ? <span className={cn(LABEL, active ? "text-[var(--on-brand)]" : "text-[var(--brand-green)]")}>Latest</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid place-items-center rounded-md border border-border bg-card px-6 py-16 text-center">
      <Newspaper className="h-12 w-12 text-muted-foreground" aria-hidden />
      <p className="mt-4 text-lg font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-[var(--ink-text)]">{text}</p>
    </div>
  );
}

export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  await requireUserId();
  const { date } = await searchParams;
  const requested = typeof date === "string" ? date : undefined;
  const [batch, runDates] = await Promise.all([getIdeaBatch(requested), listIdeaRunDates()]);
  const sections = IDEA_CATEGORIES.map((category) => ({
    category,
    ideas: batch?.ideas.filter((idea) => idea.category === category) ?? []
  })).filter((section) => section.ideas.length > 0);

  return (
    <div className="route-enter mx-auto w-full max-w-[1280px] space-y-5 pb-28">
      <PageHeader
        eyebrow="Ideas"
        title="Story ideas from around the Bay"
        description={
          <>
            Fresh suggestions every {IDEA_INTERVAL_DAYS} days, drawn from Bay Area news and events. Use them as a starting point for your pitch,
            then make the story your own.
            {batch
              ? ` · ${formatIdeaRunDate(batch.runDate, "long")} · ${batch.ideas.length} ${batch.ideas.length === 1 ? "idea" : "ideas"} from ${batch.itemCount} local stories`
              : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
        <div className="space-y-10">
          {!batch ? (
            requested ? (
              <EmptyState title="No ideas for that date" text="Pick another date from Past ideas." />
            ) : (
              <EmptyState
                title="No ideas yet"
                text={`The first set arrives after the next daily check. After that, new ideas appear every ${IDEA_INTERVAL_DAYS} days.`}
              />
            )
          ) : sections.length === 0 ? (
            <EmptyState title="These ideas could not be shown" text="Pick another date from Past ideas, or tell a producer." />
          ) : (
            sections.map(({ category, ideas }) => (
              <section key={category} aria-labelledby={`ideas-${category}`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2">
                  <h2 id={`ideas-${category}`} className="text-xl font-semibold tracking-tight text-foreground">
                    {IDEA_CATEGORY_LABELS[category]}
                  </h2>
                  <p className="text-sm text-muted-foreground">{CATEGORY_HINTS[category]}</p>
                  <p className={cn(LABEL, "ml-auto text-muted-foreground")}>
                    {ideas.length} {ideas.length === 1 ? "idea" : "ideas"}
                  </p>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {ideas.map((idea, index) => (
                    <IdeaCard key={`${index}-${idea.title}`} idea={idea} />
                  ))}
                </div>
              </section>
            ))
          )}
          {batch && sections.length > 0 ? (
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Written by AI from public headlines, so details can be wrong. Open the linked stories and check the facts before you pitch.
            </p>
          ) : null}
        </div>

        {runDates.length > 0 ? <PastIdeas runDates={runDates} selected={batch?.runDate ?? ""} /> : null}
      </div>
    </div>
  );
}
