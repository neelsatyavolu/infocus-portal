/** Client-side shapes and pure helpers for Messages (GET/POST /api/hub-chat). */

export type Person = { id: string; name: string };

export type InboxChat = {
  /** null for a package group chat nobody has opened yet (opening it creates the chat). */
  id: string | null;
  kind: "GROUP" | "DIRECT";
  /** GROUP: member names. DIRECT: the other person's name. */
  title: string;
  /** GROUP: the package topic, or "Cycle N". DIRECT: "Direct". */
  subtitle: string;
  /** The latest message body. */
  preview: string | null;
  updatedAt: string | null;
  unreadCount: number;
  packageRowId?: string;
  peer?: Person | null;
};

export type InboxPayload = {
  me: Person;
  canStartDirect: boolean;
  unreadCount: number;
  chats: InboxChat[];
  members: Person[];
  /** Lite polls list only chats you belong to and no class roster. */
  lite?: boolean;
};

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  author: Person;
};

export type ThreadPayload = {
  me: Person;
  chat: {
    id: string;
    kind: "GROUP" | "DIRECT";
    title: string;
    subtitle: string;
    packageRowId: string | null;
    peer: Person | null;
  };
  messages: ThreadMessage[];
};

export const INBOX_POLL_MS = 5000;
export const THREAD_POLL_MS = 4000;
/** Interval polls fetch the lite inbox; the full lists refresh on open and at least this often. */
export const INBOX_FULL_REFRESH_MS = 60_000;

/** Same order as sortHubInbox (src/lib/hub-chat.ts, which is server-only via its imports). */
function sortInbox(chats: InboxChat[]) {
  return [...chats].sort((a, b) => {
    if (a.updatedAt && b.updatedAt) {
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    if (a.updatedAt) {
      return -1;
    }
    if (b.updatedAt) {
      return 1;
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

/**
 * A lite poll returns every chat you belong to (with current unread and preview) but not
 * never-opened groups or the class roster, so keep those from the last full load.
 */
export function mergeLiteInbox(previous: InboxPayload | null, lite: InboxPayload): InboxPayload {
  if (!previous) {
    return lite;
  }
  const openedRowIds = new Set(lite.chats.map((chat) => chat.packageRowId).filter(Boolean));
  const neverOpened = previous.chats.filter(
    (chat) => chat.id === null && !(chat.packageRowId && openedRowIds.has(chat.packageRowId))
  );
  const dmPeerIds = new Set(lite.chats.map((chat) => chat.peer?.id).filter(Boolean));
  return {
    ...lite,
    lite: undefined,
    chats: sortInbox([...lite.chats, ...neverOpened]),
    members: previous.members.filter((person) => !dmPeerIds.has(person.id))
  };
}

export async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Could not load messages.");
  }
  if (!payload.data) {
    throw new Error("Could not load messages.");
  }
  return payload.data;
}

/** Stable key for a row: the chat id, else the package row (never-opened group), else the person. */
export function chatKey(chat: InboxChat) {
  return chat.id ?? chat.packageRowId ?? chat.peer?.id ?? chat.title;
}

/** A class member with no DM yet, as a chat to open (POST /api/hub-chat {kind:"DIRECT"}). */
export function directChatFor(person: Person): InboxChat {
  return {
    id: null,
    kind: "DIRECT",
    title: person.name,
    subtitle: "Direct",
    preview: null,
    updatedAt: null,
    unreadCount: 0,
    peer: person
  };
}

/**
 * The two lines of an inbox row; line 2 carries the latest message on every kind of row. A
 * group shows its members (unique even while topics are still "Cycle N") over the package and
 * the latest message ("Lunch prices · See you at 3", just the package before any); a direct
 * chat shows the person over the latest message ("Direct" before any).
 */
export function inboxRowLines(chat: InboxChat) {
  if (chat.kind === "GROUP") {
    return { primary: chat.title, secondary: chat.preview ? `${chat.subtitle} · ${chat.preview}` : chat.subtitle };
  }
  return { primary: chat.title, secondary: chat.preview || "Direct" };
}

/** Case-insensitive search over a chat's title and subtitle (and a person's name). */
export function matchesQuery(query: string, ...fields: string[]) {
  const needle = query.trim().toLowerCase();
  return !needle || fields.some((field) => field.toLowerCase().includes(needle));
}
