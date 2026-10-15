"use client";

import { GraduationCap, RefreshCw, UserPlus } from "lucide-react";
import { SubmittedChipsSkeleton } from "@/components/announcements/announcements-skeletons";
import { ExternalLink } from "@/components/announcements/external-link";
import { TOOLBAR_CONTROL } from "@/components/announcements/sizes";
import { FilterChips, type FilterChipOption } from "@/components/kit/filter-chips";
import { IconButton } from "@/components/kit/icon-button";
import { ActionMenu, type MenuEntry } from "@/components/kit/menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

/**
 * The one row under the Submitted header. Start: section chips with counts (scroll sideways on
 * phones). End: College Visits (left of Invite), Invite and Refresh. Below md the row stays one
 * line: College Visits and Invite move into a ⋯ menu.
 */
export function SubmittedToolbar<T extends string>({
  chips,
  chipValue,
  onChipChange,
  chipsLoading,
  collegeVisitsUrl,
  canInvite,
  onInvite,
  onRefresh,
  refreshing,
  refreshDisabled
}: {
  /** Section filter; hidden when there is nothing to choose between. */
  chips: Array<FilterChipOption<T>>;
  chipValue: T;
  onChipChange: (value: T) => void;
  /** Nothing loaded yet: chip placeholders. */
  chipsLoading: boolean;
  collegeVisitsUrl: string;
  canInvite: boolean;
  onInvite: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  refreshDisabled: boolean;
}) {
  const menuItems: MenuEntry[] = [
    { key: "college-visits", label: "College Visits", icon: GraduationCap, href: collegeVisitsUrl, external: true },
    { key: "invite", label: "Invite", icon: UserPlus, onSelect: onInvite, hidden: !canInvite }
  ];

  return (
    <div role="group" aria-label="Submitted tools" className="flex min-w-0 items-start gap-2 md:gap-3">
      <div className="min-w-0 flex-1">
        {chipsLoading ? (
          <SubmittedChipsSkeleton />
        ) : chips.length > 0 ? (
          <FilterChips
            ariaLabel="Show section"
            options={chips}
            value={chipValue}
            onChange={onChipChange}
            size="touch"
            className="pointer-coarse:*:h-10"
          />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ExternalLink variant="outline" href={collegeVisitsUrl} className={cn("max-md:hidden", TOOLBAR_CONTROL)}>
          <GraduationCap aria-hidden className="h-4 w-4" />
          College Visits
        </ExternalLink>
        {canInvite ? (
          <Button type="button" variant="outline" className={cn("max-md:hidden", TOOLBAR_CONTROL)} onClick={onInvite}>
            <UserPlus className="h-4 w-4" />
            Invite
          </Button>
        ) : null}
        <IconButton
          label={refreshing ? "Refreshing" : "Refresh"}
          icon={RefreshCw}
          variant="outline"
          size="touch"
          busy={refreshing}
          disabled={refreshDisabled}
          className="pointer-coarse:h-10"
          onClick={onRefresh}
        />
        <ActionMenu label="More actions" variant="outline" className="h-10 md:hidden" items={menuItems} />
      </div>
    </div>
  );
}
