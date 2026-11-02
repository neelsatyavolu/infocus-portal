/**
 * The giant turkey's drawings (giant-turkey.tsx): a wild tom in profile, facing left, and the
 * peck holes it leaves. The close-up head is in turkey-close-up.tsx. Groups carry `tgg-` classes
 * that giant-turkey.css moves (legs, tail, head, snood, wattle, beak); the gradients, feather
 * shapes and clip live once in GiantTurkeyDefs (giant-turkey-defs.tsx), and where each feather and
 * bump goes is worked out in turkey-geometry.ts.
 */

import { memo } from "react";
import {
  BEARD,
  BODY_FEATHERS,
  BODY_OUTLINE,
  FAN,
  FAN_COVERTS,
  FOLDED_COVERTS,
  FOLDED_TAIL,
  HEAD_BRISTLES,
  HEAD_BUMPS,
  NECK_BUMPS,
  NECK_CARUNCLES,
  PRIMARIES,
  RUFF_FEATHERS,
  SECONDARIES,
  WING_COVERTS,
  dotsPath,
  flightPath,
  seeded,
  type Feather,
  type Flight
} from "./turkey-geometry";

export { GiantTurkeyDefs } from "./giant-turkey-defs";
export { TurkeyCloseUp } from "./turkey-close-up";

const NECK_D = "M190 200 Q120 170 96 122 Q90 104 80 94 L104 84 Q114 102 124 120 Q146 152 196 172 Z";
const NECK_SKIN = { light: dotsPath(NECK_BUMPS, -0.3, -0.3, 0.7), dark: dotsPath(NECK_BUMPS, 0.4, 0.5) };
const HEAD_SKIN = dotsPath(HEAD_BUMPS);

function Plume({ f }: { f: Feather }) {
  return <use href={`#tgg-f-${f.look}`} transform={`translate(${f.x} ${f.y}) rotate(${f.angle}) scale(${f.scale})`} />;
}

