import type { ConnectionQuality } from "@/src/lib/meetings/client/layout";
import { ordinal } from "@/src/lib/meetings/client/hands";

/**
 * What the call's status rail says, from state the call already has. Pure (no React), in priority
 * order: Reconnecting, people waiting (hosts), hands, presenting, notes, then the connection.
 */
type CallStatusKind = "reconnecting" | "waiting" | "hands" | "presenting" | "notes" | "quality";
type CallStatusTone = "neutral" | "live" | "success" | "warning" | "danger";

export type CallStatusItem = {
  kind: CallStatusKind;
  tone: CallStatusTone;
  /** Tag words on wide screens. */
  label: string;
  /** Compact tag text on phones (a number or ordinal); null = icon only. */
  short: string | null;
  /** Icon only everywhere (a good connection is not news; the words stay in hover and sr text). */
  quiet?: boolean;
  /** Full words for screen readers and hover text. */
  description: string;
  /** Clicking it opens the People panel. */
  opensPeople: boolean;
  /** Changes are announced (polite). */
  announce: boolean;
  /** Hover text when it differs from the description. */
  hint?: string;
  /** The connection item's level (picks the signal icon). */
  signal?: ConnectionQuality;
};

type CallStatusInput = {
  reconnecting: boolean;
  /** People in the lobby; 0 for non-hosts. */
  waitingCount: number;
  /** Your own raised-hand position, if your hand is up. */
  selfHand?: number;
  handsTotal: number;
  presenting: boolean;
  notesOn: boolean;
  quality: ConnectionQuality;
};

const QUALITY: Record<ConnectionQuality, { tone: CallStatusTone; label: string; description: string }> = {
  good: { tone: "neutral", label: "Good", description: "Good connection" },
  fair: { tone: "warning", label: "Unstable", description: "Unstable connection" },
  poor: { tone: "danger", label: "Poor", description: "Poor connection" },
  unknown: { tone: "neutral", label: "Checking", description: "Checking connection" }
};

function people(count: number) {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

function handsItem(selfHand: number | undefined, total: number): CallStatusItem | null {
  if (selfHand) {
    const place = ordinal(selfHand);
    return {
      kind: "hands",
      tone: "warning",
      label: `Your hand · ${place} of ${total}`,
      short: place,
      description: `Your hand is up, ${place} of ${total}.`,
      opensPeople: true,
      announce: true
    };
  }
  if (total <= 0) return null;
  return {
    kind: "hands",
    tone: "neutral",
    label: `${total} ${total === 1 ? "hand" : "hands"}`,
    short: String(total),
    description: `${total} ${total === 1 ? "hand" : "hands"} raised.`,
    opensPeople: true,
    announce: true
  };
}

export function callStatusItems(input: CallStatusInput): CallStatusItem[] {
  const items: Array<CallStatusItem | null> = [
    input.reconnecting
      ? { kind: "reconnecting", tone: "warning", label: "Reconnecting", short: null, description: "Reconnecting to the call.", opensPeople: false, announce: true }
      : null,
    input.waitingCount > 0
      ? {
          kind: "waiting",
          tone: "warning",
          label: `${input.waitingCount} waiting`,
          short: String(input.waitingCount),
          description: `${people(input.waitingCount)} waiting to join.`,
          opensPeople: true,
          announce: true
        }
      : null,
    handsItem(input.selfHand, input.handsTotal),
    input.presenting
      ? { kind: "presenting", tone: "success", label: "Presenting", short: null, description: "You're presenting.", opensPeople: false, announce: false }
      : null,
    input.notesOn
      ? {
          kind: "notes",
          tone: "live",
          label: "Notes on",
          short: "Notes",
          description: "Notes on.",
          hint: "The Drive Scribe is taking notes",
          opensPeople: false,
          announce: false
        }
      : null
  ];
  const quality = QUALITY[input.quality];
  return [
    ...items.filter((item): item is CallStatusItem => item !== null),
    {
      kind: "quality",
      tone: quality.tone,
      label: quality.label,
      short: null,
      description: quality.description,
      quiet: input.quality === "good",
      opensPeople: false,
      announce: false,
      signal: input.quality
    }
  ];
}

/** Always shown, however many tags fit: notes (the Drive Scribe is listening) and the connection. */
const PINNED: ReadonlySet<CallStatusKind> = new Set(["notes", "quality"]);

/**
 * Phones show fewer tags: the first `max` statuses in priority order, plus Notes and the
 * connection, which never drop (the old top bar always showed both). Order is kept.
 */
export function limitStatusItems(items: readonly CallStatusItem[], max: number): CallStatusItem[] {
  let left = max;
  return items.filter((item) => {
    if (PINNED.has(item.kind)) return true;
    if (left <= 0) return false;
    left -= 1;
    return true;
  });
}

/**
 * The phone bar (and the rail on its side): "Reconnecting" is left out here because phones say it
 * in words over the stage (ReconnectingNotice), where the word fits. Then limitStatusItems.
 */
export function phoneStatusItems(items: readonly CallStatusItem[], max: number): CallStatusItem[] {
  return limitStatusItems(
    items.filter((item) => item.kind !== "reconnecting"),
    max
  );
}

/** One sentence for the polite live region (lobby, hands, reconnecting). */
export function statusAnnouncement(items: readonly CallStatusItem[]) {
  return items
    .filter((item) => item.announce)
    .map((item) => item.description)
    .join(" ");
}
