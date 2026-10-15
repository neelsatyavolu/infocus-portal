import type { AssistantAudience } from "@/src/lib/assistant-access";
import type { AssistantPlacePreview } from "@/src/lib/assistant-places";

/** A change the assistant proposes; nothing is saved until Approve (POST /api/assistant/actions). */
export type ActionPreview = {
  token: string;
  kind: string;
  title: string;
  details: Array<{ label: string; value: string }>;
};

export type ActionState = "pending" | "running" | "done" | "dismissed" | "error";

export type PlaceState = "pending" | "dismissed" | "opened";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Kept on the message but never shown (doc ids must not appear in chat). */
  sources?: string[];
  proposals?: ActionPreview[];
  places?: AssistantPlacePreview[];
};

type AssistantReplyData = {
  reply?: string;
  sources?: string[];
  proposals?: ActionPreview[];
  places?: AssistantPlacePreview[];
};

export const NEAR_BOTTOM_PX = 100;
export const TRY_PAGE_SIZE = 3;
export const TRY_ROTATE_MS = 5000;

const MEMBER_STARTERS = [
  "How do I submit brainstorming?",
  "When is A-roll due?",
  "How do I request an extension?",
  "How do I check out equipment?",
  "Where is Brainstorming?",
  "What's the difference between The Cycle and Package Cycle?"
];

const ASSOCIATE_STARTERS = [
  "How do I send a package to the publishing queue?",
  "Who can approve stage 2?",
  "What's the difference between Groups and Package Cycle?",
  "Who can see the publishing queue?",
  "How do I check out equipment?",
  "Where is Groups?",
  "What packages am I producing?",
  "What comments are on my packages?",
  "When is participation scored?"
];

const EXECUTIVE_STARTERS = [
  "How do I send a package to the publishing queue?",
  "Who can approve stage 2?",
  "How do I add someone in Admin?",
  "What's the difference between Groups and Package Cycle?",
  "How do check-in grades post?",
  "Who can see the publishing queue?",
  "Where is Groups?",
  "What packages am I producing?",
  "What comments are on my packages?",
  "How do Final Cut scores work?"
];

const MUTATE_STARTERS = [
  "Add a package to cycle 1 called Lunch prices with Ada and Lo",
  "Make Sam an associate producer",
  "Send Lunch prices to the publishing queue",
  "What's Ada's grade?",
  "Set Ada's nickname to Ada",
  "What packages am I producing?",
  "What stage is Lunch prices on?",
  "Set cycle 1 quality for Lunch prices to 45",
  "How do I send a package to the publishing queue?",
  "Who can approve stage 2?",
  "Where is Groups?"
];

export function startersFor(audience: AssistantAudience, canMutate: boolean): readonly string[] {
  if (canMutate) {
    return MUTATE_STARTERS;
  }
  if (audience === "member") {
    return MEMBER_STARTERS;
  }
  if (audience === "associate") {
    return ASSOCIATE_STARTERS;
  }
  return EXECUTIVE_STARTERS;
}

const EXECUTIVE_INTRO =
  "I’m Portal Assistant. I can explain how Groups, grades, calendar, the publishing queue, Admin, and the rest of Portal work, look up the packages you produce, and check a package’s current stage and status.";

/** What the empty assistant says it can do, per role (the server gates the real tools). */
export const AUDIENCE_INTRO: Record<AssistantAudience, string> = {
  member:
    "I’m Portal Assistant. I can explain how your cycle tabs, grades, calendar, and the rest of Portal work, and look up packages you’re on.",
  associate:
    "I’m Portal Assistant. I can explain Groups, calendar, the publishing queue, and the rest of Portal, and look up the packages you produce. I cannot look up grades.",
  executive: EXECUTIVE_INTRO,
  admin: EXECUTIVE_INTRO
};

/** Extra line for super admin and the adviser (canMutate). */
export const MUTATE_INTRO =
  "I can also look up grades and propose changes — add packages, people, nicknames, or cycle dates. I’ll show a card for you to approve first.";

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const ALLOWED_PLACE_HOSTS = new Set([
  "drive.infocuspaly.com",
  "teleprompter.infocuspaly.com",
  "equipment.infocuspaly.com"
]);

/** Take me there only follows a Portal path or https on one of the InFocus app hosts. */
export function isSafePlaceHref(href: string) {
  if (href.startsWith("/") && !href.startsWith("//") && !href.includes("\\")) {
    return true;
  }
  try {
    const url = new URL(href);
    return url.protocol === "https:" && ALLOWED_PLACE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

type StreamEvent = {
  type?: string;
  label?: string;
  message?: string;
  data?: AssistantReplyData;
};

/**
 * Reads POST /api/assistant/chat. NDJSON: {type:"tool",label} adds a progress step,
 * {type:"done",data} carries the reply, {type:"error",message} throws. Falls back to a JSON {data}.
 */
export async function readAssistantStream(
  response: Response,
  onTool: (label: string) => void
): Promise<AssistantReplyData> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("ndjson") && !contentType.includes("jsonl")) {
    const payload = (await response.json()) as { data?: AssistantReplyData; error?: { message?: string } };
    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }
    return payload.data ?? {};
  }

  if (!response.body) {
    throw new Error("Assistant is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneData: AssistantReplyData | null = null;

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const event = JSON.parse(trimmed) as StreamEvent;
    if (event.type === "tool" && event.label) {
      onTool(event.label);
    } else if (event.type === "done") {
      doneData = event.data ?? {};
    } else if (event.type === "error") {
      throw new Error(event.message ?? "Assistant is unavailable.");
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      consumeLine(line);
    }
    if (done) {
      consumeLine(buffer);
      break;
    }
  }

  return doneData ?? {};
}
