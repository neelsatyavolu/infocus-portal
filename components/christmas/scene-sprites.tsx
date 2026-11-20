/** The winter scene behind the Portal's content (christmas-decor.tsx): a snowman, a cabin and bows. */

const SCARLET = "#D42B2B";
const SNOW = "#F4F1E8";

export function SnowmanSprite() {
  return (
    <svg viewBox="0 0 70 100" aria-hidden>
      <ellipse cx="35" cy="96" rx="26" ry="4" fill="#000" opacity="0.18" />
      <circle cx="35" cy="74" r="22" fill={SNOW} />
      <circle cx="35" cy="44" r="16" fill={SNOW} />
      <circle cx="35" cy="20" r="12" fill={SNOW} />
      <path d="M12 44 L1 34 M58 44 L69 33" stroke="#5B3A1E" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M22 30 q13 8 26 0 v6 q-13 7 -26 0 Z" fill={SCARLET} />
      <path d="M42 33 l4 16 l6 -2 l-4 -14 Z" fill={SCARLET} />
      <rect x="22" y="2" width="26" height="6" rx="2" fill="#1A1D1A" />
      <rect x="26" y="-8" width="18" height="12" rx="2" fill="#1A1D1A" />
      <rect x="26" y="0" width="18" height="3" fill={SCARLET} />
      <circle cx="30" cy="17" r="1.8" fill="#1A1D1A" />
      <circle cx="40" cy="17" r="1.8" fill="#1A1D1A" />
      <path d="M35 21 l10 3 l-10 1 Z" fill="#F08A24" />
      <circle cx="35" cy="40" r="2" fill="#1A1D1A" />
      <circle cx="35" cy="48" r="2" fill="#1A1D1A" />
      <circle cx="35" cy="68" r="2" fill="#1A1D1A" />
    </svg>
  );
}

export function CabinSprite() {
  return (
    <svg viewBox="0 0 120 96" aria-hidden>
      <g className="xm-smoke" fill="#C9D2DA" opacity="0.5">
        <circle cx="86" cy="10" r="5" />
        <circle cx="92" cy="2" r="4" />
      </g>
      <rect x="80" y="18" width="10" height="20" fill="#5B3A1E" />
      <rect x="14" y="46" width="92" height="46" fill="#6B3F22" />
      <path d="M14 56 h92 M14 66 h92 M14 76 h92 M14 86 h92" stroke="#4E2D17" strokeWidth="1.5" />
      <path d="M4 50 L60 14 L116 50 Z" fill="#7A2230" />
      <path d="M2 50 L60 12 L118 50 L110 52 Q86 40 60 22 Q34 40 10 52 Z" fill={SNOW} />
      <rect x="24" y="60" width="22" height="18" fill="#FFC861" className="xm-window" />
      <path d="M35 60 v18 M24 69 h22" stroke="#6B3F22" strokeWidth="2.5" />
      <rect x="64" y="58" width="18" height="34" fill="#3B2210" />
      <circle cx="78" cy="76" r="1.6" fill="#F2C14E" />
      <circle cx="73" cy="52" r="7" fill="none" stroke="#0A6B3C" strokeWidth="4" />
      <circle cx="73" cy="46" r="1.8" fill={SCARLET} />
      <path d="M6 92 h108 v4 h-108 Z" fill={SNOW} />
    </svg>
  );
}

export function BowSprite() {
  return (
    <svg viewBox="0 0 40 30" aria-hidden>
      <path d="M20 12 L14 28 L19 25 L20 29 Z M20 12 L26 28 L21 25 L20 29 Z" fill="#9E1B26" />
      <path d="M20 12 C10 0 0 4 4 12 C6 18 14 16 20 12 Z" fill={SCARLET} />
      <path d="M20 12 C30 0 40 4 36 12 C34 18 26 16 20 12 Z" fill={SCARLET} />
      <path d="M8 9 q5 -3 10 2 M32 9 q-5 -3 -10 2" stroke="#FF7A7A" strokeWidth="1.2" fill="none" />
      <rect x="16" y="8" width="8" height="8" rx="2.5" fill="#B01E2E" />
    </svg>
  );
}
