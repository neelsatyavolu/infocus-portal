import type { AssistantAudience } from "@/src/lib/assistant-access";

export type AssistantPlacePreview = {
  id: string;
  title: string;
  href: string;
  hint: string;
  external?: boolean;
  newTab?: boolean;
};

type AssistantPlace = {
  id: string;
  label: string;
  href: string;
  hint: string;
  aliases: string[];
  audiences: readonly AssistantAudience[];
  external?: boolean;
  newTab?: boolean;
};

const ALL: readonly AssistantAudience[] = ["member", "associate", "executive", "admin"];
const PRODUCERS: readonly AssistantAudience[] = ["associate", "executive", "admin"];
const EXECS: readonly AssistantAudience[] = ["executive", "admin"];
const CYCLE_TABS: readonly AssistantAudience[] = ["member", "associate"];
const STUDENT_GRADES: readonly AssistantAudience[] = ["member", "associate"];

export const ASSISTANT_PLACES: readonly AssistantPlace[] = [
  {
    id: "announcements",
    label: "Announcements",
    href: "/announcements",
    hint: "Left sidebar, at the top",
    aliases: ["announcement", "bulletin"],
    audiences: ALL
  },
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    hint: "Left sidebar, at the top",
    aliases: ["home", "packages", "my packages"],
    audiences: ["member"]
  },
  {
    id: "packages",
    label: "Packages",
    href: "/dashboard",
    hint: "Left sidebar, at the top",
    aliases: ["dashboard", "projects", "workspace"],
    audiences: PRODUCERS
  },
  {
    id: "grades",
    label: "Grades",
    href: "/grades",
    hint: "Left sidebar, at the top",
    aliases: ["grade", "my grades", "all grades"],
    audiences: STUDENT_GRADES
  },
  {
    id: "master-calendar",
    label: "Master Calendar",
    href: "/master-calendar",
    hint: "Left sidebar, under Production",
    aliases: ["calendar", "anchors", "pa", "cast"],
    audiences: ALL
  },
  {
    id: "package-cycles",
    label: "Package Cycles",
    href: "/package-cycles",
    hint: "Left sidebar, under Production",
    aliases: ["cycle dates", "deadlines", "due dates"],
    audiences: ALL
  },
  {
    id: "drive",
    label: "InFocus Drive",
    href: "https://drive.infocuspaly.com",
    hint: "Left sidebar, under Production",
    aliases: ["drive", "nas", "files"],
    audiences: ALL,
    external: true,
    newTab: true
  },
  {
    id: "teleprompter",
    label: "Teleprompter",
    href: "https://teleprompter.infocuspaly.com",
    hint: "Left sidebar, under Production",
    aliases: ["prompter", "script"],
    audiences: ALL,
    external: true
  },
  {
    id: "information",
    label: "Information",
    href: "/information",
    hint: "Left sidebar, under The Cycle",
    aliases: ["the cycle", "cycle rules", "info"],
    audiences: CYCLE_TABS
  },
  {
    id: "brainstorming",
    label: "Brainstorming",
    href: "/brainstorming",
    hint: "Left sidebar, under The Cycle",
    aliases: ["brainstorm", "proof of contact", "contact"],
    audiences: CYCLE_TABS
  },
  {
    id: "a-roll",
    label: "A-roll/B-roll",
    href: "/a-roll",
    hint: "Left sidebar, under The Cycle",
    aliases: ["a roll", "b roll", "aroll", "broll", "a-roll", "b-roll"],
    audiences: CYCLE_TABS
  },
  {
    id: "initial-cut",
    label: "Initial Cut",
    href: "/initial-cut",
    hint: "Left sidebar, under The Cycle",
    aliases: ["initial", "rough cut"],
    audiences: CYCLE_TABS
  },
  {
    id: "final-cut",
    label: "Final Cut",
    href: "/final-cut",
    hint: "Left sidebar, under The Cycle",
    aliases: ["final"],
    audiences: CYCLE_TABS
  },
  {
    id: "livestreams",
    label: "Livestream Tracker",
    href: "/livestreams",
    hint: "Left sidebar, under Livestreams",
    aliases: ["livestream", "live stream", "tracker"],
    audiences: ALL
  },
  {
    id: "groups",
    label: "Groups",
    href: "/groups",
    hint: "Left sidebar, under Producers",
    aliases: ["group", "tiles", "pitch", "review"],
    audiences: PRODUCERS
  },
  {
    id: "members",
    label: "Members",
    href: "/members",
    hint: "Left sidebar, under Producers",
    aliases: ["member notes", "people", "notes"],
    audiences: PRODUCERS
  },
  {
    id: "package-progress",
    label: "Package Cycle",
    href: "/package-progress",
    hint: "Left sidebar, under Producers",
    aliases: ["roster", "package cycle roster"],
    audiences: PRODUCERS
  },
  {
    id: "publishing-queue",
    label: "Publishing Queue",
    href: "/publishing-queue",
    hint: "Left sidebar, under Producers",
    aliases: ["queue", "pq", "air date", "show date"],
    audiences: PRODUCERS
  },
  {
    id: "grade-editor",
    label: "Grade Editor",
    href: "/grade-editor",
    hint: "Left sidebar, under Producers",
    aliases: ["gradebook", "scores", "grading", "grades"],
    audiences: EXECS
  },
  {
    id: "the-show",
    label: "The Show",
    href: "/show-roles",
    hint: "Left sidebar, under Producers",
    aliases: ["show roles", "rundown"],
    audiences: PRODUCERS
  },
  {
    id: "participation",
    label: "Participation",
    href: "/participation",
    hint: "Left sidebar, under Producers",
    aliases: ["class participation"],
    audiences: PRODUCERS
  },
  {
    id: "class-board",
    label: "Class Board",
    href: "/class-board",
    hint: "Not in the sidebar. Open /class-board",
    aliases: ["class board", "master dashboard", "classroom display"],
    audiences: ALL
  },
  {
    id: "extension-requests",
    label: "Extension Requests",
    href: "/extension-requests",
    hint: "Left sidebar",
    aliases: ["extension", "extensions"],
    audiences: ALL
  },
  {
    id: "submitted",
    label: "Submitted",
    href: "/announcements/submitted",
    hint: "Left sidebar, under Announcements",
    aliases: ["submitted announcements"],
    audiences: ALL
  },
  {
    id: "admin",
    label: "Admin Dashboard",
    href: "/admin",
    hint: "Left sidebar, under Admin",
    aliases: ["admin", "accounts", "access requests"],
    audiences: EXECS
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    hint: "Left sidebar, under Admin",
    aliases: ["notifications", "account"],
    audiences: ALL
  },
  {
    id: "equipment",
    label: "Equipment",
    href: "/equipment",
    hint: "Equipment checkout",
    aliases: ["checkout", "camera", "gear"],
    audiences: ALL
  }
];

