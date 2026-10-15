import { MEMBER_GENERAL_CYCLE_NUMBER, memberNoteKey } from "@/src/lib/member-notes";

/** Pure data helpers for the Members page (no React), so they can be tested on their own. */

export type CycleTab = {
  cycleNumber: number;
  focus: string;
};

export type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  notesByCycle: Record<string, string>;
};

export type MembersPayload = {
  cycles: CycleTab[];
  members: MemberRow[];
};

/** Notes keyed by memberNoteKey(userId, cycle) = "userId:cycle". */
export type NoteMap = Record<string, string>;

export type NoteFilter = "all" | "with" | "without";

/** One member at a time (list/detail), or the whole class's notes for one tab on one page. */
export type MembersLayout = "person" | "class";

export function isMembersLayout(value: unknown): value is MembersLayout {
  return value === "person" || value === "class";
}

export function isNoteFilter(value: unknown): value is NoteFilter {
  return value === "all" || value === "with" || value === "without";
}

export function isCycleTabValue(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function personLabel(person: { name: string | null; email: string | null }) {
  return person.name?.trim() || person.email || "Unnamed member";
}

export function notesFromMembers(members: MemberRow[]): NoteMap {
  const notes: NoteMap = {};
  for (const member of members) {
    for (const [cycle, text] of Object.entries(member.notesByCycle)) {
      notes[memberNoteKey(member.id, Number(cycle))] = text;
    }
  }
  return notes;
}

/** Splits "userId:cycle" (user ids never end in ":<digits>", so the last colon is the split). */
export function parseNoteKey(key: string): { userId: string; cycleNumber: number } | null {
  const separator = key.lastIndexOf(":");
  if (separator <= 0) return null;
  const userId = key.slice(0, separator);
  const cycleNumber = Number(key.slice(separator + 1));
  return Number.isInteger(cycleNumber) ? { userId, cycleNumber } : null;
}

/**
 * A fresh server copy replaces every note the viewer hasn't touched in this visit. Touched notes
 * keep their draft (so text typed before the refresh landed isn't overwritten) and their last
 * acknowledged value (so a refresh that started before a save finished can't roll it back).
 */
export function rebaseNotes(
  server: NoteMap,
  local: { drafts: NoteMap; saved: NoteMap },
  touched: ReadonlySet<string>
): { drafts: NoteMap; saved: NoteMap } {
  const drafts: NoteMap = { ...server };
  const saved: NoteMap = { ...server };
  for (const key of touched) {
    if (key in local.drafts) drafts[key] = local.drafts[key];
    if (key in local.saved) saved[key] = local.saved[key];
  }
  return { drafts, saved };
}

/** The payload with each member's notes replaced by the acknowledged copy (for the client cache). */
export function withSavedNotes(payload: MembersPayload, saved: NoteMap): MembersPayload {
  return {
    cycles: payload.cycles,
    members: payload.members.map((member) => {
      const notesByCycle: Record<string, string> = { ...member.notesByCycle };
      for (const [key, text] of Object.entries(saved)) {
        const parsed = parseNoteKey(key);
        if (parsed && parsed.userId === member.id) notesByCycle[String(parsed.cycleNumber)] = text;
      }
      return { ...member, notesByCycle };
    })
  };
}

export function cycleCode(cycleNumber: number) {
  return String(cycleNumber).padStart(2, "0");
}

/** "General" or "Cycle 03". */
export function tabTitle(cycleNumber: number) {
  return cycleNumber === MEMBER_GENERAL_CYCLE_NUMBER ? "General" : `Cycle ${cycleCode(cycleNumber)}`;
}

/** The tabs (General = 0, then cycles) on which this member has a note, in the order given. */
export function tabsWithNotes(notes: NoteMap, memberId: string, tabs: number[]) {
  return tabs.filter((tab) => (notes[memberNoteKey(memberId, tab)] ?? "").trim().length > 0);
}

/** What the roster's coverage squares say, for screen readers. */
export function coverageLabel(tabsWithNote: number[]) {
  return tabsWithNote.length === 0 ? "No notes yet" : `Notes: ${tabsWithNote.map(tabTitle).join(", ")}`;
}

/** "No notes for Cycle 02, 04." */
export function missingCyclesText(cycleNumbers: number[]) {
  return `No notes for Cycle ${cycleNumbers.map(cycleCode).join(", ")}.`;
}

/** Header context for the active tab (copy kept from the old page). */
export function tabDescription(isGeneral: boolean, activeTab: number, activeCycle: CycleTab | null) {
  if (isGeneral) return "Standing notes on each reporter. Switch cycles for notes that stay with that package.";
  if (activeCycle?.focus?.trim()) return `Cycle ${activeCycle.cycleNumber} · ${activeCycle.focus}`;
  return `Notes for package cycle ${activeTab}.`;
}
