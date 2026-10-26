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
