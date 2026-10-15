import type { GroupStageFacts, StageCell, StageCellKey } from "./stage-bar-model";

/**
 * "Changed since your last visit" on a group's stage bar (per viewer, this browser only), the
 * producer side of the student bar's green dot: new proofs, a new cut, a status a reviewer or the
 * group changed. Each cell is reduced to a signature (its status word plus when its work last
 * moved); "" means nothing to report yet (no tag, or PENDING).
 */
export type CellSignatures = Partial<Record<StageCellKey, string>>;

function latest(isos: Array<string | null | undefined>) {
  return isos.filter(Boolean).sort().at(-1) ?? "";
}

function cellStamp(key: StageCellKey, facts: GroupStageFacts) {
  if (key === "brainstorming") return latest([facts.proofsUpdatedAt, facts.brainstormFeedbackAt]);
  if (key === "initial") return latest([facts.latestCutAt, ...facts.signoffs.map((signoff) => signoff.createdAt)]);
  if (key === "final-cut") return facts.queuedForShowDate ?? "";
  return "";
}

export function cellSignatures(cells: StageCell[], facts: GroupStageFacts): CellSignatures {
  return Object.fromEntries(
    cells.map((cell) => [
      cell.key,
      !cell.status || cell.status === "pending" ? "" : `${cell.status}|${cellStamp(cell.key, facts)}`
    ])
  );
}

/**
 * The open stage and stages seen for the first time are recorded quietly (nothing flags on a
 * first visit). A stage whose signature changed to something worth reporting is flagged and keeps
 * its old record until it is opened; a change back to nothing ("") is recorded without a flag.
 */
export function nextSeenSignatures(
  seen: CellSignatures,
  current: CellSignatures,
  activeKey: StageCellKey | null
): { seen: CellSignatures; flagged: Set<StageCellKey> } {
  const next: CellSignatures = { ...seen };
  const flagged = new Set<StageCellKey>();
  for (const [key, signature] of Object.entries(current) as Array<[StageCellKey, string | undefined]>) {
    if (signature === undefined) continue;
    const previous = seen[key];
    if (key === activeKey || previous === undefined || signature === "") {
      next[key] = signature;
    } else if (previous !== signature) {
      flagged.add(key);
    }
  }
  return { seen: next, flagged };
}