function Upright({ id, x, y, angle, scale }: { id: string; x: number; y: number; angle: number; scale: number }) {
  return <use href={`#${id}`} transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`} />;
}

function Caruncle({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x + r * 0.15} cy={y + r * 0.2} r={r * 1.08} fill="#4E0A14" opacity="0.5" />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.82} fill="url(#tgc-carun-0)" />
      <circle cx={x - r / 3} cy={y - r / 3} r={r / 3.6} fill="#FFD0D6" opacity="0.25" />
    </g>
  );
}

function FlightFeather({ f, width, secondary }: { f: Flight; width: number; secondary?: boolean }) {
  const d = flightPath(f.length, width);
  return (
    <g transform={`translate(${f.x} ${f.y}) rotate(${f.angle})`}>
      <path d={d} fill="url(#tgg-wingbars)" stroke="#0A0705" strokeWidth="0.6" />
      {secondary ? <path d={d} fill="#5A3C22" opacity="0.3" /> : null}
      <path d={d} fill="url(#tgg-flight-shade)" />
      <path d={`M2 0 L${f.length - 3} 0`} stroke="#CBB896" strokeOpacity="0.45" strokeWidth="0.9" />
    </g>
  );
}

function Wing() {
  return (
    <g>
      <ellipse cx="272" cy="230" rx="96" ry="44" transform="rotate(18 272 230)" fill="url(#tgg-wing-shadow)" />
      {PRIMARIES.map((f) => (
        <FlightFeather key={`p${f.x}`} f={f} width={6} />
      ))}
      {SECONDARIES.map((f) => (
        <FlightFeather key={`s${f.x}`} f={f} width={7.5} secondary />
      ))}
      {WING_COVERTS.map((f) => (
        <Plume key={`c${f.x}-${f.y}`} f={f} />
      ))}
    </g>
  );
}

function Tail() {
  return (
    <>
      <g className="tgg-fan">
        {FAN.map(({ angle, scale }) => (
          <Upright key={angle} id="tgg-f-tail" x={322} y={200} angle={angle} scale={scale} />
        ))}
        {FAN_COVERTS.map(({ angle, scale }) => (
          <Upright key={`${angle}-${scale}`} id="tgg-f-covert" x={322} y={200} angle={angle} scale={scale} />
        ))}
      </g>
      <g className="tgg-tail-folded">
        {FOLDED_TAIL.map((angle) => (
          <Upright key={angle} id="tgg-f-tail" x={300} y={205} angle={angle} scale={0.8} />
        ))}
        {FOLDED_COVERTS.map((angle) => (
          <Upright key={angle} id="tgg-f-covert" x={300} y={205} angle={angle} scale={0.62} />
        ))}
      </g>
    </>
  );
}

function Body() {
  return (
    <g className="tgg-body">
      <path d={BODY_OUTLINE} fill="#140E09" />
      <g clipPath="url(#tgg-body-clip)">
        {BODY_FEATHERS.map((f) => (
          <Plume key={`${f.x}-${f.y}`} f={f} />
        ))}
        <rect x="90" y="100" width="290" height="230" fill="url(#tgg-shade-v)" />
        <rect x="90" y="100" width="290" height="230" fill="url(#tgg-shade-h)" />
        <ellipse cx="205" cy="150" rx="95" ry="34" fill="url(#tgg-gloss)" />
      </g>
      <Wing />
      <g fill="none" strokeLinecap="round">
        {BEARD.map((s) => (
          <path key={s.d} d={s.d} stroke={s.light ? "#4A3420" : "#0A0705"} strokeWidth={s.width} />
        ))}
      </g>
    </g>
  );
}

/** A toe along +x from the ankle: scaled skin, knuckles and a dark claw. */
function Toe({ x, y, angle, length, fill }: { x: number; y: number; angle: number; length: number; fill: string }) {
  const L = length;
  const scales = Array.from({ length: Math.floor((L - 4) / 4.5) }, (_, k) => {
    const s = 4 + k * 4.5;
    return `M${s} -3.4 Q${s + 1.3} 0 ${s} 3.4`;
  }).join("");
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d={`M0 -4 Q${L * 0.33} -4.6 ${L * 0.5} -3.6 Q${L * 0.75} -3.8 ${L} -2.4 L${L} 2.4 Q${L * 0.75} 3.6 ${L * 0.5} 3.4 Q${L * 0.33} 4.4 0 4 Z`} fill={fill} />
      <path d={scales} stroke="#5E3A35" strokeWidth="0.7" fill="none" opacity="0.75" />
      <path d={`M${L - 0.5} -2.3 Q${L + 6} -2.2 ${L + 8} 2.8 Q${L + 4} 1.8 ${L - 0.5} 2.3 Z`} fill="url(#tgg-horn)" />
    </g>
  );
}

/** A leg from the hip: feathered thigh, scaled tarsus with its spur, and the foot. */
function Leg({ className, hip, far = false }: { className: string; hip: readonly [number, number]; far?: boolean }) {
  const [x, y] = hip;
  const ankle = y + 92;
  const fill = far ? "url(#tgg-leg-far)" : "url(#tgg-leg)";
  const scutes = Array.from({ length: 10 }, (_, i) => `M${x - 9.6} ${y + 12 + i * 8.2} Q${x - 3} ${y + 15 + i * 8.2} ${x + 3} ${y + 13 + i * 8.2}`).join("");
  const backScales = Array.from({ length: 16 }, (_, i) => `M${x + 3.2 + (i % 2) * 2.2} ${y + 14 + i * 4.8}a1.1 1.1 0 1 0 0.1 0`).join("");
  return (
    <g className={className}>
      <path d={`M${x - 8} ${y} C${x - 9} ${y + 40} ${x - 11} ${y + 70} ${x - 10} ${ankle} L${x + 4} ${ankle} C${x + 5} ${y + 70} ${x + 7} ${y + 40} ${x + 8} ${y} Z`} fill={fill} />
      <path d={scutes} stroke="#5E3A35" strokeWidth="0.9" fill="none" opacity="0.8" />
      <path d={scutes} stroke="#F0CFC4" strokeWidth="0.6" fill="none" opacity="0.4" transform="translate(0 -1.2)" />
      <path d={backScales} stroke="#6E4640" strokeWidth="0.5" fill="none" opacity="0.7" />
      <path d={`M${x + 5} ${y + 60} Q${x + 11} ${y + 59} ${x + 15} ${y + 57} Q${x + 12} ${y + 63} ${x + 5} ${y + 67} Z`} fill="url(#tgg-horn)" />
      <Toe x={x - 1} y={ankle + 1} angle={20} length={14} fill={fill} />
      <Toe x={x - 4} y={ankle + 1} angle={150} length={24} fill={fill} />
      <Toe x={x - 4} y={ankle + 1} angle={172} length={40} fill={fill} />
      <Toe x={x - 4} y={ankle + 1} angle={160} length={33} fill={fill} />
      <ellipse cx={x - 3} cy={ankle} rx="8" ry="5" fill={fill} />
      {[-12, -5, 2, 9].map((dx, i) => (
        <use key={dx} href="#tgg-f-c" transform={`translate(${x + dx} ${y - 8 + (i % 2) * 4}) rotate(${84 - i * 4}) scale(0.55)`} />
      ))}
    </g>
  );
}

function Head() {
  return (
    <g className="tgg-head">
      <path d={NECK_D} fill="url(#tgg-neck)" />
      <path d={NECK_SKIN.dark} fill="#5A1A28" opacity="0.28" />
      <path d={NECK_SKIN.light} fill="#FFE0E6" opacity="0.4" />
      {NECK_CARUNCLES.map((c) => (
        <Caruncle key={`${c.x}-${c.y}`} {...c} />
      ))}
      <ellipse className="tgg-gulp" cx="108" cy="122" rx="9" ry="7" fill="#C45466" />
      {RUFF_FEATHERS.map((f) => (
        <Plume key={`${f.x}-${f.y}`} f={f} />
      ))}
      <ellipse cx="82" cy="82" rx="25" ry="20" transform="rotate(-10 82 82)" fill="url(#tgg-head)" />
      <ellipse cx="88" cy="96" rx="20" ry="10" fill="url(#tgg-cheek)" />
      <path d={HEAD_SKIN} fill="#FFF" opacity="0.25" />
      <path d={HEAD_BRISTLES} stroke="#1E1A16" strokeWidth="0.5" strokeLinecap="round" fill="none" opacity="0.6" />
      <ellipse cx="95" cy="84" rx="2.4" ry="3" fill="#2A2C38" />
      <circle cx="76" cy="76" r="5.4" fill="#5F7FAD" />
      <circle cx="76" cy="76" r="4.8" fill="none" stroke="#3E5A86" strokeWidth="0.6" opacity="0.6" />
      <g className="tgg-eye">
        <circle cx="76" cy="76" r="3.7" fill="url(#tgg-iris)" />
        <circle cx="76" cy="76" r="1.7" fill="#050302" />
        <circle cx="74.9" cy="74.9" r="1" fill="#FFF" opacity="0.9" />
      </g>
      <path d="M61 89 L42 93 Q50 102 62 99 Z" fill="#4A0F18" />
      <path className="tgg-beak-bottom" d="M60 91 Q50 92 43 93 Q50 98 61 97 Z" fill="#A8916A" />
      <path d="M61 79 Q50 78 42 85 Q38 90 40 94 Q48 92 61 92 Z" fill="url(#tgg-beak)" />
      <path d="M59 81 Q50 80 44 85" stroke="#F6EEDC" strokeWidth="1" fill="none" opacity="0.6" />
      <path d="M61 92 Q50 91.5 40 94" stroke="#4A3C2C" strokeWidth="0.8" fill="none" />
      <path d="M50.5 84.4 Q53 83 55.6 84" stroke="#3A2E22" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <g className="tgg-snood">
        <path d="M63 68 Q54 71 48 81 Q41 97 40 116 Q44 122 48 115 Q50 99 57 88 Q61 81 66 76 Z" fill="url(#tgg-red)" />
        <path d="M58 76 Q61 78 63 75 M52 84 Q55 87 58 84 M47 93 Q50 96 53 93 M44 103 Q47 105 50 102 M42 112 Q45 114 47 111" stroke="#7E1420" strokeWidth="0.7" fill="none" opacity="0.6" />
        <path d="M54 76 Q46 90 43 110" stroke="#FFA0AC" strokeWidth="1" fill="none" opacity="0.45" />
      </g>
      <g className="tgg-wattle">
        <path d="M66 92 Q61 104 67 116 Q74 124 80 116 Q84 104 80 94 Z" fill="url(#tgc-carun-0)" />
        <path d="M67 101 Q72 104 78 100 M68 109 Q73 112 79 108" stroke="#7E1420" strokeWidth="0.7" fill="none" opacity="0.55" />
        <circle cx="72" cy="115" r="1.8" fill="#E06070" opacity="0.6" />
      </g>
    </g>
  );
}

/** A wild tom in profile, facing left, standing on y=410 of a 520×420 box. */
export const WildTurkey = memo(function WildTurkey() {
  return (
    <svg viewBox="0 0 520 420" aria-hidden>
      <ellipse cx="236" cy="409" rx="150" ry="9" fill="url(#tgg-ground)" />
      <Tail />
      <Leg className="tgg-leg tgg-leg-far" hip={[238, 300]} far />
      <Body />
      <Leg className="tgg-leg tgg-leg-near" hip={[206, 302]} />
      <Head />
    </svg>
  );
});

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
