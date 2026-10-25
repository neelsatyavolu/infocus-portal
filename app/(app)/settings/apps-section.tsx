import { ArrowUpRight } from "lucide-react";
import { SettingsGrid, SettingsPanel, SettingsSection } from "@/components/settings-layout";
import { gradesAppOrigin, teleprompterAppOrigin } from "@/src/lib/hosts";

const APP_LINKS = [
  {
    href: gradesAppOrigin(),
    title: "Grades dashboard",
    description: "Estimated grade, participation, packages, and calculator",
    host: new URL(gradesAppOrigin()).host
  },
  {
    href: teleprompterAppOrigin(),
    title: "Teleprompter",
    description: "Fullscreen run mode + AI reformat",
    host: new URL(teleprompterAppOrigin()).host
  },
  {
    href: "https://drive.infocuspaly.com",
    title: "InFocus Drive",
    description: "Media storage",
    host: "drive.infocuspaly.com"
  }
];

/** Settings → Apps & links: three equal link cells (same tab), then the weekly schedule as a fact. */
export function AppsSection() {
  return (
    <SettingsSection id="apps" title="Apps & links">
      <SettingsPanel>
        <SettingsGrid className="@2xl:grid-cols-3">
          {APP_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="group flex h-full min-w-0 flex-col gap-1 px-4 py-4 transition-colors hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-5"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{link.title}</span>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                  aria-hidden="true"
                />
              </span>
              <span className="text-[13px] leading-snug text-muted-foreground">{link.description}</span>
              <span className="mt-auto truncate pt-1 text-xs text-muted-foreground">{link.host}</span>
            </a>
          ))}
        </SettingsGrid>
        <dl className="flex flex-col gap-1 px-4 py-3 md:flex-row md:items-baseline md:gap-4 md:px-5">
          <dt className="shrink-0 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Weekly schedule</dt>
          <dd className="text-[13px] leading-snug text-[var(--ink-text)]">
            Mon PA · Tue/Thu class · Wed/Fri shows · holidays off (PAUSD calendar seeded)
          </dd>
        </dl>
      </SettingsPanel>
    </SettingsSection>
  );
}
