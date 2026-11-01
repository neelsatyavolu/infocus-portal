/**
 * The giant turkey's drawings (giant-turkey.tsx): a wild tom in profile, facing left, and a
 * close-up of its head for the bites. Groups carry `tgg-` / `tgc-` classes that giant-turkey.css
 * moves (legs, tail, head, snood, wattle, beak). Their gradients live once in GiantTurkeyDefs;
 * only one giant turkey is ever on screen.
 */

const INK = "#0E0906";
const FAN_ANGLES = Array.from({ length: 15 }, (_, i) => -70 + i * 10);
const NECK_CARUNCLES: readonly (readonly [number, number, number])[] = [
  [86, 104, 5],
  [92, 114, 6],
  [97, 126, 7.5],
  [104, 139, 8],
  [112, 151, 7],
  [121, 160, 6.5]
];
const BEARD = [0, 1, 2, 3, 4, 5, 6, 7];

/** The shared gradients and patterns, rendered once in a hidden 0×0 svg next to the drawings. */
export function GiantTurkeyDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <radialGradient id="tgg-body" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#7A5530" />
          <stop offset="0.35" stopColor="#4E3520" />
          <stop offset="0.62" stopColor="#2F3A24" />
          <stop offset="1" stopColor="#170F09" />
        </radialGradient>
        <pattern id="tgg-scales" width="14" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 10 Q7 1 14 10" fill="none" stroke={INK} strokeWidth="2.6" />
          <path d="M0 8.6 Q7 0.4 14 8.6" fill="none" stroke="#C8904E" strokeWidth="0.9" opacity="0.75" />
          <path d="M-7 5 Q0 -4 7 5 M7 5 Q14 -4 21 5" fill="none" stroke={INK} strokeWidth="2.6" />
          <path d="M-7 3.6 Q0 -4.6 7 3.6 M7 3.6 Q14 -4.6 21 3.6" fill="none" stroke="#9FB06A" strokeWidth="0.7" opacity="0.45" />
        </pattern>
        <pattern id="tgg-bars" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-62)">
          <rect width="9" height="9" fill="#17110C" />
          <rect width="9" height="3.6" fill="#E9E4D6" />
        </pattern>
        <linearGradient id="tgg-tail" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#3A2414" />
          <stop offset="0.7" stopColor="#7A4A26" />
          <stop offset="1" stopColor="#8E5A30" />
        </linearGradient>
        <pattern id="tgg-tailbars" width="8" height="7" patternUnits="userSpaceOnUse">
          <path d="M0 1 Q4 3 8 1" stroke={INK} strokeWidth="1.3" fill="none" opacity="0.7" />
        </pattern>
        <linearGradient id="tgg-skin" x1="0" y1="1" x2="0.3" y2="0">
          <stop offset="0" stopColor="#B83E4E" />
          <stop offset="0.55" stopColor="#C77A8F" />
          <stop offset="1" stopColor="#9DB9DC" />
        </linearGradient>
        <radialGradient id="tgg-head" cx="0.45" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#F1F5FA" />
          <stop offset="0.6" stopColor="#B9D0EC" />
          <stop offset="1" stopColor="#7E9FCB" />
        </radialGradient>
        <linearGradient id="tgg-beak" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E6D7B4" />
          <stop offset="1" stopColor="#8F7A57" />
        </linearGradient>
        <radialGradient id="tgg-red" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#EE5A6A" />
          <stop offset="0.55" stopColor="#C2283A" />
          <stop offset="1" stopColor="#7E1420" />
        </radialGradient>
        <linearGradient id="tgg-leg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#B9837A" />
          <stop offset="0.5" stopColor="#DDB0A4" />
          <stop offset="1" stopColor="#8E6159" />
        </linearGradient>
        <radialGradient id="tgg-hole" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.8" stopColor="#050605" />
          <stop offset="1" stopColor="#1C1F1C" />
        </radialGradient>
      </defs>
    </svg>
  );
}

