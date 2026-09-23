export const ROLL_KINDS = ["a-roll", "b-roll"] as const;
export type RollKind = (typeof ROLL_KINDS)[number];

const ROLL_PREFIX: Record<RollKind, string> = {
  "a-roll": "A-roll · ",
  "b-roll": "B-roll · "
};

export function isRollKind(value: string | null | undefined): value is RollKind {
  return value === "a-roll" || value === "b-roll";
}

export function rollKindLabel(kind: RollKind) {
  return kind === "a-roll" ? "A-roll" : "B-roll";
}

export function rollUploadSizeError(kind: RollKind, size: number): string | null {
  const maxGb = kind === "a-roll" ? 30 : 15;
  return size > maxGb * 1024 ** 3
    ? `${rollKindLabel(kind)} files must be ${maxGb} GB or smaller.`
    : null;
}

export function parseRollTitle(title: string): { rollKind: RollKind | null; displayTitle: string } {
  const trimmed = (title || "").trim();
  for (const kind of ROLL_KINDS) {
    const prefix = ROLL_PREFIX[kind];
    if (trimmed.startsWith(prefix)) {
      return { rollKind: kind, displayTitle: trimmed.slice(prefix.length).trim() || trimmed };
    }
  }
  return { rollKind: null, displayTitle: trimmed };
}

export function titledWithRollKind(title: string, rollKind: RollKind) {
  const { displayTitle } = parseRollTitle(title);
  return `${ROLL_PREFIX[rollKind]}${displayTitle}`;
}

export function rollKindFolder(kind: RollKind) {
  return kind === "a-roll" ? "A-roll" : "B-roll";
}
