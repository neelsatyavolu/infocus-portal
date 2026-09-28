/** The toss is read aloud by an anchor, so keep it to a few sentences. */
export const TOSS_MAX_LENGTH = 500;

export const TOSS_EXAMPLE =
  "Last month, hundreds of community members gathered at the Palo Alto Airport to celebrate its 25th anniversary. InFocus reporters Abby and Otto went there to learn more.";

/** Why a Final Cut toss can't be used, or null when it is fine. */
export function tossError(toss: string): string | null {
  const trimmed = toss.trim();
  if (!trimmed) return "Add a toss for the anchors.";
  if (trimmed.length > TOSS_MAX_LENGTH) return `Keep the toss to ${TOSS_MAX_LENGTH} characters or fewer.`;
  // Brackets and braces are teleprompter cues ({HOLD}, [INSERT …]).
  if (/[<>[\]{}]/.test(trimmed)) return "The toss can't include < > [ ] { }.";
  return null;
}

/** Collapses stray whitespace so the teleprompter gets clean lines. */
export function normalizeToss(toss: string) {
  return toss.trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
}
