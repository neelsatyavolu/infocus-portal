import { BODY_OUTLINE } from "./turkey-geometry";

/**
 * The giant turkey's shared gradients, patterns, feather shapes and clip, rendered once in a hidden
 * 0×0 svg next to the drawings (giant-turkey-art.tsx, turkey-close-up.tsx). Only one giant turkey
 * is ever on screen, so the ids are fixed.
 */

/** A body feather along +x from its base: dark down, an iridescent band, then a black tip. */
const FEATHER = {
  outline: "M0 -5 C8 -10.5 20 -11 27 -8.5 Q33 -5 33.5 0 Q33 5 27 8.5 C20 11 8 10.5 0 5 Z",
  sheen: "M9 -10 C15 -11 19 -10.4 23 -9.6 C26 -6.4 27.6 -3.2 27.9 0 C27.6 3.2 26 6.4 23 9.6 C19 10.4 15 11 9 10 C14.5 6 17 3 17.5 0 C17 -3 14.5 -6 9 -10 Z",
  band: "M23 -9.6 C24.5 -9.2 26 -8.8 27 -8.5 Q33 -5 33.5 0 Q33 5 27 8.5 C26 8.8 24.5 9.2 23 9.6 C26 6.4 27.6 3.2 27.9 0 C27.6 -3.2 26 -6.4 23 -9.6 Z",
  barbs: "M12 0 L19 -7 M15 0 L22 -7.5 M18 0 L24.5 -6.5 M12 0 L19 7 M15 0 L22 7.5 M18 0 L24.5 6.5",
  rim: "M28 -7.6 Q32.6 -4.4 33 0 Q32.6 4.4 28 7.6"
};

/** A tail feather pointing up from its base: barred chestnut, a black band, a rusty tip. */
const TAIL = {
  outline: "M-4.5 0 L-11 -118 Q-13.5 -148 0 -163 Q13.5 -148 11 -118 L4.5 0 Z",
  band: "M-11 -119 Q0 -126 11 -119 L11.2 -133 Q0 -141 -11.2 -133 Z",
  tip: "M-11.2 -133 Q0 -141 11.2 -133 Q12.3 -150 0 -163 Q-12.3 -150 -11.2 -133 Z"
};

/** A tail covert: shorter, copper-bronze, with the same black band and rusty tip. */
const COVERT = {
  outline: "M-5 0 L-10.5 -76 Q-12.5 -96 0 -106 Q12.5 -96 10.5 -76 L5 0 Z",
  band: "M-10.6 -78 Q0 -84 10.6 -78 L9.9 -90 Q0 -97 -9.9 -90 Z",
  tip: "M-9.9 -90 Q0 -97 9.9 -90 Q7 -101 0 -106 Q-7 -101 -9.9 -90 Z"
};

type Stop = readonly [offset: number, color: string, opacity?: number];

function Stops({ stops }: { stops: readonly Stop[] }) {
  return stops.map(([offset, color, opacity]) => <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />);
}

function BodyFeather({ id, sheen }: { id: string; sheen: string }) {
  return (
    <g id={id}>
      <path d={FEATHER.outline} fill="#000" opacity="0.45" transform="translate(1.4 1.8)" />
      <path d={FEATHER.outline} fill="url(#tgg-fb-base)" />
      <path d={FEATHER.sheen} fill={`url(#${sheen})`} />
      <path d={FEATHER.barbs} stroke="#000" strokeOpacity="0.28" strokeWidth="0.5" fill="none" />
      <path d={FEATHER.band} fill="#0B0806" />
      <path d={FEATHER.rim} stroke="#E8D2A8" strokeOpacity="0.16" strokeWidth="0.6" fill="none" />
      <path d="M1 0 L27 0" stroke="#000" strokeOpacity="0.35" strokeWidth="0.7" />
    </g>
  );
}

type Upright = { id: string; shape: typeof TAIL; base: string; rachisTo: number; barred: boolean };

function UprightFeather({ id, shape, base, rachisTo, barred }: Upright) {
  return (
    <g id={id}>
      <path d={shape.outline} fill={`url(#${base})`} />
      {barred ? <path d={shape.outline} fill="url(#tgg-tailbars)" /> : null}
      <path d={shape.band} fill="#0D0907" />
      <path d={shape.tip} fill="url(#tgg-tail-tip)" />
      <path d={shape.outline} fill="url(#tgg-cyl)" />
      <path d={`M0 -3 L0 ${rachisTo}`} stroke="#E2CFA8" strokeOpacity="0.4" strokeWidth="1.1" />
    </g>
  );
}

