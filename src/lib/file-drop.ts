export type DroppedFiles = { accepted: File[]; rejected: File[] };

/** True when a drag carries files from the computer, not text, links, or in-page items. */
export function hasDraggedFiles(types: readonly string[]) {
  return types.includes("Files");
}

function matchesAcceptRule(file: File, rule: string) {
  if (rule.startsWith(".")) return file.name.toLowerCase().endsWith(rule);
  const type = file.type.toLowerCase();
  if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
  return type === rule;
}

/** Splits dropped files with the same rules as `<input accept>`, e.g. "video/*" or "image/*,.pdf". */
export function splitDroppedFiles(files: File[], accept: string): DroppedFiles {
  const rules = accept
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  const matches = (file: File) => rules.length === 0 || rules.some((rule) => matchesAcceptRule(file, rule));
  return {
    accepted: files.filter(matches),
    rejected: files.filter((file) => !matches(file))
  };
}
