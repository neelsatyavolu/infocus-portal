import { IPHONE_APPS_RELEASED, NEWS_IPHONE_APP_URL, PORTAL_IPHONE_APP_URL } from "@/src/lib/app-links";
import { equipmentAppOrigin } from "@/src/lib/hosts";
import { MAC_APP_DOWNLOAD_URL } from "@/src/lib/mac-app-bridge";

export type QuickLink = {
  key: string;
  label: string;
  hint: string;
  href: string;
  prefetch?: boolean;
};

/**
 * The hero's Equipment button (beside "Open InFocus Portal", as the user asked). Built per
 * request so it follows the environment: the equipment host in production, /equipment locally.
 */
export function homeEquipmentHref(): string {
  return process.env.NODE_ENV === "production" ? equipmentAppOrigin() : "/equipment";
}

/** The other public-facing shortcuts, first in the "Get around" list. */
export const homeQuickLinks: readonly QuickLink[] = [
  {
    key: "master-calendar",
    label: "Master Calendar",
    hint: "Show days, anchors and PA announcers. For class members.",
    href: "/master-calendar",
    prefetch: false
  },
  {
    key: "submit-announcement",
    label: "Submit an announcement",
    hint: "Open to anyone. InFocus reviews every request.",
    href: "/submit-announcement"
  }
];

export const homeApps = [
  {
    title: "InFocus for Mac",
    description: "Portal in its own window, with InFocus Drive in Finder.",
    href: MAC_APP_DOWNLOAD_URL,
    action: "Download",
    released: true
  },
  {
    title: "InFocus Portal for iPhone",
    description: "Packages, calendar, grades and messages on your phone.",
    href: PORTAL_IPHONE_APP_URL,
    action: "App Store",
    released: IPHONE_APPS_RELEASED
  },
  {
    title: "InFocus News for iPhone",
    description: "Every show and story, and live games.",
    href: NEWS_IPHONE_APP_URL,
    action: "App Store",
    released: IPHONE_APPS_RELEASED
  }
] as const;

/** What the Portal does, one line each. */
export const homePillars = [
  {
    title: "Story production",
    description: "Take a video report from pitch to final edit, with every version kept."
  },
  {
    title: "Editorial feedback",
    description: "Producers leave notes pinned to moments in the video, and approvals and grades follow."
  },
  {
    title: "Broadcast planning",
    description: "Show schedules, story assignments and show roles in one place."
  },
  {
    title: "Announcements",
    description: "Anyone at school can submit an announcement for an InFocus broadcast."
  }
] as const;