function FeatherGradients() {
  return (
    <>
      <linearGradient id="tgg-fb-base" x1="0" y1="0" x2="1" y2="0">
        <Stops stops={[[0, "#24170D"], [0.55, "#3E2814"], [1, "#4E331A"]]} />
      </linearGradient>
      <linearGradient id="tgg-sheen-c" x1="0.2" y1="0" x2="0.8" y2="1">
        <Stops stops={[[0, "#B98244"], [0.5, "#7A4A24"], [1, "#3A2414"]]} />
      </linearGradient>
      <linearGradient id="tgg-sheen-g" x1="0.2" y1="0" x2="0.8" y2="1">
        <Stops stops={[[0, "#7C8446"], [0.5, "#454E2A"], [1, "#242818"]]} />
      </linearGradient>
      <linearGradient id="tgg-sheen-r" x1="0.2" y1="0" x2="0.8" y2="1">
        <Stops stops={[[0, "#9A5234"], [0.5, "#5E2C24"], [1, "#2E1A18"]]} />
      </linearGradient>
      <linearGradient id="tgg-tail" x1="0" y1="1" x2="0" y2="0">
        <Stops stops={[[0, "#24160C"], [0.35, "#5A321A"], [0.75, "#8A4E26"], [1, "#9C5C2E"]]} />
      </linearGradient>
      <linearGradient id="tgg-covert" x1="0" y1="1" x2="0" y2="0">
        <Stops stops={[[0, "#1A120B"], [0.5, "#5E3A1E"], [0.78, "#B07034"], [1, "#C88A44"]]} />
      </linearGradient>
      <linearGradient id="tgg-tail-tip" x1="0" y1="1" x2="0" y2="0">
        <Stops stops={[[0, "#8E4E24"], [0.5, "#B2703A"], [1, "#D2A068"]]} />
      </linearGradient>
      <linearGradient id="tgg-cyl" x1="0" y1="0" x2="1" y2="0">
        <Stops stops={[[0, "#000", 0.4], [0.45, "#FFF", 0.06], [0.55, "#FFF", 0.06], [1, "#000", 0.4]]} />
      </linearGradient>
      <linearGradient id="tgg-flight-shade" x1="0" y1="0" x2="0" y2="1">
        <Stops stops={[[0, "#000", 0.3], [0.5, "#000", 0], [1, "#000", 0.4]]} />
      </linearGradient>
      <pattern id="tgg-tailbars" width="12" height="5.5" patternUnits="userSpaceOnUse">
        <path d="M0 2 Q3 0.6 6 2 T12 2" stroke="#120A06" strokeWidth="1.1" fill="none" opacity="0.6" />
        <path d="M0 4.4 Q3 3.4 6 4.6 T12 4.2" stroke="#2A160A" strokeWidth="0.6" fill="none" opacity="0.4" />
      </pattern>
      <pattern id="tgg-wingbars" width="10" height="40" patternUnits="userSpaceOnUse" patternTransform="skewX(-20)">
        <rect width="10" height="40" fill="#1E150D" />
        <rect width="2.8" height="40" fill="#D9D0BC" />
        <rect x="2.8" width="1.4" height="40" fill="#6A5038" opacity="0.6" />
        <rect x="6.5" width="1.2" height="40" fill="#3A2A1A" />
      </pattern>
    </>
  );
}

