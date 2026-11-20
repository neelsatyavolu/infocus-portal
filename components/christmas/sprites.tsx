/**
 * The Christmas visitors and decorations, drawn in the InFocus Christmas 2026 Package colors
 * (Holly Green, Deep Holly, Scarlet, Christmas Red) plus gold, cocoa and gingerbread browns.
 */

const HOLLY = "#23A05C";
const DEEP_HOLLY = "#0A6B3C";
const SCARLET = "#D42B2B";
const CHRISTMAS_RED = "#B01E2E";
const GOLD = "#F2C14E";
const SNOW = "#F4F1E8";

/** [box, ribbon] pairs for the presents. */
const GIFT_COLORS: readonly (readonly [string, string])[] = [
  [SCARLET, GOLD],
  [DEEP_HOLLY, SCARLET],
  [SNOW, HOLLY],
  [CHRISTMAS_RED, SNOW],
  ["#2F6FB0", SNOW],
  [GOLD, CHRISTMAS_RED]
];
export const GIFT_VARIANT_COUNT = GIFT_COLORS.length;

export function GiftSprite({ variant = 0, golden = false }: { variant?: number; golden?: boolean }) {
  const [box, ribbon] = golden ? (["#E8B730", "#FFF4C2"] as const) : GIFT_COLORS[variant % GIFT_COLORS.length];
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <rect x="6" y="20" width="36" height="25" rx="2" fill={box} />
      <rect x="6" y="20" width="36" height="5" fill="#000" opacity="0.12" />
      <rect x="3" y="14" width="42" height="8" rx="2" fill={box} />
      <rect x="21" y="14" width="6" height="31" fill={ribbon} />
      <path d="M24 14 C16 2 6 8 14 14 Z" fill={ribbon} />
      <path d="M24 14 C32 2 42 8 34 14 Z" fill={ribbon} />
      <circle cx="24" cy="14" r="3" fill={ribbon} stroke="#000" strokeOpacity="0.15" />
      {golden ? <path d="M10 28 l2 4 l-2 4 l-2 -4 Z M38 32 l1.5 3 l-1.5 3 l-1.5 -3 Z" fill="#FFF8DC" /> : null}
    </svg>
  );
}

export function GingerbreadSprite() {
  const dough = "#B86B2E";
  return (
    <svg viewBox="0 0 48 60" aria-hidden>
      <g stroke={dough} strokeLinecap="round" strokeWidth="10" fill="none">
        <path d="M24 26 L10 22" />
        <path d="M24 26 L38 22" />
        <path d="M20 40 L13 54" />
        <path d="M28 40 L35 54" />
      </g>
      <rect x="14" y="20" width="20" height="24" rx="9" fill={dough} />
      <circle cx="24" cy="12" r="10" fill={dough} />
      <g stroke={SNOW} strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M20 15 Q24 19 28 15" />
        <path d="M6 20 l2 3 l2 -3" />
        <path d="M38 20 l2 3 l2 -3" />
        <path d="M10 53 l3 2 l3 -2" />
        <path d="M32 53 l3 2 l3 -2" />
      </g>
      <circle cx="20.5" cy="10" r="1.6" fill={SNOW} />
      <circle cx="27.5" cy="10" r="1.6" fill={SNOW} />
      <circle cx="24" cy="26" r="2" fill={SCARLET} />
      <circle cx="24" cy="32" r="2" fill={HOLLY} />
      <circle cx="24" cy="38" r="2" fill={SCARLET} />
    </svg>
  );
}

export function CocoaSprite() {
  return (
    <svg viewBox="0 0 64 60" aria-hidden>
      <g className="xm-steam" stroke={SNOW} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7">
        <path d="M22 16 q-4 -6 0 -10 q4 -4 0 -8" />
        <path d="M32 14 q-4 -6 0 -10 q4 -4 0 -8" />
      </g>
      <path d="M46 28 h4 a9 9 0 0 1 0 18 h-4" fill="none" stroke={SCARLET} strokeWidth="5" />
      <path d="M10 22 h38 v26 a8 8 0 0 1 -8 8 h-22 a8 8 0 0 1 -8 -8 Z" fill={SCARLET} />
      <path d="M10 30 h38 v4 h-38 Z M10 40 h38 v4 h-38 Z" fill={SNOW} opacity="0.9" />
      <ellipse cx="29" cy="22" rx="19" ry="4" fill="#5A3220" />
      <rect x="17" y="17" width="6" height="6" rx="1.5" fill="#FFFDF8" transform="rotate(-12 20 20)" />
      <rect x="27" y="16" width="6" height="6" rx="1.5" fill="#FFFDF8" transform="rotate(14 30 19)" />
      <rect x="35" y="18" width="5" height="5" rx="1.5" fill="#FFFDF8" />
      <path d="M44 22 V4 a5 5 0 0 0 -10 0" fill="none" stroke={SNOW} strokeWidth="4" strokeLinecap="round" />
      <path d="M44 22 V4 a5 5 0 0 0 -10 0" fill="none" stroke={SCARLET} strokeWidth="4" strokeLinecap="round" strokeDasharray="3 3" />
    </svg>
  );
}