function Leg({ className, hip }: { className: string; hip: readonly [number, number] }) {
  const [x, y] = hip;
  const ankle = y + 92;
  return (
    <g className={className}>
      <path d={`M${x - 9} ${y} L${x - 11} ${ankle} L${x + 4} ${ankle} L${x + 8} ${y} Z`} fill="url(#tgg-leg)" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path
          key={i}
          d={`M${x - 10} ${y + 22 + i * 10} Q${x - 3} ${y + 25 + i * 10} ${x + 6} ${y + 22 + i * 10}`}
          stroke="#7E5650"
          strokeWidth="1"
          fill="none"
        />
      ))}
      <path d={`M${x + 5} ${y + 62} L${x + 17} ${y + 58}`} stroke="#6E4A44" strokeWidth="3.5" strokeLinecap="round" />
      <g stroke="url(#tgg-leg)" strokeWidth="7" strokeLinecap="round" fill="none">
        <path d={`M${x - 4} ${ankle} Q${x - 24} ${ankle + 2} ${x - 42} ${ankle + 7}`} />
        <path d={`M${x - 4} ${ankle} Q${x - 19} ${ankle + 8} ${x - 31} ${ankle + 15}`} />
        <path d={`M${x - 4} ${ankle} Q${x - 7} ${ankle + 10} ${x - 13} ${ankle + 17}`} />
        <path d={`M${x - 4} ${ankle} L${x + 17} ${ankle + 5}`} />
      </g>
    </g>
  );
}

function TailFeather({ angle }: { angle: number }) {
  return (
    <g transform={`rotate(${angle} 322 200)`}>
      <path d="M315 200 L308 52 Q322 32 336 52 L329 200 Z" fill="url(#tgg-tail)" />
      <path d="M315 200 L308 52 Q322 32 336 52 L329 200 Z" fill="url(#tgg-tailbars)" />
      <path d="M308 64 Q322 46 336 64 L336 76 Q322 58 308 76 Z" fill={INK} />
      <path d="M308 52 Q322 32 336 52 L336 64 Q322 46 308 64 Z" fill="#D9B37A" />
    </g>
  );
}

