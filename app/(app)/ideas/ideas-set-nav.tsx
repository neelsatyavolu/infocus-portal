import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ButtonGroup } from "@/components/kit/button-group";
import { buttonVariants } from "@/components/ui/button";
import { formatIdeaRunDate, groupRunDatesByMonth } from "@/src/lib/ideas";
import { cn } from "@/src/lib/utils";
import { PastIdeasMenu, type PastIdeasGroup } from "./past-ideas-menu";

const STEP_CLASS = cn(buttonVariants({ variant: "outline", size: "icon" }), "aspect-square w-auto px-0");

/** The newest set lives at /ideas; every other set at /ideas?date=YYYY-MM-DD. */
function setHref(runDate: string, newest: string) {
  return runDate === newest ? "/ideas" : `/ideas?date=${runDate}`;
}

function Step({ runDate, newest, label, icon }: { runDate: string | undefined; newest: string; label: string; icon: ReactNode }) {
  if (!runDate) {
    // At either end the arrow stays in place (so nothing shifts) but is not a link.
    return (
      <span role="link" aria-disabled="true" aria-label={label} title={label} className={cn(STEP_CLASS, "pointer-events-none opacity-50")}>
        {icon}
      </span>
    );
  }
  const text = `${label}: ${formatIdeaRunDate(runDate, "short")}`;
  return (
    <Link href={setHref(runDate, newest) as never} aria-label={text} title={text} className={STEP_CLASS}>
      {icon}
    </Link>
  );
}

/**
 * Header controls for moving between idea sets: [‹ older] [Past ideas ▾] [newer ›].
 * The arrows only show when the set on screen is in the list (a batch older than the 200 dates
 * listIdeaRunDates returns, or no batch at all, leaves just the menu). On phones the group takes
 * the full width at 40px; from md it is 36px like every header control.
 */
export function IdeasSetNav({ runDates, current }: { runDates: string[]; current: string | null }) {
  const newest = runDates[0] ?? "";
  const index = current ? runDates.indexOf(current) : -1;
  const groups: PastIdeasGroup[] = groupRunDatesByMonth(runDates).map((group) => ({
    month: group.month,
    items: group.runDates.map((runDate) => ({
      runDate,
      label: formatIdeaRunDate(runDate, "short"),
      href: setHref(runDate, newest),
      latest: runDate === newest,
      active: runDate === current
    }))
  }));

  return (
    // h-auto! lets the group's own 40px phone height through the header's h-9 action row.
    <nav aria-label="Past ideas" className="flex h-auto! max-sm:w-full">
      <ButtonGroup size="touch" className="max-sm:w-full">
        {index >= 0 ? <Step runDate={runDates[index + 1]} newest={newest} label="Older set" icon={<ChevronLeft aria-hidden />} /> : null}
        <PastIdeasMenu groups={groups} className="max-sm:flex-1" />
        {index >= 0 ? <Step runDate={runDates[index - 1]} newest={newest} label="Newer set" icon={<ChevronRight aria-hidden />} /> : null}
      </ButtonGroup>
    </nav>
  );
}
