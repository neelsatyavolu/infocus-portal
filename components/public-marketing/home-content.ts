import { IPHONE_APPS_RELEASED, NEWS_IPHONE_APP_URL, PORTAL_IPHONE_APP_URL } from "@/src/lib/app-links";
import { MAC_APP_DOWNLOAD_URL } from "@/src/lib/mac-app-bridge";

/** The one line of facts under the hero buttons. */
export const homeHeroFacts = [
  "Sign in with Google or an emailed code",
  "Anyone can submit an announcement",
  "Open source"
] as const;

/** What the Portal does, one or two sentences each. */
export const homeFeatures = [
  {
    title: "Packages",
    description: "Each story moves through pitch, contact, A-roll, initial cut and final cut. Every uploaded version is kept."
  },
  {
    title: "Review",
    description: "Comments pin to a timecode in the cut, take replies and get resolved. Approval happens on the same screen."
  },
  {
    title: "Shows",
    description: "The Show sets each broadcast's anchors and roles. The Master Calendar holds every deadline."
  },
  {
    title: "Announcements",
    description: "Anyone can submit one for the broadcast, and InFocus reviews every request."
  }
] as const;

export const homeApps = [
  {
    title: "Portal for iPhone",
    description: "Packages, calendar, grades and alerts",
    href: PORTAL_IPHONE_APP_URL,
    action: "App Store",
    released: IPHONE_APPS_RELEASED
  },
  {
    title: "InFocus for Mac",
    description: "Portal, Drive in Finder, notifications",
    href: MAC_APP_DOWNLOAD_URL,
    action: "Download",
    released: true
  },
  {
    title: "InFocus News",
    description: "Every show, story and live game",
    href: NEWS_IPHONE_APP_URL,
    action: "App Store",
    released: IPHONE_APPS_RELEASED
  }
] as const;
