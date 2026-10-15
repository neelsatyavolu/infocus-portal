import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Newspaper } from "lucide-react";
import { InlineNote } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { SectionHeader } from "@/components/kit/section";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireUserId } from "@/src/lib/auth";
import {
  IDEA_CATEGORIES,
  IDEA_CATEGORY_LABELS,
  IDEA_INTERVAL_DAYS,
  formatIdeaRunDate,
  type IdeaCategory,
  type IdeaSuggestion
} from "@/src/lib/ideas";
import { cn } from "@/src/lib/utils";
import { getIdeaBatch, listIdeaRunDates } from "@/src/server/ideas";
import { IdeaCard } from "./idea-card";
import { IDEA_GRID, ideaCardLayout } from "./idea-grid";
import { IdeasSetNav } from "./ideas-set-nav";
import { NewSetTag } from "./new-set-tag";

export const metadata: Metadata = {
  title: "Ideas"
};

const CATEGORY_HINTS: Record<IdeaCategory, string> = {
  news: "Timely and factual",
  feature: "People, places and events",
  commentary: "An opinion you could argue"
};

const EXPLAINER = `New every ${IDEA_INTERVAL_DAYS} days from Bay Area news and events: a starting point for your pitch, then make the story your own.`;
const CADENCE = `New every ${IDEA_INTERVAL_DAYS} days`;
const IDEAS_NOTE =
  "A starting point for your pitch, then make the story your own. Written by AI from public headlines, so details can be wrong. Open the linked stories and check the facts before you pitch.";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** One category. The section carries the #ideas-<category> anchor the phone jump links use. */
function IdeaSection({ category, ideas }: { category: IdeaCategory; ideas: IdeaSuggestion[] }) {
  const titleId = `ideas-${category}-title`;
  return (
    <section id={`ideas-${category}`} aria-labelledby={titleId} className="scroll-mt-[calc(var(--app-header-h,3.5rem)+1rem)]">
      <SectionHeader
        id={titleId}
        // H2 above the 18px card titles (DESIGN.md: section 24px, card title 18px); the kit h2 is 18px.
        title={<span className="text-xl md:text-2xl">{IDEA_CATEGORY_LABELS[category]}</span>}
        count={ideas.length}
        description={CATEGORY_HINTS[category]}
        className="border-b border-border pb-2"
      />
      <div className={cn("mt-4", IDEA_GRID)}>
        {ideas.map((idea, index) => {
          const layout = ideaCardLayout(index, ideas.length);
          return <IdeaCard key={`${index}-${idea.title}`} idea={idea} wide={layout.wide} className={layout.className} />;
        })}
      </div>
    </section>
  );
}

function IdeasEmpty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card">
      <EmptyState size="page" icon={Newspaper} title={title} description={text} action={action} className="md:py-12" />
    </div>
  );
}

export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const userId = await requireUserId();
  const { date } = await searchParams;
  const requested = typeof date === "string" ? date : undefined;
  const [batch, runDates] = await Promise.all([getIdeaBatch(requested), listIdeaRunDates()]);
  const sections = IDEA_CATEGORIES.map((category) => ({
    category,
    ideas: batch?.ideas.filter((idea) => idea.category === category) ?? []
  })).filter((section) => section.ideas.length > 0);
  const newest = runDates[0] ?? batch?.runDate ?? null;
  const isLatest = batch !== null && batch.runDate === newest;
  const setTag = !batch ? null : isLatest ? <NewSetTag latestRunDate={batch.runDate} viewerId={userId} /> : <StatusTag>Past set</StatusTag>;

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow="Ideas"
        status={setTag}
        title="Story ideas from around the Bay"
        description={
          batch ? (
            <>
              <span className="font-medium text-foreground">{formatIdeaRunDate(batch.runDate, "long")}</span>
              {` · ${plural(batch.ideas.length, "idea", "ideas")} from ${batch.itemCount} local stories · ${CADENCE}`}
            </>
          ) : (
            EXPLAINER
          )
        }
        actions={runDates.length > 0 ? <IdeasSetNav runDates={runDates} current={batch?.runDate ?? null} /> : undefined}
      />

      {/* Same reading width as the header description above it. */}
      {batch && sections.length > 0 ? <InlineNote className="max-w-3xl">{IDEAS_NOTE}</InlineNote> : null}

      {sections.length > 1 ? (
        // One even row of equal links, even on a 320px phone (labels truncate before they wrap).
        <nav aria-label="Idea categories" className="md:hidden">
          <div className={cn("grid gap-2", sections.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
            {sections.map(({ category }) => (
              <a key={category} href={`#ideas-${category}`} className={cn(buttonVariants({ variant: "outline" }), "h-10 min-w-0 px-2")}>
                <span className="truncate">{IDEA_CATEGORY_LABELS[category]}</span>
              </a>
            ))}
          </div>
        </nav>
      ) : null}

      {!batch ? (
        requested !== undefined ? (
          <IdeasEmpty
            title="No ideas for that date"
            text={runDates.length > 0 ? "Pick another date from Past ideas, or open the latest set." : "There are no sets to show yet."}
            action={
              runDates.length > 0 ? (
                <Link href="/ideas" className={buttonVariants()}>
                  Show latest ideas
                </Link>
              ) : undefined
            }
          />
        ) : (
          <IdeasEmpty
            title="No ideas yet"
            text={`The first set arrives after the next daily check. After that, new ideas appear every ${IDEA_INTERVAL_DAYS} days.`}
          />
        )
      ) : sections.length === 0 ? (
        <IdeasEmpty title="These ideas could not be shown" text="Pick another date from Past ideas, or tell a producer." />
      ) : (
        <div className="@container space-y-8">
          {sections.map(({ category, ideas }) => (
            <IdeaSection key={category} category={category} ideas={ideas} />
          ))}
        </div>
      )}
    </div>
  );
}
