import type { ComponentType } from "react";
import {
  Briefcase,
  CalendarDays,
  CheckSquare,
  Clapperboard,
  Cloud,
  Edit3,
  Hourglass,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Mic2,
  Newspaper,
  Radio,
  ScrollText,
  Settings,
  Shield,
  UserCog,
  Users,
  UsersRound,
  Video
} from "lucide-react";
import { isInHub, isPackageRoute, type SidebarNavItem, type SidebarNavItemId } from "@/src/lib/sidebar-nav";

export type NavIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const NAV_ICONS: Record<SidebarNavItemId, NavIcon> = {
  dashboard: LayoutDashboard,
  "my-package": Clapperboard,
  grades: CheckSquare,
  calendar: CalendarDays,
  groups: UsersRound,
  "package-progress": ListChecks,
  people: Users,
  meetings: Video,
  "extension-requests": Hourglass,
  "grade-editor": Edit3,
  show: Mic2,
  livestreams: Radio,
  announcements: Megaphone,
  ideas: Newspaper,
  managers: UserCog,
  drive: Cloud,
  teleprompter: ScrollText,
  admin: Shield,
  settings: Settings
};

/** Producers see the dashboard as "Packages" with a briefcase. */
export function navIconFor(id: SidebarNavItemId, isProducer: boolean): NavIcon {
  return id === "dashboard" && isProducer ? Briefcase : NAV_ICONS[id];
}

/** Whether a sidebar or phone tab item is the page you're on (hub items stay lit on every tab). */
export function isNavItemActive(item: SidebarNavItem, pathname: string, onMeetHost: boolean, isProducer: boolean) {
  switch (item.id) {
    case "dashboard":
      return pathname.startsWith("/dashboard") || pathname.startsWith("/projects");
    case "my-package":
      // A producer's /extension-requests is their approval queue, lit as Extension Requests only.
      return isPackageRoute(pathname, { includeExtensionRequests: !isProducer });
    case "meetings":
      return pathname.startsWith("/meetings") || (onMeetHost && pathname === "/");
    case "show":
      return isInHub("show", pathname);
    case "people":
      return isInHub("people", pathname);
    case "calendar":
      return isInHub("calendar", pathname);
    case "announcements":
      return isInHub("announcements", pathname);
    default:
      return !item.external && pathname.startsWith(item.href);
  }
}
