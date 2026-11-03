import { Laptop, Smartphone, Tv } from "lucide-react";
import { IPHONE_APPS_RELEASED, NEWS_IPHONE_APP_URL, PORTAL_IPHONE_APP_URL } from "@/src/lib/app-links";
import { equipmentAppOrigin } from "@/src/lib/hosts";
import { MAC_APP_DOWNLOAD_URL } from "@/src/lib/mac-app-bridge";

/**
 * The hero's Equipment text link (beside Master Calendar). Built per
 * request so it follows the environment: the equipment host in production, /equipment locally.
 */
export function homeEquipmentHref(): string {
  return process.env.NODE_ENV === "production" ? equipmentAppOrigin() : "/equipment";
}

/** What the Portal does, one short line each. */
export const homeFeatures = [
  { title: "Packages", description: "Pitch to final cut, every version kept" },
  { title: "Review", description: "Feedback pinned to moments in the video" },
  { title: "Shows", description: "Schedules, anchors and deadlines" },
  { title: "Announcements", description: "Anyone can submit one for the broadcast" }
] as const;

export const homeApps = [
  {
    icon: Smartphone,
    title: "Portal for iPhone",
    description: "Packages, calendar, grades and alerts",
    href: PORTAL_IPHONE_APP_URL,
    action: "App Store",
    released: IPHONE_APPS_RELEASED
  },
  {
    icon: Laptop,
    title: "InFocus for Mac",
    description: "Portal, Drive in Finder, notifications",
    href: MAC_APP_DOWNLOAD_URL,
    action: "Download",
    released: true
  },
  {
    icon: Tv,
    title: "InFocus News",
    description: "Every show, story and live game",
    href: NEWS_IPHONE_APP_URL,
    action: "App Store",
    released: IPHONE_APPS_RELEASED
  }
] as const;
