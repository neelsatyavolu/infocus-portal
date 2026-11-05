"use client";

import { ArrowUp } from "lucide-react";
import { CONTROL_HEIGHT } from "@/components/kit/action-bar";
import { StatusDot, StatusTag } from "@/components/kit/status-tag";
import { RelativeAge } from "@/components/relative-age";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { mediaStatusWord, type ReviewVersion } from "@/components/review/comment-utils";
import { cn } from "@/src/lib/utils";

export type VersionActivity = {
  /** Threads (root comments) per version. */
  threadCounts: ReadonlyMap<string, number>;
  /** Comments new since the last visit, per version. */
  newCounts: ReadonlyMap<string, number>;
  /** Versions uploaded since the last visit and not opened yet. */
  newVersionIds: ReadonlySet<string>;
};

function versionLabel(version: ReviewVersion, latestId: string | undefined) {
  return `v${version.versionNumber}${version.id === latestId ? " · Latest" : ""}`;
}

/**
 * The version picker: "v3 · Latest" in the trigger; each option adds its status, thread count,
 * upload age, and what's new since the last visit.
 */
export function ReviewVersionSelect({
  versions,
  value,
  onChange,
  activity,
  size = "md",
  className
}: {
  versions: ReviewVersion[];
  value: string;
  onChange: (versionId: string) => void;
  activity: VersionActivity;
  size?: "md" | "touch";
  className?: string;
}) {
  const latestId = versions[0]?.id;
  const current = versions.find((version) => version.id === value) ?? versions[0];
  const otherNew = versions.some(
    (version) => version.id !== value && (activity.newVersionIds.has(version.id) || (activity.newCounts.get(version.id) ?? 0) > 0)
  );

  return (
    <Select value={current?.id ?? ""} onValueChange={onChange}>
      <SelectTrigger aria-label="Review version" className={cn("w-auto min-w-[9.5rem] gap-2", CONTROL_HEIGHT[size], className)}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{current ? versionLabel(current, latestId) : "No versions"}</span>
          {otherNew ? <StatusDot tone="new" size={6} label="Another version has something new" /> : null}
        </span>
      </SelectTrigger>
      <SelectContent align="start" className="min-w-[16rem]">
        {versions.map((version) => {
          const threads = activity.threadCounts.get(version.id) ?? 0;
          const fresh = activity.newCounts.get(version.id) ?? 0;
          return (
            <SelectItem key={version.id} value={version.id} className="py-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{versionLabel(version, latestId)}</span>
                  {activity.newVersionIds.has(version.id) ? (
                    <StatusTag size="sm" tone="success">
                      New
                    </StatusTag>
                  ) : fresh > 0 ? (
                    <span className="text-xs text-[var(--brand-green)]">{fresh} new</span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {mediaStatusWord(version.status)} · {threads} {threads === 1 ? "comment" : "comments"}
                  <RelativeAge iso={version.createdAt} prefix=" · " suffix=" ago" />
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/**
 * Back to the latest version, beside the picker at the picker's height. The "Older version" tag
 * itself sits with the other status tags in the header.
 */
export function GoToLatestButton({
  latestVersionNumber,
  onGoToLatest,
  size = "md",
  className
}: {
  latestVersionNumber: number;
  onGoToLatest: () => void;
  size?: "md" | "touch";
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn("shrink-0", CONTROL_HEIGHT[size], className)}
      title={`Decisions apply to the latest version (v${latestVersionNumber})`}
      onClick={onGoToLatest}
    >
      <ArrowUp aria-hidden />
      Go to v{latestVersionNumber}
    </Button>
  );
}
