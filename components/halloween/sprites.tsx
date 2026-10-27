/** Halloween drawings in the package colors: Pumpkin, Deep Pumpkin, Witch Purple, Ink, Soft White. */

const PUMPKIN = "#FF7A1A";
const DEEP_PUMPKIN = "#B4440A";
const PURPLE = "#9B5CFF";
const INK = "#0F110F";
const SOFT_WHITE = "#ECEFEA";
const CANDLE = "#FFD25A";

/** Three carved faces, picked by `face`. */
const FACES = [
  // Classic: triangle eyes, toothy grin.
  <g key="classic" fill={CANDLE}>
    <path d="M20 28 L26 20 L30 28 Z" />
    <path d="M34 28 L38 20 L44 28 Z" />
    <path d="M17 36 Q32 50 47 36 L43 37 L40 41 L36 38 L32 42 L28 38 L24 41 L21 37 Z" />
  </g>,
  // Surprised: round eyes, round mouth.
  <g key="surprised" fill={CANDLE}>
    <circle cx="24" cy="26" r="4" />
    <circle cx="40" cy="26" r="4" />
    <ellipse cx="32" cy="40" rx="5" ry="6" />
  </g>,
  // Sly: slanted eyes, a crooked smile.
  <g key="sly" fill={CANDLE}>
    <path d="M18 24 L29 27 L20 30 Z" />
    <path d="M46 24 L35 27 L44 30 Z" />
    <path d="M20 37 Q34 46 45 34 Q34 41 20 37 Z" />
  </g>
];

export const PUMPKIN_FACE_COUNT = FACES.length;

export function PumpkinSprite({ face = 0, className }: { face?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M31 14 Q30 6 36 3 L38 6 Q34 8 35 14 Z" fill="#4E7A2E" />
      <ellipse cx="20" cy="36" rx="14" ry="20" fill={DEEP_PUMPKIN} />
      <ellipse cx="44" cy="36" rx="14" ry="20" fill={DEEP_PUMPKIN} />
      <ellipse cx="32" cy="36" rx="16" ry="22" fill={PUMPKIN} />
      <ellipse cx="25" cy="36" rx="9" ry="20" fill={PUMPKIN} opacity="0.85" />
      <ellipse cx="39" cy="36" rx="9" ry="20" fill={PUMPKIN} opacity="0.85" />
      {FACES[face % FACES.length]}
    </svg>
  );
}

export function SplatSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path
        d="M32 18 Q38 8 41 19 Q52 12 47 25 Q60 27 49 35 Q58 45 45 44 Q46 57 36 47 Q30 58 27 46 Q15 54 18 42 Q5 40 16 32 Q6 22 19 23 Q18 10 32 18 Z"
        fill={PUMPKIN}
      />
      <circle cx="10" cy="14" r="3" fill={PUMPKIN} />
      <circle cx="55" cy="12" r="2.5" fill={DEEP_PUMPKIN} />
      <circle cx="56" cy="54" r="3" fill={PUMPKIN} />
      <circle cx="8" cy="52" r="2" fill={DEEP_PUMPKIN} />
      <circle cx="30" cy="31" r="2" fill={CANDLE} />
      <circle cx="37" cy="36" r="1.5" fill={CANDLE} />
    </svg>
  );
}

export function BatSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 32" className={className} aria-hidden>
      <g className="hw-wing-left">
        <path d="M30 14 Q22 4 4 6 Q10 10 9 16 Q15 13 18 19 Q22 14 30 18 Z" fill="#33204D" />
      </g>
      <g className="hw-wing-right">
        <path d="M34 14 Q42 4 60 6 Q54 10 55 16 Q49 13 46 19 Q42 14 34 18 Z" fill="#33204D" />
      </g>
      <ellipse cx="32" cy="16" rx="5" ry="7" fill="#33204D" />
      <path d="M28 10 L29 5 L31 9 Z M36 10 L35 5 L33 9 Z" fill="#33204D" />
      <circle cx="30" cy="13" r="1.1" fill={PURPLE} />
      <circle cx="34" cy="13" r="1.1" fill={PURPLE} />
    </svg>
  );
}

