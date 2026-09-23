export type ClassifiedRunScriptLine =
  | { kind: "gap" }
  | { kind: "camera"; text: string }
  | { kind: "cue"; text: string; spoken?: string }
  | { kind: "spoken"; text: string };

const CAMERA_PATTERN = /^CAM\s*\d+$/i;
const BRACE_CUE_PATTERN = /^\{[^}]+\}$/;
const BRACKET_CUE_PATTERN = /^\[[A-Z][A-Z0-9 \-]*\]$/i;
const ROLE_PREFIX =
  /^(ANCHOR|CO[\s-]?ANCHOR|CAM\s*\d+|TALENT|HOST|NARRATOR|REPORTER|VOICE\s*OVER|VO|SOT)\s*[:\-]\s*(.*)$/i;
const STANDALONE_CUE =
  /^(ANCHOR|CO[\s-]?ANCHOR|HOLD|ROLL\s+(INTRO|PACKAGE|OUTRO)|OPEN|BULLETIN|PACKAGE|CLOSING|TALENT|HOST|NARRATOR|REPORTER|VOICE\s*OVER|VO|SOT)$/i;
/** Default rundown beat titles. Spoken copy must not match this. */
const SECTION_BEAT_HEADING = /^(OPEN(ING)?|PACKAGE|BULLETIN|CLOS(E|ING)|INTRO|OUTRO)$/i;

export function formatRunCueLabel(value: string) {
  let label = value.trim();
  const braceMatch = label.match(/^\{([^}]+)\}$/);
  if (braceMatch) {
    label = braceMatch[1]?.trim() || label;
  }

  const bracketMatch = label.match(/^\[([^\]]+)\]$/);
  if (bracketMatch) {
    label = bracketMatch[1]?.trim() || label;
  }

  const normalized = label.replace(/\s+/g, " ").toUpperCase();
  if (normalized === "CO ANCHOR" || normalized === "CO-ANCHOR") {
    return "COANCHOR";
  }

  return normalized;
}

export function classifyRunScriptLine(line: string): ClassifiedRunScriptLine {
  const trimmed = line.trim();
  if (!trimmed) {
    return { kind: "gap" };
  }

  if (CAMERA_PATTERN.test(trimmed)) {
    return { kind: "camera", text: trimmed.toUpperCase().replace(/\s+/g, " ") };
  }

  const roleMatch = trimmed.match(ROLE_PREFIX);
  if (roleMatch) {
    const role = roleMatch[1] ?? trimmed;
    const spoken = roleMatch[2]?.trim();
    if (CAMERA_PATTERN.test(role)) {
      return {
        kind: "camera",
        text: formatRunCueLabel(role)
      };
    }

    return {
      kind: "cue",
      text: formatRunCueLabel(role),
      spoken: spoken || undefined
    };
  }

  if (BRACE_CUE_PATTERN.test(trimmed) || BRACKET_CUE_PATTERN.test(trimmed) || STANDALONE_CUE.test(trimmed)) {
    return {
      kind: "cue",
      text: formatRunCueLabel(trimmed)
    };
  }

  return { kind: "spoken", text: trimmed };
}

function formatSectionHeadingLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getSectionDisplayParts(section: { label: string; content: string }) {
  const lines = section.content.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim().length > 0);
  const heading = headingIndex === -1 ? "" : lines[headingIndex]?.trim() ?? "";

  if (!heading || !SECTION_BEAT_HEADING.test(heading)) {
    return {
      badgeLabel: section.label,
      content: section.content
    };
  }

  const content = lines
    .filter((_, index) => index !== headingIndex)
    .join("\n")
    .replace(/^\s*\n+/, "")
    .trim();

  return {
    badgeLabel: `${section.label} - ${formatSectionHeadingLabel(heading)}`,
    content
  };
}
