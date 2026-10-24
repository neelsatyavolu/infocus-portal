import { normalizeEmail } from "@/src/lib/platform-admin";

/** Places that make the Slack post's text. Lanes tied on the board share a place, so more than three can make it. */
export const CLASS_BOARD_SLACK_TOP_PLACES = 3;

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/** `name` is what the post shows without a mention; `fullNames` are tried against Slack names when the email has no match. */
export type ClassBoardSlackMember = { name: string; email: string | null; fullNames: string[] };

export type SlackDirectoryUser = {
  id?: string;
  deleted?: boolean;
  is_bot?: boolean;
  real_name?: string;
  profile?: { email?: string; real_name?: string; display_name?: string };
};

/** Slack user IDs by email, and by full name (null when two people share it, so neither is guessed). */
export type SlackDirectory = {
  byEmail: ReadonlyMap<string, string>;
  byName: ReadonlyMap<string, string | null>;
};

export type ClassBoardSlackLane = {
  place: number;
  topic: string;
  members: ClassBoardSlackMember[];
};

/** Slack mrkdwn treats &, < and > as control characters. */
export function escapeSlackText(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "A", "A and B", "A, B and C". */
export function joinWithAnd(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * A name as a matching key: no accents, lowercase, single spaces. A single word is too likely to
 * belong to someone else, so it gives no key.
 */
export function slackNameKey(name: string | null | undefined) {
  const key = (name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return key.includes(" ") ? key : "";
}

export function buildSlackDirectory(users: SlackDirectoryUser[]): SlackDirectory {
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string | null>();
  for (const user of users) {
    if (!user.id || user.deleted || user.is_bot) continue;
    const email = normalizeEmail(user.profile?.email);
    if (email) byEmail.set(email, user.id);
    const keys = new Set([user.real_name, user.profile?.real_name, user.profile?.display_name].map(slackNameKey));
    for (const key of keys) {
      if (!key) continue;
      byName.set(key, byName.has(key) && byName.get(key) !== user.id ? null : user.id);
    }
  }
  return { byEmail, byName };
}

/** The member's Slack ID: by Portal email first, then by a full name only one Slack account has. */
export function findSlackId(member: ClassBoardSlackMember, directory: SlackDirectory) {
  const byEmail = member.email ? directory.byEmail.get(normalizeEmail(member.email)) : undefined;
  if (byEmail) return byEmail;
  for (const name of member.fullNames) {
    const byName = directory.byName.get(slackNameKey(name));
    if (byName) return byName;
  }
  return null;
}

/** A member's Slack mention when their Slack account is found, else their name as text. */
export function slackMention(member: ClassBoardSlackMember, directory: SlackDirectory) {
  const slackId = findSlackId(member, directory);
  return slackId ? `<@${slackId}>` : escapeSlackText(member.name);
}

export function classBoardSlackTopLanes<T extends { place: number }>(lanes: T[]) {
  return lanes.filter((lane) => lane.place <= CLASS_BOARD_SLACK_TOP_PLACES);
}

export function buildClassBoardSlackText(input: {
  cycleNumber: number;
  lanes: ClassBoardSlackLane[];
  boardUrl: string;
  directory: SlackDirectory;
}) {
  const rows = classBoardSlackTopLanes(input.lanes).map((lane) => {
    const mentions = lane.members.map((member) => slackMention(member, input.directory));
    const people = mentions.length > 0 ? ` (${joinWithAnd(mentions)})` : "";
    return `${MEDALS[lane.place]} *${escapeSlackText(lane.topic)}*${people}`;
  });
  return [`*Class Board · Cycle ${input.cycleNumber} standings*`, ...rows, `<${input.boardUrl}|See the full board>`].join("\n");
}

export function classBoardSlackFileName(dateKey: string) {
  return `class-board-${dateKey}.png`;
}