export function GhostSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 72" className={className} aria-hidden>
      <path
        d="M10 34 Q10 6 32 6 Q54 6 54 34 L54 64 Q50 58 46 64 Q42 70 38 64 Q34 58 30 64 Q26 70 22 64 Q18 58 14 64 Q12 66 10 64 Z"
        fill={SOFT_WHITE}
        opacity="0.92"
      />
      <ellipse cx="24" cy="30" rx="4" ry="6" fill={INK} />
      <ellipse cx="40" cy="30" rx="4" ry="6" fill={INK} />
      <ellipse cx="32" cy="44" rx="4" ry="5" fill={INK} />
      <ellipse cx="19" cy="38" rx="3" ry="1.6" fill={PURPLE} opacity="0.45" />
      <ellipse cx="45" cy="38" rx="3" ry="1.6" fill={PURPLE} opacity="0.45" />
    </svg>
  );
}

export function SpiderSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" className={className} aria-hidden>
      <g stroke="#8A8F8B" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M18 18 Q8 10 3 16 M18 21 Q7 18 2 25 M19 24 Q9 27 5 34 M20 26 Q14 32 12 38" />
        <path d="M30 18 Q40 10 45 16 M30 21 Q41 18 46 25 M29 24 Q39 27 43 34 M28 26 Q34 32 36 38" />
      </g>
      <ellipse cx="24" cy="24" rx="8" ry="9" fill="#33204D" stroke="#8A8F8B" strokeWidth="1" />
      <circle cx="24" cy="13" r="5" fill="#33204D" stroke="#8A8F8B" strokeWidth="1" />
      <circle cx="22" cy="12" r="1.3" fill={PURPLE} />
      <circle cx="26" cy="12" r="1.3" fill={PURPLE} />
    </svg>
  );
}

/** Two glowing eyes in the dark, with slit pupils. */
export function EyesSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 40" className={className} aria-hidden>
      {[
        { cx: 30, tilt: 14 },
        { cx: 90, tilt: -14 }
      ].map(({ cx, tilt }) => (
        <g key={cx} transform={`rotate(${tilt} ${cx} 20)`}>
          <path d={`M${cx - 22} 20 Q${cx} 2 ${cx + 22} 20 Q${cx} 38 ${cx - 22} 20 Z`} fill={PURPLE} />
          <ellipse cx={cx} cy="20" rx="3" ry="7.5" fill={INK} />
          <circle cx={cx - 7} cy="16" r="1.8" fill={SOFT_WHITE} opacity="0.8" />
        </g>
      ))}
    </svg>
  );
}

const CAT = "#17121F";
const CLOAK = "#2A1840";
const BONE = "#E4E1D6";

/** A black cat walking right; the two leg pairs swing in turn (hw-legs-a / hw-legs-b). */
export function CatSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 48" className={className} aria-hidden>
      <path className="hw-cat-tail" d="M16 24 Q3 22 4 8 Q5 3 9 5 Q8 17 19 20 Z" fill={CAT} />
      <g className="hw-legs-a" fill={CAT}>
        <rect x="18" y="28" width="5" height="17" rx="2.5" />
        <rect x="44" y="28" width="5" height="17" rx="2.5" />
      </g>
      <g className="hw-legs-b" fill={CAT}>
        <rect x="25" y="28" width="5" height="17" rx="2.5" />
        <rect x="51" y="28" width="5" height="17" rx="2.5" />
      </g>
      <ellipse cx="36" cy="26" rx="21" ry="10" fill={CAT} />
      <circle cx="59" cy="17" r="9" fill={CAT} />
      <path d="M51 12 L52 2 L58 9 Z M61 9 L67 2 L67 12 Z" fill={CAT} />
      <ellipse cx="57" cy="16" rx="1.6" ry="2.3" fill={CANDLE} />
      <ellipse cx="63" cy="16" rx="1.6" ry="2.3" fill={CANDLE} />
    </svg>
  );
}

