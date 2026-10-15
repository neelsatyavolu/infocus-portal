"use client";

import { useEffect, useRef } from "react";
import { CountBadge } from "@/components/kit/status-tag";
import { ViewTabs } from "@/components/kit/view-tabs";
import { useStageComments } from "@/components/package-stages/use-stage-comments";
import { STAGE_FEEDBACK_READ_EVENT } from "@/src/lib/package-stage-comments";
import { packageStatus, packageTitle, type BrainstormPackage } from "./brainstorm-view";
import { BrainstormStatusTag } from "./package-panel";

/** Ties the package tabs to their ViewTabPanels. */
export const PACKAGE_TABS_ID = "brainstorm-package";

/** Remembered choice of package (per browser), for viewers on more than one package. */
export const PACKAGE_CHOICE_KEY = "brainstorming:package:v1";

export const isPackageId = (value: unknown): value is string => typeof value === "string";

/**
 * Unread producer notes on one package's brainstorming, as the old per-package View Feedback
 * button counted them. It reloads quietly whenever a feedback panel marks a stage read, so the
 * count clears once that package's notes have been on screen, and on the page's Refresh
 * (`refreshSignal`), so new notes on a package whose tab is closed show up too.
 */
function UnreadCount({ rowId, refreshSignal }: { rowId: string; refreshSignal: number }) {
  const { unread, load } = useStageComments({ rowId, stage: "brainstorming" });
  const lastSignal = useRef(refreshSignal);

  useEffect(() => {
    void load(false);
    const refresh = () => void load(false, { quiet: true });
    window.addEventListener(STAGE_FEEDBACK_READ_EVENT, refresh);
    return () => window.removeEventListener(STAGE_FEEDBACK_READ_EVENT, refresh);
  }, [load]);

  useEffect(() => {
    if (refreshSignal === lastSignal.current) return;
    lastSignal.current = refreshSignal;
    void load(false, { quiet: true });
  }, [refreshSignal, load]);

  return <CountBadge count={unread} srLabel={`${unread} unread`} />;
}

/**
 * Switches between the viewer's packages in one cycle (rare: a student or AP on two groups).
 * Each tab names the package, its Brainstorming status tag and its unread feedback count; the
 * page below is the same one-package layout for the chosen package.
 */
export function PackageTabs({
  packages,
  value,
  onChange,
  refreshSignal = 0
}: {
  packages: BrainstormPackage[];
  value: string;
  onChange: (packageId: string) => void;
  /** Bump to re-count unread notes quietly (the page's Refresh). */
  refreshSignal?: number;
}) {
  return (
    <ViewTabs
      ariaLabel="Your packages"
      idPrefix={PACKAGE_TABS_ID}
      value={value}
      onChange={onChange}
      items={packages.map((pkg) => ({
        value: pkg.id,
        title: packageTitle(pkg),
        label: (
          <>
            <span className="max-w-[14rem] truncate">{packageTitle(pkg)}</span>
            <BrainstormStatusTag status={packageStatus(pkg)} />
            <UnreadCount rowId={pkg.id} refreshSignal={refreshSignal} />
          </>
        )
      }))}
    />
  );
}
