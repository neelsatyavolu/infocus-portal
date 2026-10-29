"use client";

import { useMemo } from "react";
import type { PlatformRole } from "@prisma/client";
import type { HubTabWithStatus } from "@/components/hub-tabs";
import { useGradesSeen } from "@/components/shell/nav-seen";
import { hasRole } from "@/components/shell/shell-route";
import { useNavStatus } from "@/components/shell/use-nav-status";
import {
  buildCycleCard,
  buildHubTabs,
  buildNavSignals,
  buildPhoneTabs,
  buildSidebarNav,
  isPackageRoute,
  moreTabSignal,
  myPackageHref,
  navStatusPartsFor
} from "@/src/lib/sidebar-nav";

/**
 * Everything the shell's navigation shows for this person and page: sidebar sections, phone
 * tabs, hub tabs, whether the package stage bar shows, and one status
 * signal per item from GET /api/nav/status.
 */
export function useShellNav({
  platformRole,
  sampleOnly,
  chrome,
  pathname,
  email
}: {
  platformRole: PlatformRole | null;
  sampleOnly: boolean;
  /** Sidebar, top bar and tabs are showing (not bare review, the class board or the iPhone app). */
  chrome: boolean;
  pathname: string;
  email: string | null;
}) {
  const isProducer = hasRole(platformRole, "ASSOCIATE_PRODUCER");
  const canManageGrades = hasRole(platformRole, "EXECUTIVE_PRODUCER");
  const statusParts = useMemo(() => navStatusPartsFor(platformRole), [platformRole]);
  const { status, loaded } = useNavStatus({ enabled: chrome && !sampleOnly, parts: statusParts, pathname });
  const pkg = status.package;
  // Any producer (AP, EP, super admin) on a package roster works it as a student.
  const showCycleTabs = !isProducer || Boolean(pkg?.hasRow);
  const unlocked = pkg?.unlocked ?? null;
  const navContext = useMemo(
    () => ({
      isProducer,
      showCycleTabs,
      canManageGrades,
      canManageAdmin: canManageGrades,
      sampleOnly,
      myPackageHref: myPackageHref(unlocked)
    }),
    [isProducer, showCycleTabs, canManageGrades, sampleOnly, unlocked]
  );
  const sections = useMemo(() => buildSidebarNav(navContext), [navContext]);
  const phoneTabs = useMemo(() => (chrome ? buildPhoneTabs(navContext) : []), [chrome, navContext]);
  const gradesSeenAt = useGradesSeen({
    email,
    latestPublishedAt: status.latestGradePublishedAt,
    gradesLoaded: loaded.has("grades"),
    onGradesPage: pathname === "/grades" || pathname.startsWith("/grades/")
  });
  const signals = useMemo(
    () => buildNavSignals(status, { gradesSeenAt, now: new Date(), showExtensionRequests: !isProducer }),
    [status, gradesSeenAt, isProducer]
  );
  const more = moreTabSignal(
    signals,
    phoneTabs.map((tab) => tab.id),
    sections.flatMap((section) => section.items.map((item) => item.id))
  );
  const hubTabs: HubTabWithStatus[] | null = chrome ? buildHubTabs(navContext, pathname) : null;

  return {
    isProducer,
    status,
    unlocked,
    sections,
    phoneTabs,
    signals,
    more,
    hubTabs,
    // Only where the sidebar shows the student package screens (students, producers on a roster).
    cycleCard: chrome && showCycleTabs && !sampleOnly ? buildCycleCard(pkg, new Date()) : null,
    showPackageStageNav:
      chrome && showCycleTabs && !sampleOnly && isPackageRoute(pathname, { includeExtensionRequests: !isProducer })
  };
}