function Reindeer({ x, nose }: { x: number; nose?: boolean }) {
  const fur = "#8A5A32";
  return (
    <g transform={`translate(${x} 0)`}>
      <g stroke="#5B3A1E" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M30 14 l-3 -9 M28 9 l-5 -2 M30 14 l4 -8 M33 9 l4 -2" />
      </g>
      <g stroke={fur} strokeWidth="3.5" strokeLinecap="round">
        <path className="xm-leg-a" d="M8 38 l-6 10" />
        <path className="xm-leg-b" d="M12 38 l2 11" />
        <path className="xm-leg-a" d="M24 38 l6 10" />
        <path className="xm-leg-b" d="M20 38 l-2 11" />
      </g>
      <ellipse cx="16" cy="32" rx="14" ry="8" fill={fur} />
      <path d="M26 28 L31 17" stroke={fur} strokeWidth="7" strokeLinecap="round" />
      <ellipse cx="34" cy="17" rx="7" ry="4.5" fill={fur} />
      <circle cx="33" cy="15" r="1" fill="#1A120C" />
      <circle cx="40.5" cy="17.5" r={nose ? 3 : 2} fill={nose ? "#FF2B2B" : "#3A2414"} className={nose ? "xm-nose" : undefined} />
      <path d="M3 30 l-3 -3" stroke={fur} strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

/** Santa in his sleigh behind two reindeer (Rudolph in front), flying left to right. */
export function SleighSprite() {
  return (
    <svg viewBox="0 0 260 70" aria-hidden>
      <path d="M118 40 L150 30 L196 30" stroke="#5B3A1E" strokeWidth="1.2" fill="none" />
      <path d="M72 38 L150 30" stroke="#5B3A1E" strokeWidth="1.2" fill="none" />
      <Reindeer x={150} />
      <Reindeer x={200} nose />
      {/* Sack of presents */}
      <path d="M16 36 q-6 -22 14 -26 q20 2 14 26 Z" fill="#8B5E34" />
      <rect x="20" y="8" width="10" height="10" fill={HOLLY} />
      <rect x="31" y="6" width="9" height="12" fill={GOLD} />
      {/* Santa */}
      <rect x="54" y="22" width="22" height="20" rx="8" fill={SCARLET} />
      <circle cx="66" cy="18" r="7" fill="#F2C9A5" />
      <path d="M58 20 q8 14 16 0 q-2 10 -8 12 q-6 -2 -8 -12 Z" fill="#FFFFFF" />
      <path d="M58 14 q8 -14 18 -4 l6 6" fill={SCARLET} stroke={SCARLET} strokeWidth="1" />
      <rect x="57" y="12" width="18" height="4" rx="2" fill="#FFFFFF" />
      <circle cx="83" cy="17" r="3" fill="#FFFFFF" />
      <path d="M76 30 l10 -4" stroke={SCARLET} strokeWidth="5" strokeLinecap="round" />
      {/* Sleigh */}
      <path d="M8 34 h90 q10 0 12 -12 l4 2 q-2 22 -20 22 h-80 q-8 0 -8 -8 Z" fill={CHRISTMAS_RED} />
      <path d="M12 38 h80" stroke={GOLD} strokeWidth="2" />
      <path d="M14 50 l-2 8 h96 q10 0 12 -8" fill="none" stroke={GOLD} strokeWidth="3" strokeLinecap="round" />
      <path d="M30 46 v12 M86 46 v12" stroke={GOLD} strokeWidth="2.5" />
    </svg>
  );
}

export function StarSprite() {
  return (
    <svg viewBox="0 0 120 40" aria-hidden>
      <defs>
        <linearGradient id="xm-star-tail" x1="0" x2="1">
          <stop offset="0" stopColor={GOLD} stopOpacity="0" />
          <stop offset="1" stopColor="#FFF4C2" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path d="M0 22 L92 17 L92 25 Z" fill="url(#xm-star-tail)" />
      <path d="M100 6 l4 9 l10 1 l-7.5 7 l2.2 10 l-8.7 -5 l-8.7 5 l2.2 -10 l-7.5 -7 l10 -1 Z" fill={GOLD} stroke="#FFF4C2" strokeWidth="1" />
    </svg>
  );
}

export function SnowflakeSprite() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden>
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none">
        {[0, 60, 120].map((angle) => (
          <g key={angle} transform={`rotate(${angle} 20 20)`}>
            <path d="M20 3 V37" />
            <path d="M15 7 l5 4 l5 -4 M15 33 l5 -4 l5 4" />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function BellSprite() {
  return (
    <svg viewBox="0 0 40 44" aria-hidden>
      <path d="M20 6 c-9 0 -12 8 -12 16 c0 6 -3 9 -5 12 h34 c-2 -3 -5 -6 -5 -12 c0 -8 -3 -16 -12 -16 Z" fill={GOLD} />
      <path d="M12 16 q2 -6 6 -7" stroke="#FFF4C2" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="20" cy="38" r="4" fill="#C9962A" />
      <path d="M14 4 q6 6 12 0" stroke={SCARLET} strokeWidth="3" fill="none" />
      <path d="M8 4 l6 0 l-3 5 Z M32 4 l-6 0 l3 5 Z" fill={DEEP_HOLLY} />
    </svg>
  );
}

const ORNAMENT_COLORS = [SCARLET, HOLLY, GOLD, "#2F6FB0", SNOW, CHRISTMAS_RED];
export const ORNAMENT_VARIANT_COUNT = ORNAMENT_COLORS.length;

export function OrnamentSprite({ variant = 0 }: { variant?: number }) {
  const color = ORNAMENT_COLORS[variant % ORNAMENT_COLORS.length];
  return (
    <svg viewBox="0 0 32 38" aria-hidden>
      <rect x="12" y="2" width="8" height="6" rx="1" fill="#C9A23A" />
      <circle cx="16" cy="22" r="14" fill={color} />
      <path d="M4 20 q12 6 24 0" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="2" fill="none" />
      <ellipse cx="11" cy="16" rx="3" ry="5" fill="#FFFFFF" opacity="0.45" transform="rotate(30 11 16)" />
    </svg>
  );
}

export function HollySprite() {
  return (
    <svg viewBox="0 0 48 32" aria-hidden>
      <path d="M24 18 C18 8 8 10 2 6 C6 12 2 16 6 20 C10 18 14 24 24 18 Z" fill={HOLLY} />
      <path d="M24 18 C30 8 40 10 46 6 C42 12 46 16 42 20 C38 18 34 24 24 18 Z" fill={DEEP_HOLLY} />
      <circle cx="20" cy="20" r="4" fill={SCARLET} />
      <circle cx="28" cy="20" r="4" fill={SCARLET} />
      <circle cx="24" cy="25" r="4" fill={CHRISTMAS_RED} />
    </svg>
  );
}

/** A decorated tree; the star on top is its own element (christmas-decor.tsx makes it a button). */
export function TreeSprite() {
  return (
    <svg viewBox="0 0 80 110" aria-hidden>
      <rect x="34" y="92" width="12" height="16" fill="#5B3A1E" />
      <path d="M40 12 L12 52 H26 L6 80 H24 L2 98 H78 L56 80 H74 L54 52 H68 Z" fill={DEEP_HOLLY} />
      <path d="M40 12 L12 52 H26 L6 80 H24 L2 98 H40 Z" fill="#0F7D47" />
      <g fill={SNOW} opacity="0.92">
        <path d="M12 52 q14 -5 28 0 q14 -5 28 0 l-4 -5 q-12 3 -24 -1 q-12 4 -24 1 Z" />
        <path d="M6 80 q17 -5 34 0 q17 -5 34 0 l-5 -5 q-14 3 -29 -1 q-14 4 -29 1 Z" />
        <path d="M2 98 q19 -5 38 0 q19 -5 38 0 l-5 -5 q-16 3 -33 -1 q-16 4 -33 1 Z" />
      </g>
      <path d="M22 40 q18 10 34 2 M16 66 q26 10 50 0 M12 88 q30 8 58 -2" stroke={GOLD} strokeWidth="1.6" fill="none" opacity="0.9" />
      <g className="xm-tree-lights">
        <circle cx="30" cy="44" r="2.6" fill={SCARLET} />
        <circle cx="48" cy="45" r="2.6" fill={GOLD} />
        <circle cx="24" cy="70" r="2.6" fill="#7FB8E8" />
        <circle cx="42" cy="72" r="2.6" fill={SCARLET} />
        <circle cx="58" cy="69" r="2.6" fill={GOLD} />
        <circle cx="18" cy="91" r="2.6" fill={GOLD} />
        <circle cx="38" cy="93" r="2.6" fill="#7FB8E8" />
        <circle cx="62" cy="90" r="2.6" fill={SCARLET} />
      </g>
    </svg>
  );
}

export function TreeStarSprite() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 1 l3.1 6.6 l7.2 0.9 l-5.3 5 l1.4 7.1 l-6.4 -3.6 l-6.4 3.6 l1.4 -7.1 l-5.3 -5 l7.2 -0.9 Z" fill={GOLD} stroke="#FFF4C2" strokeWidth="0.8" />
    </svg>
  );
}
