/**
 * Arrow-key movement for one-row widgets (segmented controls, tabs, chip rows): returns the index
 * to focus after `key`, skipping disabled items and wrapping around, or null when the key isn't a
 * movement key or nothing is enabled.
 */
export function rovingIndex(current: number, key: string, disabled: readonly boolean[]): number | null {
  const count = disabled.length;
  if (count === 0 || disabled.every(Boolean)) return null;
  const firstEnabled = disabled.findIndex((off) => !off);
  const lastEnabled = count - 1 - [...disabled].reverse().findIndex((off) => !off);
  if (key === "Home") return firstEnabled;
  if (key === "End") return lastEnabled;
  const step = key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;
  if (step === 0) return null;
  let index = current;
  for (let tries = 0; tries < count; tries += 1) {
    index = (index + step + count) % count;
    if (!disabled[index]) return index;
  }
  return null;
}

/** Scrolls a horizontal strip so `child` is centred, without scrolling the page. */
export function centerInStrip(strip: HTMLElement | null, child: HTMLElement | null) {
  if (!strip || !child || strip.scrollWidth <= strip.clientWidth) return;
  strip.scrollLeft = child.offsetLeft - (strip.clientWidth - child.offsetWidth) / 2;
}