function BodyGradients() {
  return (
    <>
      <radialGradient id="tgg-ground">
        <Stops stops={[[0, "#000", 0.5], [1, "#000", 0]]} />
      </radialGradient>
      <linearGradient id="tgg-shade-v" x1="0" y1="0" x2="0" y2="1">
        <Stops stops={[[0, "#FFE2B0", 0.1], [0.35, "#000", 0], [0.7, "#000", 0.38], [1, "#000", 0.78]]} />
      </linearGradient>
      <linearGradient id="tgg-shade-h" x1="0" y1="0" x2="1" y2="0">
        <Stops stops={[[0, "#000", 0.15], [0.25, "#000", 0], [0.8, "#000", 0], [1, "#000", 0.38]]} />
      </linearGradient>
      <radialGradient id="tgg-gloss">
        <Stops stops={[[0, "#E8B070", 0.24], [1, "#E8B070", 0]]} />
      </radialGradient>
      <radialGradient id="tgg-wing-shadow">
        <Stops stops={[[0, "#000", 0.45], [0.7, "#000", 0.2], [1, "#000", 0]]} />
      </radialGradient>
      <linearGradient id="tgg-leg" x1="0" y1="0" x2="1" y2="0">
        <Stops stops={[[0, "#8E5E57"], [0.45, "#D2A193"], [0.7, "#B98378"], [1, "#6E4640"]]} />
      </linearGradient>
      <linearGradient id="tgg-leg-far" x1="0" y1="0" x2="1" y2="0">
        <Stops stops={[[0, "#5E3C38"], [0.45, "#93695F"], [1, "#4A2E2A"]]} />
      </linearGradient>
      <linearGradient id="tgg-horn" x1="0" y1="0" x2="1" y2="1">
        <Stops stops={[[0, "#6A5248"], [1, "#1E1512"]]} />
      </linearGradient>
    </>
  );
}

function HeadGradients() {
  return (
    <>
      <linearGradient id="tgg-neck" gradientUnits="userSpaceOnUse" x1="170" y1="200" x2="90" y2="88">
        <Stops stops={[[0, "#8E2232"], [0.4, "#BC3E50"], [0.72, "#C97B92"], [1, "#A9C0E0"]]} />
      </linearGradient>
      <radialGradient id="tgg-head" cx="0.45" cy="0.3" r="0.75">
        <Stops stops={[[0, "#F6F8FA"], [0.45, "#C9DAF0"], [0.8, "#94B2DB"], [1, "#7092C4"]]} />
      </radialGradient>
      <radialGradient id="tgg-cheek">
        <Stops stops={[[0, "#C83A4C", 0.85], [1, "#C83A4C", 0]]} />
      </radialGradient>
      <radialGradient id="tgg-iris" cx="0.45" cy="0.4" r="0.6">
        <Stops stops={[[0, "#5A3418"], [0.6, "#2A1608"], [1, "#120904"]]} />
      </radialGradient>
      <linearGradient id="tgg-beak" x1="1" y1="0" x2="0" y2="1">
        <Stops stops={[[0, "#B7A586"], [0.4, "#E9DCC0"], [0.85, "#9C8460"], [1, "#5E4E3A"]]} />
      </linearGradient>
      <radialGradient id="tgg-red" cx="0.4" cy="0.35" r="0.75">
        <Stops stops={[[0, "#EE5A6A"], [0.55, "#C2283A"], [1, "#7E1420"]]} />
      </radialGradient>
      <radialGradient id="tgg-hole" cx="0.5" cy="0.45" r="0.6">
        <Stops stops={[[0, "#000"], [0.8, "#050605"], [1, "#1C1F1C"]]} />
      </radialGradient>
    </>
  );
}