/** A wild tom in profile, facing left, standing on y=410 of a 520×420 box. */
export function WildTurkey() {
  return (
    <svg viewBox="0 0 520 420" aria-hidden>
      <g className="tgg-fan">
        {FAN_ANGLES.map((angle) => (
          <TailFeather key={angle} angle={angle} />
        ))}
      </g>
      <g className="tgg-tail-folded">
        <path d="M296 196 Q372 214 410 300 Q400 316 388 314 Q352 256 298 246 Z" fill="url(#tgg-tail)" />
        <path d="M296 196 Q372 214 410 300 Q400 316 388 314 Q352 256 298 246 Z" fill="url(#tgg-tailbars)" />
        <path d="M398 290 Q406 300 410 300 Q400 316 388 314 Q392 300 398 290 Z" fill="#D9B37A" />
        <path d="M390 278 Q398 290 398 290 Q392 300 388 314 L380 304 Q386 290 390 278 Z" fill={INK} />
      </g>
      <Leg className="tgg-leg tgg-leg-far" hip={[238, 300]} />
      <g className="tgg-body">
        <ellipse cx="225" cy="214" rx="126" ry="98" transform="rotate(-8 225 214)" fill="url(#tgg-body)" />
        <ellipse cx="225" cy="214" rx="126" ry="98" transform="rotate(-8 225 214)" fill="url(#tgg-scales)" opacity="0.85" />
        <ellipse cx="150" cy="214" rx="38" ry="58" fill="#C8904E" opacity="0.14" />
        <ellipse cx="228" cy="288" rx="44" ry="30" fill="#24180F" />
        <ellipse cx="228" cy="288" rx="44" ry="30" fill="url(#tgg-scales)" opacity="0.7" />
        <path d="M150 168 Q232 136 322 178 Q348 206 332 246 Q300 264 240 260 Q184 252 160 220 Q146 194 150 168 Z" fill="#3E2C1B" />
        <path
          d="M150 168 Q232 136 322 178 Q348 206 332 246 Q300 264 240 260 Q184 252 160 220 Q146 194 150 168 Z"
          fill="url(#tgg-scales)"
          opacity="0.9"
        />
        <path d="M206 236 Q276 262 342 236 L348 252 Q284 286 210 256 Z" fill="url(#tgg-bars)" />
        <path d="M248 218 Q300 230 338 218 L342 234 Q296 250 252 236 Z" fill="url(#tgg-bars)" opacity="0.85" />
        <path d="M120 198 Q113 240 106 292 Q102 298 98 292 Q103 240 112 198 Z" fill={INK} />
        <g stroke={INK} strokeLinecap="round" fill="none">
          {BEARD.map((i) => (
            <path key={i} d={`M${112 + i * 1.2} 202 Q${108 + i} ${248 + i * 2} ${98 + i * 1.6} ${296 - (i % 3) * 5}`} strokeWidth={i % 2 ? 1.6 : 2.4} />
          ))}
        </g>
      </g>
      <Leg className="tgg-leg tgg-leg-near" hip={[206, 302]} />
      <g className="tgg-head">
        <path d="M190 200 Q120 170 96 122 Q90 104 80 94 L104 84 Q114 102 124 120 Q146 152 196 172 Z" fill="url(#tgg-skin)" />
        {NECK_CARUNCLES.map(([cx, cy, r]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r={r} fill="url(#tgg-red)" />
            <circle cx={cx - r / 3} cy={cy - r / 3} r={r / 3.5} fill="#F7A0AA" opacity="0.7" />
          </g>
        ))}
        <ellipse className="tgg-gulp" cx="108" cy="122" rx="9" ry="7" fill="#C45466" />
        <path d="M122 142 Q150 128 204 148 Q214 184 182 210 Q140 204 118 176 Q114 156 122 142 Z" fill="#2A1C11" />
        <path d="M122 142 Q150 128 204 148 Q214 184 182 210 Q140 204 118 176 Q114 156 122 142 Z" fill="url(#tgg-scales)" opacity="0.85" />
        <ellipse cx="82" cy="82" rx="26" ry="21" transform="rotate(-10 82 82)" fill="url(#tgg-head)" />
        <path d="M80 62 L78 56 M86 62 L86 55 M92 64 L94 58 M98 68 L102 63 M74 64 L70 59" stroke="#2A2420" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
        <path d="M70 86 Q78 90 90 86 M74 94 Q84 97 94 92" stroke="#7E9FCB" strokeWidth="1" fill="none" opacity="0.6" />
        <circle cx="76" cy="76" r="6.5" fill="#6F8DB6" />
        <circle className="tgg-eye" cx="76" cy="76" r="5" fill="#2A1608" />
        <circle cx="74.6" cy="74.4" r="1.7" fill="#fff" />
        <path className="tgg-beak-bottom" d="M60 91 Q50 92 43 93 Q50 98 61 97 Z" fill="#AF9A72" />
        <path className="tgg-beak-top" d="M61 79 Q50 78 42 85 Q38 90 40 94 Q48 92 61 92 Z" fill="url(#tgg-beak)" />
        <ellipse cx="53" cy="84" rx="2.2" ry="1.2" fill="#5C4B33" />
        <path className="tgg-snood" d="M63 68 Q54 71 48 81 Q41 97 40 116 Q44 122 48 115 Q50 99 57 88 Q61 81 66 76 Z" fill="url(#tgg-red)" />
        <path className="tgg-wattle" d="M66 92 Q59 108 69 126 Q78 133 82 120 Q86 104 80 94 Z" fill="url(#tgg-red)" />
      </g>
    </svg>
  );
}

const CLOSE_CARUNCLES: readonly (readonly [number, number, number])[] = [
  [392, 440, 20],
  [428, 470, 24],
  [470, 452, 18],
  [410, 508, 22],
  [458, 520, 26],
  [508, 494, 20],
  [372, 486, 16],
  [440, 566, 22],
  [500, 560, 18],
  [540, 530, 16]
];
const BRISTLES = Array.from({ length: 18 }, (_, i) => i);

