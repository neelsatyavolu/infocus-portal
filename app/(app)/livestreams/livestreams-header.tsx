"use client";

import Link from "next/link";
import { Plus, Radio, RotateCw, Users } from "lucide-react";
import { IconButton } from "@/components/kit/icon-button";
import { ActionMenu } from "@/components/kit/menu";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { REQUIRED_LIVESTREAM_HOURS, REQUIRED_MANAGED_LIVESTREAMS } from "@/src/lib/livestream";
import { cn } from "@/src/lib/utils";
import type { Payload, View } from "./livestreams-model";

/** Phones get 40px controls in the header row. */
const PHONE_HEIGHT = "max-sm:h-10!";
const TITLE = "Livestreams";

/**
 * One line of context for this view and role, so the views below need no help rows of their
 * own: what a decision does on Sign ups, the credit rule on Completion, and on the Schedule
 * what this person can do there.
 */
function description(data: Payload, view: View) {
  if (view === "signups") {
    return "Approving adds the person to the crew. Completion updates once the event is marked Completed.";
  }
  if (view === "completion") {
    return `Full credit is ${REQUIRED_LIVESTREAM_HOURS} h; partial credit scales (4 h = 50%). Managers need ${REQUIRED_MANAGED_LIVESTREAMS} managed livestreams (10 pts each).`;
  }
  if (!data.canSignup) {
    return "Every livestream this semester. Managers assign crew from Edit and can't request slots.";
  }
  if (data.canManage) {
    return "Every livestream this semester: arrival times, crew and hours. You can also sign up for open ones.";
  }
  return `Sign up for an open livestream. ${data.requiredHours} hours this semester is full credit.`;
}

/**
 * Square nameplate, named for the page (the tabs below name the view), with the place and the
 * semester in the eyebrow like the sibling Show pages. Actions, all one height: Refresh (icon),
 * Managers, Live dashboard, and the page's one primary, Add event (on the Schedule, where events
 * live; the N key works on every tab). On phones managers get ⋯ + Add event; students ↻ + Live
 * dashboard. Before the first payload (a load error) no role is known: no description, and only
 * the Live dashboard link, since the error card below holds the one Try again.
 */
export function LivestreamsHeader({
  data,
  view,
  refreshing,
  onRefresh,
  onManagers,
  onAddEvent
}: {
  data: Payload | null;
  view: View;
  refreshing: boolean;
  onRefresh: () => void;
  onManagers: () => void;
  onAddEvent: () => void;
}) {
  if (!data) {
    return (
      <PageHeader
        title={TITLE}
        actions={
          <Link href="/live" className={cn(buttonVariants({ variant: "outline" }), PHONE_HEIGHT)}>
            <Radio aria-hidden />
            Live dashboard
          </Link>
        }
      />
    );
  }
  const manage = data.canManage;
  return (
    <PageHeader
      eyebrow={
        // Producers reach this page as a tab of The Show; everyone else from Production.
        <>
          <Radio className="h-3 w-3" aria-hidden />
          {data.canAppointManagers ? "The Show" : "Production"} · {data.semester.label}
        </>
      }
      title={TITLE}
      description={description(data, view)}
      actions={
        <>
          <IconButton
            label="Refresh"
            icon={RotateCw}
            variant="outline"
            busy={refreshing}
            onClick={onRefresh}
            className={cn(PHONE_HEIGHT, manage && "max-sm:hidden")}
          />
          {data.canAppointManagers ? (
            <Button type="button" variant="outline" className="max-sm:hidden" onClick={onManagers}>
              <Users aria-hidden />
              Managers
            </Button>
          ) : null}
          <Link href="/live" className={cn(buttonVariants({ variant: "outline" }), PHONE_HEIGHT, manage && "max-sm:hidden")}>
            <Radio aria-hidden />
            Live dashboard
          </Link>
          {manage ? (
            <ActionMenu
              label="More actions"
              variant="outline"
              className={cn("sm:hidden", PHONE_HEIGHT)}
              items={[
                { key: "refresh", label: "Refresh", icon: RotateCw, onSelect: onRefresh, disabled: refreshing },
                { key: "managers", label: "Managers", icon: Users, onSelect: onManagers, hidden: !data.canAppointManagers },
                { key: "live", label: "Live dashboard", icon: Radio, href: "/live" }
              ]}
            />
          ) : null}
          {manage && view === "schedule" ? (
            <Button type="button" className={PHONE_HEIGHT} title="Add event (N)" aria-keyshortcuts="n" onClick={onAddEvent}>
              <Plus aria-hidden />
              Add event
            </Button>
          ) : null}
        </>
      }
    />
  );
}