/** A witch on her broom, flying right, cape flapping. */
export function WitchSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 56" className={className} aria-hidden>
      <path d="M14 42 L84 30" stroke="#6B4A2B" strokeWidth="3" strokeLinecap="round" />
      <path d="M20 40 L3 34 L5 42 L1 50 L21 44 Z" fill="#C9A15A" />
      <path className="hw-cape" d="M40 26 Q27 25 20 33 Q31 32 39 35 Z" fill={PURPLE} />
      <path d="M37 37 Q40 19 51 17 Q60 19 60 35 Z" fill={CLOAK} />
      <path d="M54 33 L64 39 L69 37" stroke={CLOAK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M50 15 Q42 18 38 25" stroke={PUMPKIN} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="54" cy="14" r="5" fill="#7FB069" />
      <path d="M43 11 L66 10" stroke={CLOAK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M47 11 L62 10 L52 1 L47 4 Z" fill={CLOAK} />
    </svg>
  );
}

/** A skeleton hand reaching up out of the floor. */
export function HandSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 80" className={className} aria-hidden>
      <g stroke={BONE} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M15 80 L15 50 M24 80 L24 50" />
        <path d="M9 30 L7 22 M6 18 L5 11" />
        <path d="M16 28 L16 18 M16 14 L16 5" />
        <path d="M24 28 L25 18 M25 14 L26 6" />
        <path d="M31 31 L34 23 M35 19 L36 13" />
        <path d="M8 42 L3 37 M1 33 L0 29" />
      </g>
      <rect x="7" y="29" width="26" height="18" rx="6" fill={BONE} />
      <path d="M13 34 L13 42 M20 34 L20 42 M27 34 L27 42" stroke={INK} strokeWidth="1.4" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

/** Two kinds of candy, picked by `variant`: a wrapped sweet and a candy corn. */
const CANDIES = [
  <svg key="wrapped" viewBox="0 0 48 24" aria-hidden>
    <path d="M14 12 L2 3 L5 12 L2 21 Z M34 12 L46 3 L43 12 L46 21 Z" fill={PURPLE} />
    <ellipse cx="24" cy="12" rx="11" ry="8" fill={PUMPKIN} />
    <path d="M18 5 L22 19 M25 4 L29 19" stroke={CANDLE} strokeWidth="2.4" strokeLinecap="round" />
  </svg>,
  <svg key="corn" viewBox="0 0 32 36" aria-hidden>
    <path d="M16 2 Q20 2 26 20 Q28 33 16 34 Q4 33 6 20 Q12 2 16 2 Z" fill={CANDLE} />
    <path d="M16 2 Q20 2 25.6 21 L6.4 21 Q12 2 16 2 Z" fill={PUMPKIN} />
    <path d="M16 2 Q18.6 2 21 11 L11 11 Q13.4 2 16 2 Z" fill={SOFT_WHITE} />
  </svg>
];

export const CANDY_VARIANT_COUNT = CANDIES.length;

export function CandySprite({ variant = 0 }: { variant?: number }) {
  return CANDIES[variant % CANDIES.length];
}

/** Spokes and sagging threads of a web whose center is the top-left corner (0, 0). */
const COBWEB_PATH = (() => {
  const angles = [0, 18, 36, 54, 72, 90].map((deg) => (deg * Math.PI) / 180);
  const at = (angle: number, r: number) => `${(Math.cos(angle) * r).toFixed(1)} ${(Math.sin(angle) * r).toFixed(1)}`;
  const spokes = angles.map((angle) => `M0 0 L${at(angle, 100)}`);
  const threads = [24, 46, 68, 88].flatMap((r) =>
    angles.slice(1).map((angle, i) => `M${at(angles[i], r)} Q${at((angles[i] + angle) / 2, r * 0.82)} ${at(angle, r)}`)
  );
  return [...spokes, ...threads].join(" ");
})();

export function CobwebSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d={COBWEB_PATH} stroke={SOFT_WHITE} strokeWidth="0.9" fill="none" strokeLinecap="round" />
    </svg>
  );
}
