/** Thanksgiving drawings in the harvest colors: Harvest Gold, Maple, Cranberry, Bark, Ink, Soft White. */

const GOLD = "#F2A93B";
const GOLD_DEEP = "#DB8F22";
const MAPLE = "#A4471C";
const CRANBERRY = "#C23A52";
const BARK = "#6B3E1F";
const BARK_LIGHT = "#8A5428";
const BARK_DARK = "#4E2C15";
const INK = "#0F110F";
const SOFT_WHITE = "#ECEFEA";

const FEATHER_COLORS = [CRANBERRY, MAPLE, GOLD, BARK_LIGHT];
const FEATHER_ANGLES = Array.from({ length: 11 }, (_, i) => -75 + i * 15);

/**
 * A turkey facing you, tail fanned. The beak halves, the mouth and the eyes carry classes so the
 * giant turkey (thanksgiving.css) can blink, stare and open wide; the small one just struts.
 */
export function TurkeySprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <g className="tg-tail">
        {FEATHER_ANGLES.map((angle, i) => (
          <g key={angle} transform={`rotate(${angle} 100 128)`}>
            <ellipse cx="100" cy="52" rx="15" ry="50" fill={FEATHER_COLORS[i % FEATHER_COLORS.length]} />
            <ellipse cx="100" cy="22" rx="10" ry="16" fill={FEATHER_COLORS[(i + 2) % FEATHER_COLORS.length]} />
          </g>
        ))}
      </g>
      <ellipse cx="62" cy="140" rx="17" ry="31" fill={BARK_DARK} transform="rotate(16 62 140)" />
      <ellipse cx="138" cy="140" rx="17" ry="31" fill={BARK_DARK} transform="rotate(-16 138 140)" />
      <ellipse cx="100" cy="136" rx="44" ry="48" fill={BARK} />
      <ellipse cx="100" cy="148" rx="27" ry="31" fill={BARK_LIGHT} />
      <g stroke={GOLD_DEEP} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M86 180 L86 194 M86 194 L78 198 M86 194 L86 199 M86 194 L94 198" />
        <path d="M114 180 L114 194 M114 194 L106 198 M114 194 L114 199 M114 194 L122 198" />
      </g>
      <circle cx="100" cy="88" r="26" fill={BARK_LIGHT} />
      <g className="tg-eyes">
        <circle className="tg-eye" cx="89" cy="81" r="9" fill={SOFT_WHITE} />
        <circle className="tg-eye" cx="111" cy="81" r="9" fill={SOFT_WHITE} />
        <circle className="tg-pupil" cx="89" cy="82" r="4.5" fill={INK} />
        <circle className="tg-pupil" cx="111" cy="82" r="4.5" fill={INK} />
      </g>
      <ellipse className="tg-mouth" cx="100" cy="99" rx="9" ry="9" fill={INK} />
      <path className="tg-beak-bottom" d="M93 97 L107 97 L100 109 Z" fill={GOLD_DEEP} />
      <path className="tg-beak-top" d="M91 91 L109 91 L100 104 Z" fill={GOLD} />
      <path className="tg-wattle" d="M104 97 Q115 108 108 124 Q101 116 103 103 Z" fill={CRANBERRY} />
    </svg>
  );
}

/** A maple leaf; `variant` picks its color. */
const LEAF_COLORS = [GOLD, MAPLE, CRANBERRY, "#D9682B", "#B8862E"];
export const LEAF_VARIANT_COUNT = LEAF_COLORS.length;

export function LeafSprite({ variant = 0, className }: { variant?: number; className?: string }) {
  const color = LEAF_COLORS[variant % LEAF_COLORS.length];
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path
        d="M32 4 L36 16 L44 11 L42 24 L54 20 L50 30 L60 34 L48 40 L52 48 L38 44 L34 54 L32 56 L30 54 L26 44 L12 48 L16 40 L4 34 L14 30 L10 20 L22 24 L20 11 L28 16 Z"
        fill={color}
      />
      <path d="M32 14 L32 62 M32 34 L20 26 M32 34 L44 26 M32 42 L22 40 M32 42 L42 40" stroke={BARK_DARK} strokeWidth="1.6" opacity="0.55" fill="none" />
    </svg>
  );
}

/** A pumpkin pie with a dollop of cream. */
export function PieSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden>
      <path d="M5 25 L59 25 L53 40 L11 40 Z" fill="#8A8F8B" />
      <path d="M5 25 L59 25 L57 29 L7 29 Z" fill="#B7BCB8" />
      <ellipse cx="32" cy="24" rx="28" ry="10" fill="#E3A857" />
      <ellipse cx="32" cy="23" rx="22" ry="7" fill="#C2662A" />
      <path d="M32 23 L54 23" stroke="#9A4A10" strokeWidth="1" opacity="0.6" />
      <circle cx="29" cy="20" r="4" fill={SOFT_WHITE} />
      <circle cx="35" cy="20" r="4" fill={SOFT_WHITE} />
      <circle cx="32" cy="16.5" r="3.5" fill={SOFT_WHITE} />
    </svg>
  );
}
