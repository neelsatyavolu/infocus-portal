import type { ReactNode } from "react";
import { JumpLinks } from "@/components/kit/layout";
import type { KitIcon } from "@/components/kit/icon";
import { Callout } from "@/components/public-marketing/callout";
import { ANCHOR_OFFSET } from "@/components/public-marketing/shared";
import { cn } from "@/src/lib/utils";

export type InfoEntry = { title: string; body: ReactNode };
export type InfoGroup = { id: string; title: string; entries: InfoEntry[] };
export type InfoContact = { id: string; title: string; icon: KitIcon | ReactNode; body: ReactNode };

/** "How it's used" → "how-its-used". */
function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function entryId(group: InfoGroup, entry: InfoEntry) {
  return `${group.id}-${slug(entry.title)}`;
}

/**
 * One bordered card of titled rows with hairlines between them. From md the title sits in a
 * fixed left column and the text beside it, capped at 60ch so lines stay under about 70
 * characters (DESIGN.md §10) even where the column is wider.
 */
function RowCard({ group }: { group: InfoGroup }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="divide-y divide-border">
        {group.entries.map((entry) => {
          const id = entryId(group, entry);
          return (
            <div
              key={id}
              id={id}
              className={cn(
                "grid gap-x-6 gap-y-2 p-4 md:grid-cols-[12rem_minmax(0,1fr)] md:p-5 xl:grid-cols-[13rem_minmax(0,1fr)]",
                ANCHOR_OFFSET
              )}
            >
              <h3 className="text-base font-semibold leading-snug text-foreground">{entry.title}</h3>
              <div className="min-w-0 max-w-[60ch] text-[15px] leading-relaxed text-[var(--ink-text)]">{entry.body}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TOC_LINK = "flex min-h-8 items-center px-4 transition-colors hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/** The rail's "On this page" list (lg and up): every group, every section in it, and the contact box. */
function OnThisPage({ groups, contact }: { groups: InfoGroup[]; contact: InfoContact }) {
  return (
    <nav aria-label="On this page" className="rounded-md border border-border bg-card py-3">
      <p className="px-4 pb-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">On this page</p>
      <ul className="space-y-1">
        {groups.map((group) => (
          <li key={group.id}>
            <a href={`#${group.id}`} className={cn(TOC_LINK, "text-sm font-medium text-foreground")}>
              {group.title}
            </a>
            <ul>
              {group.entries.map((entry) => (
                <li key={entry.title}>
                  <a
                    href={`#${entryId(group, entry)}`}
                    className={cn(TOC_LINK, "py-1 pl-7 text-[13px] leading-snug text-muted-foreground")}
                  >
                    {entry.title}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
        <li>
          <a href={`#${contact.id}`} className={cn(TOC_LINK, "text-sm font-medium text-foreground")}>
            {contact.title}
          </a>
        </li>
      </ul>
    </nav>
  );
}

/**
 * The reading-page frame shared by /privacy and /support (both App Store pages): the page
 * header, then a reading column of grouped row cards ending with the contact box (the copy
 * points "below" to it), beside a sticky rail with the page's contents (lg and up). The rail
 * holds only the list, so it fits a laptop screen. On phones the contents become a row of jump
 * links under the header.
 */
export function InfoPage({
  header,
  groups,
  contact
}: {
  header: ReactNode;
  groups: InfoGroup[];
  contact: InfoContact;
}) {
  const jumpLinks = [
    ...groups.map((group) => ({ href: `#${group.id}` as const, label: group.title })),
    { href: `#${contact.id}` as const, label: contact.title }
  ];

  return (
    <div className="space-y-6">
      {header}
      {/* The kit chips are 32px; phones get the 40px touch height. */}
      <JumpLinks links={jumpLinks} hideFrom="lg" className="max-sm:[&_a]:h-10" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          {groups.map((group) => (
            <section key={group.id} id={group.id} aria-labelledby={`${group.id}-title`} className={cn("space-y-4", ANCHOR_OFFSET)}>
              <h2 id={`${group.id}-title`} className="display-sm text-foreground">
                {group.title}
              </h2>
              <RowCard group={group} />
            </section>
          ))}
          <Callout id={contact.id} title={contact.title} icon={contact.icon}>
            {contact.body}
          </Callout>
        </div>
        {/* max-h + scroll only guard very short windows; the list fits a 768px-tall laptop. */}
        <aside className="hidden min-w-0 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
          <OnThisPage groups={groups} contact={contact} />
        </aside>
      </div>
    </div>
  );
}
