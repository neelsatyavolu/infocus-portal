/*
 * Where follow-along wants the script: the target word's visual line at the arrow, moved along
 * word by word. A line of six words shifts a sixth of a line per word, so the scroll is steady
 * instead of a line at a time (run mode's word spans carry `data-w`).
 */

function wordNode(content: HTMLElement, index: number) {
  return index < 0 ? null : content.querySelector<HTMLElement>(`[data-w="${index}"]`);
}

/** The target's position in px from the top of the script content, or null if it isn't rendered. */
export function followTargetY(content: HTMLElement, index: number): number | null {
  const node = wordNode(content, index);
  if (!node) {
    return null;
  }
  const top = node.offsetTop;
  const height = node.offsetHeight;

  let before = 0;
  while (wordNode(content, index - before - 1)?.offsetTop === top) {
    before += 1;
  }
  let after = 0;
  let nextLine: HTMLElement | null = null;
  for (let next = wordNode(content, index + 1); next; next = wordNode(content, index + after + 1)) {
    if (next.offsetTop !== top) {
      nextLine = next;
      break;
    }
    after += 1;
  }

  const lineCenter = top + height / 2;
  // Toward the next line, but never further than about a line (cues may sit in between).
  const span = Math.min((nextLine ? nextLine.offsetTop + nextLine.offsetHeight / 2 : lineCenter + height) - lineCenter, height * 1.2);
  const through = (before + 0.5) / (before + after + 1);
  return lineCenter + (through - 0.5) * span;
}