function CloseUpGradients() {
  return (
    <>
      <radialGradient id="tgc-skin" gradientUnits="userSpaceOnUse" cx="320" cy="230" r="230">
        <Stops stops={[[0, "#EEF3F8"], [0.35, "#C4D6EE"], [0.7, "#92B0DA"], [1, "#7392C2"]]} />
      </radialGradient>
      <linearGradient id="tgc-red-low" gradientUnits="userSpaceOnUse" x1="0" y1="440" x2="0" y2="320">
        <Stops stops={[[0, "#C2283A", 0.95], [0.55, "#D2566A", 0.45], [1, "#D2566A", 0]]} />
      </linearGradient>
      <radialGradient id="tgc-red-rear">
        <Stops stops={[[0, "#C2283A", 0.75], [1, "#C2283A", 0]]} />
      </radialGradient>
      <radialGradient id="tgc-crown">
        <Stops stops={[[0, "#FFF", 0.6], [1, "#FFF", 0]]} />
      </radialGradient>
      <linearGradient id="tgc-neck" gradientUnits="userSpaceOnUse" x1="450" y1="600" x2="430" y2="400">
        <Stops stops={[[0, "#9C2030"], [0.6, "#C8485A"], [1, "#D3889C"]]} />
      </linearGradient>
      <radialGradient id="tgc-carun-0" cx="0.42" cy="0.38" r="0.72">
        <Stops stops={[[0, "#D24A5C"], [0.65, "#B02638"], [1, "#82141F"]]} />
      </radialGradient>
      <radialGradient id="tgc-carun-1" cx="0.42" cy="0.38" r="0.72">
        <Stops stops={[[0, "#C43C50"], [0.65, "#A01E30"], [1, "#74101C"]]} />
      </radialGradient>
      <radialGradient id="tgc-carun-2" cx="0.42" cy="0.38" r="0.72">
        <Stops stops={[[0, "#D86476"], [0.65, "#B83A50"], [1, "#861C2C"]]} />
      </radialGradient>
      <radialGradient id="tgc-mottle-0">
        <Stops stops={[[0, "#C42A3E"], [0.6, "#C42A3E", 0.6], [1, "#C42A3E", 0]]} />
      </radialGradient>
      <radialGradient id="tgc-mottle-1">
        <Stops stops={[[0, "#7A5A9E"], [0.6, "#7A5A9E", 0.5], [1, "#7A5A9E", 0]]} />
      </radialGradient>
      <radialGradient id="tgc-socket">
        <Stops stops={[[0.6, "#2A3A5E", 0.35], [1, "#2A3A5E", 0]]} />
      </radialGradient>
      <linearGradient id="tgc-lidring" x1="0" y1="0" x2="0" y2="1">
        <Stops stops={[[0, "#56719C"], [0.5, "#6A86B0"], [1, "#8CA6CC"]]} />
      </linearGradient>
      <radialGradient id="tgc-iris" cx="0.5" cy="0.5" r="0.5">
        <Stops stops={[[0.4, "#6A3E1C"], [0.75, "#3A1E0C"], [0.93, "#1E0E05"], [1, "#0A0503"]]} />
      </radialGradient>
      <radialGradient id="tgc-gloss" cx="0.32" cy="0.28" r="0.7">
        <Stops stops={[[0, "#FFF", 0.22], [0.5, "#FFF", 0.04], [1, "#FFF", 0]]} />
      </radialGradient>
      <radialGradient id="tgc-membrane" cx="0.4" cy="0.4" r="0.7">
        <Stops stops={[[0, "#E6EEF6", 0.85], [1, "#A9BCD6", 0.92]]} />
      </radialGradient>
      <linearGradient id="tgc-beak" x1="0.6" y1="0" x2="0.4" y2="1">
        <Stops stops={[[0, "#C9B796"], [0.35, "#ECE0C6"], [0.75, "#BCA47E"], [1, "#8C7556"]]} />
      </linearGradient>
      <radialGradient id="tgc-beak-tip" gradientUnits="userSpaceOnUse" cx="84" cy="384" r="70">
        <Stops stops={[[0, "#3E3226", 0.75], [1, "#3E3226", 0]]} />
      </radialGradient>
      <linearGradient id="tgc-lower-beak" x1="0" y1="0" x2="0" y2="1">
        <Stops stops={[[0, "#BBA37C"], [1, "#7A6448"]]} />
      </linearGradient>
      <radialGradient id="tgc-snood" cx="0.3" cy="0.4" r="0.8">
        <Stops stops={[[0, "#F06A7A"], [0.5, "#C42A3E"], [1, "#7A1020"]]} />
      </radialGradient>
    </>
  );
}

export function GiantTurkeyDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <FeatherGradients />
        <BodyGradients />
        <HeadGradients />
        <CloseUpGradients />
        <clipPath id="tgg-body-clip">
          <path d={BODY_OUTLINE} />
        </clipPath>
        <BodyFeather id="tgg-f-c" sheen="tgg-sheen-c" />
        <BodyFeather id="tgg-f-g" sheen="tgg-sheen-g" />
        <BodyFeather id="tgg-f-r" sheen="tgg-sheen-r" />
        <UprightFeather id="tgg-f-tail" shape={TAIL} base="tgg-tail" rachisTo={-150} barred />
        <UprightFeather id="tgg-f-covert" shape={COVERT} base="tgg-covert" rachisTo={-96} barred={false} />
      </defs>
    </svg>
  );
}
