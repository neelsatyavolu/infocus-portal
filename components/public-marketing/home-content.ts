import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Laptop,
  Layers,
  Megaphone,
  MessageSquareText,
  Smartphone,
  Sparkles,
  Tv,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import { IPHONE_APPS_RELEASED, NEWS_IPHONE_APP_URL, PORTAL_IPHONE_APP_URL } from "@/src/lib/app-links";
import { equipmentAppOrigin } from "@/src/lib/hosts";
import { MAC_APP_DOWNLOAD_URL } from "@/src/lib/mac-app-bridge";

export type QuickLink = {
  key: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  href: string;
  prefetch?: boolean;
  /** Neutral tag after the label. */
  tag?: string;
};

/**
 * The hero's Equipment button (beside "Open InFocus Portal", as the user asked). Built per
 * request so it follows the environment: the equipment host in production, /equipment locally.
 */
export function homeEquipmentHref(): string {
  return process.env.NODE_ENV === "production" ? equipmentAppOrigin() : "/equipment";
}

/** The other public-facing shortcuts, in the card beside the hero. */
export const homeQuickLinks: readonly QuickLink[] = [
  {
    key: "master-calendar",
    icon: CalendarDays,
    label: "View Master Calendar",
    hint: "Show days, anchors and PA announcers.",
    href: "/master-calendar",
    prefetch: false,
    tag: "Class members"
  },
  {
    key: "submit-announcement",
    icon: Megaphone,
    label: "Submit an announcement",
    hint: "Open to anyone. InFocus reviews every request.",
    href: "/submit-announcement"
  }
];

export const homeApps = [
  {
    icon: Smartphone,
    title: "InFocus Portal for iPhone",
    description: "Your packages, groups, calendar, grades and messages, with a notification for everything Portal emails you.",
    href: PORTAL_IPHONE_APP_URL,
    action: "Download on the App Store",
    released: IPHONE_APPS_RELEASED
  },
  {
    icon: Laptop,
    title: "InFocus for Mac",
    description: "Portal in its own window, InFocus Drive in Finder, and Mac notifications.",
    href: MAC_APP_DOWNLOAD_URL,
    action: "Download for Mac",
    released: true
  },
  {
    icon: Tv,
    title: "InFocus for everyone",
    description: "Every show and story, live games, and alerts when something new drops. Share it with friends and family.",
    href: NEWS_IPHONE_APP_URL,
    action: "Download on the App Store",
    released: IPHONE_APPS_RELEASED
  }
] as const;

/** The newsroom overview: the four areas of the work, each with the Portal tools behind it. */
export const homePillars = [
  {
    title: "Story Production",
    description: "Develop video reports, known as packages, from pitch to final edit.",
    tools: [
      {
        icon: Layers,
        title: "Video revision history",
        description: "Upload revised edits and refer to earlier versions and their feedback throughout production."
      },
      {
        icon: UsersRound,
        title: "Team collaboration",
        description: "Keep production notes, comments, and replies together so reporters and producers can coordinate revisions."
      }
    ]
  },
  {
    title: "Editorial Feedback",
    description: "Work with producers to refine reporting, editing, and presentation.",
    tools: [
      {
        icon: MessageSquareText,
        title: "Editorial review",
        description: "Share video reports with producers and receive feedback linked to specific moments in each video."
      },
      {
        icon: CheckCircle2,
        title: "Assessment and approvals",
        description: "Review assignment grades and follow each video report through the editorial approval process."
      }
    ]
  },
  {
    title: "Broadcast Planning",
    description: "Coordinate show schedules, team assignments, and production deadlines.",
    tools: [
      {
        icon: Clock3,
        title: "Production planning",
        description: "Access schedules, story assignments, and production resources from a shared newsroom portal."
      }
    ]
  },
  {
    title: "Community Announcements",
    description: "Submit school announcements for consideration in an InFocus broadcast.",
    tools: [
      {
        icon: Sparkles,
        title: "Newsroom updates",
        description: "Stay informed about production updates and announcements shared with the InFocus team."
      }
    ]
  }
] as const;
