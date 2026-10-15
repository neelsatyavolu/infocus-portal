"use client";

import type { MouseEvent } from "react";
import { UserPlus, Users, X } from "lucide-react";
import { Avatar, AvatarStack } from "@/components/kit/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getMemberDisplayName } from "@/components/project-assets/format";
import type { AssignedMember } from "@/components/project-assets/types";
import { cn } from "@/src/lib/utils";

/** 32px, 40px on touch screens. */
const TOUCH = "[@media(hover:none)]:h-10";

/**
 * Final Cut people on a card or row: the avatar stack (and, on a card, their names; phones show
 * only the names and an icon button), then an "Add people" / "Edit" button that opens a 288px popover listing who is on the video (remove
 * with ×) with "Add people" and "Done". Clicks inside never reach the card.
 */
export function PeopleControl({
  title,
  summary,
  members,
  open,
  busy,
  onOpenChange,
  onRemove,
  onAddPeople,
  layout = "card"
}: {
  title: string;
  /** Names as words ("Abby, Otto and Sage" / "No assignees"), shown on a card. */
  summary?: string;
  members: AssignedMember[];
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: (userId: string) => void;
  onAddPeople: () => void;
  /**
   * card: avatars + "Add people"/"Edit". row: the same in the List view, shrinking to an icon
   * button when the list is narrow (container query on the list).
   */
  layout?: "card" | "row";
}) {
  function stop(event: MouseEvent) {
    event.stopPropagation();
  }

  const buttonLabel = members.length === 0 ? "Add people" : "Edit";
  const row = layout === "row";

  return (
    <span className="flex min-w-0 items-center gap-2" data-prevent-review-open="true" onClick={stop}>
      {members.length > 0 ? (
        <AvatarStack
          people={members.map((member) => ({ id: member.userId, name: getMemberDisplayName(member), email: member.email }))}
          max={3}
          size={24}
          className={row ? "hidden @min-[44rem]:inline-flex" : "max-sm:hidden"}
        />
      ) : null}
      {!row && summary ? (
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground" title={summary}>
          {summary}
        </span>
      ) : null}
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${buttonLabel} on ${title}`}
            title={`People on ${title}`}
            className={cn(
              "h-8 shrink-0 gap-1.5 px-2 text-muted-foreground",
              TOUCH,
              row
                ? "@max-[44rem]:w-8 @max-[44rem]:px-0 @max-[44rem]:[@media(hover:none)]:w-10"
                : "max-sm:w-8 max-sm:px-0 max-sm:[@media(hover:none)]:w-10"
            )}
          >
            <Users aria-hidden />
            <span aria-hidden className={row ? "@max-[44rem]:hidden" : "max-sm:hidden"}>
              {buttonLabel}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0" data-prevent-review-open="true">
          <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
            People on this video
          </p>
          <div className="max-h-56 overflow-y-auto px-1">
            {members.length === 0 ? (
              <p className="px-2 py-2 text-[13px] text-muted-foreground">No one assigned yet.</p>
            ) : (
              <ul className="py-1">
                {members.map((member) => {
                  const name = getMemberDisplayName(member);
                  return (
                    <li key={member.userId} className="flex min-h-11 items-center gap-2.5 rounded-sm px-2">
                      <Avatar name={name} email={member.email} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-foreground">{name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{member.email ?? "Workspace member"}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(member.userId)}
                        disabled={busy}
                        aria-label={`Remove ${name}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-danger-tint hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [@media(hover:none)]:h-10 [@media(hover:none)]:w-10"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <Button type="button" variant="outline" size="sm" onClick={onAddPeople} disabled={busy} className={TOUCH}>
              <UserPlus aria-hidden />
              Add people
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} className={TOUCH}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}
