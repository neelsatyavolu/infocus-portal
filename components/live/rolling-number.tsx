import { useLayoutEffect, useRef } from "react";

/** Reel timing: long enough to read as a roll, with a visible ease in and out (DESIGN.md §5 ease in-out). */
const ROLL_MS = 700;
const ROLL_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";
/** Each reel cell is a little taller than the digits so nothing clips. */
const CELL_EM = 1.1;
/** Cell 0 is blank (for a new leading digit), cells 1–10 are 0–9, cells 11–20 are 0–9 again for wrapping. */
const CELLS = ["", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The reel's current position in cells, read from its live transform (works mid-transition). */
function currentCell(strip: HTMLElement) {
  const style = getComputedStyle(strip);
  const offset = style.transform === "none" ? 0 : new DOMMatrixReadOnly(style.transform).m42;
  const cellPx = CELL_EM * parseFloat(style.fontSize);
  return cellPx ? -offset / cellPx : 0;
}

/**
 * Where a reel starts and stops (in cells) to show `digit`, always rolling up for a higher score and
 * down for a lower one. Positions in the second copy of 0–9 are folded back to the first copy (same
 * digit on screen), and a downward roll that would pass blank borrows the second copy instead.
 */
export function planRoll(current: number, digit: number, direction: 1 | -1) {
  const from = current >= 11 ? current - 10 : current;
  if (direction > 0) return { from, target: digit + 1 > from + 0.001 ? digit + 1 : digit + 11 };
  return { from: digit + 1 >= from - 0.001 ? from + 10 : from, target: digit + 1 };
}

function place(strip: HTMLElement, cell: number, animate: boolean) {
  strip.style.transition = animate ? `transform ${ROLL_MS}ms ${ROLL_EASE}` : "none";
  strip.style.transform = `translateY(${-cell * CELL_EM}em)`;
}

/**
 * One slot-machine reel. Rolls up for a higher score and down for a lower one, wrapping 9→0 like an
 * odometer. The reel stays mounted when its digit changes, so there is never a blank frame.
 */
function Reel({ digit, direction, rollIn }: { digit: number; direction: 1 | -1; rollIn: boolean }) {
  const stripRef = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(null);
  const rollInOnMount = useRef(rollIn);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const before = previous.current;
    previous.current = digit;

    if (before === null) {
      // A new leading digit mid-game (9 → 10) rolls in from blank; otherwise the first render sits still.
      if (rollInOnMount.current && !reducedMotion()) {
        place(strip, 0, false);
        strip.getBoundingClientRect();
        place(strip, digit + 1, true);
      } else {
        place(strip, digit + 1, false);
      }
      return;
    }
    if (before === digit) return;
    if (reducedMotion()) {
      place(strip, digit + 1, false);
      return;
    }

    // Start from wherever the reel is right now, even mid-roll, so quick taps never jump.
    const { from, target } = planRoll(currentCell(strip), digit, direction);
    place(strip, from, false);
    strip.getBoundingClientRect();
    place(strip, target, true);

    // After rolling into the second copy of 0–9, jump back to the first copy (same digit, no motion).
    const settle = (event: TransitionEvent) => {
      if (event.target !== strip) return;
      strip.removeEventListener("transitionend", settle);
      if (target > 10) place(strip, target - 10, false);
    };
    strip.addEventListener("transitionend", settle);
    return () => strip.removeEventListener("transitionend", settle);
  }, [digit, direction]);

  return (
    <span className="lv-reel" aria-hidden="true">
      <span ref={stripRef} className="lv-reel-strip">
        {CELLS.map((cell, index) => (
          <span key={index} className="lv-reel-cell">
            {cell}
          </span>
        ))}
      </span>
    </span>
  );
}

/** A score drawn as slot-machine reels, one per digit, keyed by place so each reel rolls in place. */
export function RollingNumber({ value }: { value: number }) {
  const last = useRef(value);
  const direction: 1 | -1 = value >= last.current ? 1 : -1;
  const previousLength = String(last.current).length;
  useLayoutEffect(() => {
    last.current = value;
  }, [value]);

  const digits = String(value).split("").map(Number);
  return (
    <span className="lv-sc" role="img" aria-label={String(value)}>
      {digits.map((digit, index) => {
        const placeFromRight = digits.length - 1 - index;
        return <Reel key={placeFromRight} digit={digit} direction={direction} rollIn={placeFromRight >= previousLength} />;
      })}
    </span>
  );
}