const LEAD_IN =
  /^(where(?:'s|s| is| are)?|take me to|show me|open|go to|find|how do i (?:get to|find|open))\s+/i;

export function normalizePlaceQuery(raw: string) {
  return raw
    .toLowerCase()
    .replace(LEAD_IN, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(the|my|our)\s+/, "")
    .trim();
}

export function isMyPackageQuery(query: string) {
  const normalized = normalizePlaceQuery(query);
  return normalized === "package" || normalized === "group";
}

function placePreview(place: AssistantPlace): AssistantPlacePreview {
  return {
    id: place.id,
    title: place.label,
    href: place.href,
    hint: place.hint,
    ...(place.external ? { external: true } : {}),
    ...(place.newTab ? { newTab: true } : {})
  };
}

function scorePlace(place: AssistantPlace, query: string) {
  const label = normalizePlaceQuery(place.label);
  const aliases = place.aliases.map((alias) => normalizePlaceQuery(alias));
  if (query === place.id || query === label) {
    return 100;
  }
  if (aliases.includes(query)) {
    return 90;
  }
  if (query.length >= 4 && (label.includes(query) || aliases.some((alias) => alias.includes(query)))) {
    return 50 + Math.min(query.length, 20);
  }
  if (query.length >= 4 && label.length >= 4 && query.includes(label)) {
    return 40;
  }
  return 0;
}

function bestPlace(query: string, places: readonly AssistantPlace[]) {
  let winner: AssistantPlace | null = null;
  let best = 0;
  for (const place of places) {
    const score = scorePlace(place, query);
    if (score > best) {
      winner = place;
      best = score;
    }
  }
  return best > 0 ? winner : null;
}

export function matchAssistantPlace(query: string, audience: AssistantAudience): AssistantPlacePreview | null {
  const normalized = normalizePlaceQuery(query);
  if (!normalized) {
    return null;
  }
  const allowed = ASSISTANT_PLACES.filter((place) => place.audiences.includes(audience));
  const match = bestPlace(normalized, allowed);
  return match ? placePreview(match) : null;
}

export function findGatedAssistantPlace(query: string, audience: AssistantAudience): AssistantPlacePreview | null {
  const normalized = normalizePlaceQuery(query);
  if (!normalized) {
    return null;
  }
  const match = bestPlace(normalized, ASSISTANT_PLACES);
  if (!match || match.audiences.includes(audience)) {
    return null;
  }
  return placePreview(match);
}

export function assistantPlacePreview(input: {
  id: string;
  title: string;
  href: string;
  hint: string;
  external?: boolean;
  newTab?: boolean;
}): AssistantPlacePreview {
  return {
    id: input.id,
    title: input.title,
    href: input.href,
    hint: input.hint,
    ...(input.external ? { external: true } : {}),
    ...(input.newTab ? { newTab: true } : {})
  };
}