/** The head up close, facing left, beak tip at (78, 388) of a 600×600 box (CLOSE_UP_TIP in the CSS). */
export function TurkeyCloseUp() {
  return (
    <svg viewBox="0 0 600 600" aria-hidden>
      <path d="M318 600 Q330 470 372 418 L560 376 Q610 480 600 600 Z" fill="url(#tgg-skin)" />
      {CLOSE_CARUNCLES.map(([cx, cy, r]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={r} fill="url(#tgg-red)" />
          <circle cx={cx - r / 3} cy={cy - r / 3} r={r / 3.2} fill="#F7A0AA" opacity="0.65" />
        </g>
      ))}
      <path className="tgc-wattle" d="M232 398 Q214 462 250 522 Q276 544 292 506 Q302 450 282 404 Z" fill="url(#tgg-red)" />
      <path d="M180 300 Q190 190 300 160 Q420 140 480 220 Q522 300 472 380 Q420 440 320 430 Q222 420 192 382 Z" fill="url(#tgg-head)" />
      <path
        d="M250 330 Q300 350 360 336 M262 360 Q320 380 390 362 M300 400 Q350 410 420 392 M392 200 Q420 230 430 280"
        stroke="#7E9FCB"
        strokeWidth="2"
        fill="none"
        opacity="0.55"
        strokeLinecap="round"
      />
      <g stroke="#1E1A16" strokeWidth="2" strokeLinecap="round" opacity="0.75">
        {BRISTLES.map((i) => {
          const x = 250 + i * 12;
          const y = 186 - Math.sin((i / 17) * Math.PI) * 26;
          return <path key={i} d={`M${x} ${y + 14} L${x + 3} ${y - 4}`} />;
        })}
      </g>
      <circle cx="330" cy="262" r="38" fill="#6A86B0" />
      <circle cx="330" cy="262" r="28" fill="#2B160A" />
      <circle cx="330" cy="262" r="13" fill="#050302" />
      <circle cx="319" cy="251" r="7" fill="#fff" opacity="0.92" />
      <circle cx="340" cy="274" r="3" fill="#fff" opacity="0.5" />
      <path className="tgc-lid" d="M290 250 Q330 214 370 250 Q330 232 290 250 Z" fill="#7E9FCB" />
      <g className="tgc-beak-bottom">
        <path d="M214 372 Q150 372 96 386 Q150 398 214 396 Z" fill="#6E2430" />
        <path d="M204 380 Q160 381 124 388 Q160 392 204 388 Z" fill="#C25A6A" />
        <path d="M216 390 Q152 394 98 392 Q148 416 216 406 Z" fill="#A8916A" />
      </g>
      <path className="tgc-beak-top" d="M212 316 Q150 308 112 336 Q88 356 78 388 Q100 374 128 372 Q170 368 216 376 Z" fill="url(#tgg-beak)" />
      <path d="M204 322 Q150 318 116 342 Q98 358 88 376" stroke="#F3E8CE" strokeWidth="3" fill="none" opacity="0.6" />
      <ellipse cx="176" cy="338" rx="9" ry="4" fill="#5C4B33" />
      <path
        className="tgc-snood"
        d="M232 292 Q190 290 160 324 Q138 362 136 418 Q134 470 148 494 Q166 502 170 472 Q172 420 186 380 Q202 338 244 314 Z"
        fill="url(#tgg-red)"
      />
      <path d="M170 330 Q160 360 156 400 M184 334 Q174 370 172 420" stroke="#8E1A26" strokeWidth="2" fill="none" opacity="0.5" />
    </svg>
  );
}

/** Seeded random numbers, so a bite keeps its shape across renders. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A peck hole in the screen: a ragged hole with cracks running out from it. */
export function PeckHole({ seed }: { seed: number }) {
  const random = seeded(seed);
  const points = Array.from({ length: 30 }, (_, i) => {
    const angle = (i / 30) * Math.PI * 2;
    const r = (i % 2 ? 33 : 40) + random() * 9;
    return `${(50 + Math.cos(angle) * r).toFixed(1)},${(50 + Math.sin(angle) * r * 0.86).toFixed(1)}`;
  }).join(" ");
  const cracks = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2 + random() * 0.8;
    return [44, 60 + random() * 14, 78 + random() * 22]
      .map((r, j) => {
        const bend = j === 0 ? 0 : (random() - 0.5) * 0.35;
        return `${(50 + Math.cos(angle + bend) * r).toFixed(1)},${(50 + Math.sin(angle + bend) * r).toFixed(1)}`;
      })
      .join(" ");
  });
  return (
    <svg viewBox="-30 -30 160 160" aria-hidden>
      <g stroke="#ECEFEA" strokeWidth="1.1" fill="none" opacity="0.55" strokeLinejoin="round">
        {cracks.map((crack) => (
          <polyline key={crack} points={crack} />
        ))}
      </g>
      <polygon points={points} fill="url(#tgg-hole)" stroke="#ECEFEA" strokeOpacity="0.4" strokeWidth="1.6" />
      <polygon points={points} fill="none" stroke="#000" strokeOpacity="0.8" strokeWidth="5" transform="translate(5 5) scale(0.9)" />
    </svg>
  );
}
