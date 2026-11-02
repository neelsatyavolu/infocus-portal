/**
 * The giant turkey's head up close, for the pecks (giant-turkey.tsx). Facing left, beak tip at
 * (78, 388) of a 600×600 box (the CSS anchors it there). giant-turkey.css moves the `tgc-` groups:
 * the jaw, and the third eyelid that sweeps across the eye as it strikes. Gradients live in
 * GiantTurkeyDefs; bump and bristle placement in turkey-geometry.ts.
 */

import { memo } from "react";
import {
  BEAK_GRAIN,
  CLOSE_BRISTLES,
  CLOSE_CARUNCLES,
  CLOSE_MOTTLE,
  CLOSE_PAPILLAE,
  CLOSE_WRINKLES,
  IRIS_STREAKS,
  SNOOD_BUMPS,
  dotsPath
} from "./turkey-geometry";

const NECK_D = "M292 412 Q326 500 318 600 L600 600 L600 404 Q540 388 468 382 Z";
const HEAD_D = "M180 300 Q190 190 300 160 Q420 140 480 220 Q522 300 472 380 Q420 440 320 430 Q222 420 192 382 Z";
const UPPER_BEAK_D = "M212 316 Q150 308 112 336 Q88 356 78 388 Q100 374 128 372 Q170 368 216 376 Z";
const SNOOD_D = "M240 288 Q192 284 162 322 Q140 360 138 414 Q136 462 146 488 Q156 504 166 490 Q170 470 168 440 Q172 400 186 370 Q204 336 248 316 Z";
const SKIN = {
  shadow: dotsPath(CLOSE_PAPILLAE, 0.6, 0.8),
  light: dotsPath(CLOSE_PAPILLAE, -0.35, -0.35, 0.45)
};
const SNOOD_SKIN = { shadow: dotsPath(SNOOD_BUMPS, 0.6, 0.9), light: dotsPath(SNOOD_BUMPS, -0.4, -0.5, 0.5) };

function Neck() {
  return (
    <g>
      <path d={NECK_D} fill="url(#tgc-neck)" />
      {CLOSE_CARUNCLES.map(({ x, y, rx, ry, rot, tone }) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${rot})`}>
          <ellipse cx="0.8" cy="1.4" rx={rx * 1.04} ry={ry * 1.06} fill="#5A0C18" opacity="0.4" />
          <ellipse rx={rx} ry={ry} fill={`url(#tgc-carun-${tone})`} />
          <ellipse cx={-rx * 0.3} cy={-ry * 0.32} rx={rx * 0.32} ry={ry * 0.22} fill="#FFD0D6" opacity="0.14" />
        </g>
      ))}
      <path d="M300 428 Q380 446 470 384" stroke="#7A1A28" strokeWidth="3" fill="none" opacity="0.5" />
    </g>
  );
}

function Wattle() {
  return (
    <g className="tgc-wattle">
      <path d="M214 398 Q206 456 236 506 Q262 540 300 520 Q330 500 340 446 Q330 420 300 414 Z" fill="url(#tgc-carun-1)" />
      <path d="M222 430 Q250 446 300 438 M230 462 Q260 478 316 466 M240 492 Q270 506 312 494 M220 412 Q240 420 270 418" stroke="#6E0E1C" strokeWidth="2" fill="none" opacity="0.45" strokeLinecap="round" />
      <path d="M224 418 Q216 466 244 506" stroke="#FFA4B0" strokeWidth="3" fill="none" opacity="0.35" strokeLinecap="round" />
    </g>
  );
}

function Skin() {
  return (
    <>
      <path d={HEAD_D} fill="url(#tgc-skin)" />
      <g clipPath="url(#tgc-head-clip)">
        <rect x="170" y="140" width="360" height="300" fill="url(#tgc-red-low)" />
        <ellipse cx="480" cy="360" rx="120" ry="100" fill="url(#tgc-red-rear)" />
        <ellipse cx="300" cy="190" rx="130" ry="64" fill="url(#tgc-crown)" />
        {CLOSE_MOTTLE.map(({ x, y, rx, ry, rot, tone, opacity }) => (
          <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(${rot} ${x} ${y})`} fill={`url(#tgc-mottle-${tone})`} opacity={opacity} />
        ))}
        <path d={CLOSE_WRINKLES} stroke="#3A4E78" strokeWidth="1.3" fill="none" opacity="0.32" strokeLinecap="round" />
        <path d={CLOSE_WRINKLES} stroke="#FFF" strokeWidth="1" fill="none" opacity="0.18" strokeLinecap="round" transform="translate(0 -1.6)" />
        <path d={SKIN.shadow} fill="#2E3D60" opacity="0.12" />
        <path d={SKIN.light} fill="#FFF" opacity="0.24" />
        <path
          d="M236 340 Q300 362 372 346 M248 368 Q318 390 400 370 M290 402 Q350 414 430 394 M394 196 Q424 232 434 282 M440 250 Q466 300 458 350"
          stroke="#5E7AA8"
          strokeWidth="2"
          fill="none"
          opacity="0.45"
          strokeLinecap="round"
        />
        <path d={HEAD_D} fill="none" stroke="#22304E" strokeOpacity="0.35" strokeWidth="22" />
      </g>
    </>
  );
}

function Bristles() {
  return (
    <g stroke="#15110E" strokeLinecap="round" fill="none">
      <ellipse cx="404" cy="304" rx="10" ry="12" fill="#1E2030" stroke="none" />
      <path d={CLOSE_BRISTLES.thick} strokeWidth="1.1" opacity="0.6" />
      <path d={CLOSE_BRISTLES.thin} strokeWidth="0.8" opacity="0.6" />
    </g>
  );
}

function Eye() {
  return (
    <g>
      <ellipse cx="334" cy="266" rx="60" ry="54" fill="url(#tgc-socket)" />
      <circle cx="330" cy="262" r="40" fill="url(#tgc-lidring)" />
      <path d="M288 248 Q330 206 372 248 M292 284 Q330 312 368 284 M284 262 Q286 226 316 214" stroke="#3E5684" strokeWidth="2" fill="none" opacity="0.5" />
      <circle cx="330" cy="262" r="30" fill="#0C0604" />
      <circle cx="330" cy="262" r="28.5" fill="url(#tgc-iris)" />
      <path d={IRIS_STREAKS} stroke="#8A5A30" strokeWidth="1" opacity="0.35" />
      <circle cx="330" cy="262" r="12.5" fill="#020101" />
      <circle cx="330" cy="262" r="28.5" fill="url(#tgc-gloss)" />
      <path d="M311 248 Q318 240 330 240 Q326 249 315 254 Z" fill="#FFF" opacity="0.92" />
      <circle cx="342" cy="275" r="2.6" fill="#FFF" opacity="0.5" />
      <path d="M303 274 Q330 296 357 274" stroke="#E2ECF7" strokeWidth="1.6" fill="none" opacity="0.6" />
      <ellipse className="tgc-lid" cx="330" cy="262" rx="31" ry="31" fill="url(#tgc-membrane)" />
    </g>
  );
}

function Beak() {
  return (
    <>
      <g className="tgc-beak-bottom">
        <path d="M214 372 Q150 372 96 386 Q150 398 214 396 Z" fill="#5E1A26" />
        <path d="M204 380 Q160 381 124 388 Q160 393 204 389 Z" fill="#C25A6A" />
        <path d="M196 382 Q164 383 140 387" stroke="#F0A0AC" strokeWidth="1.5" fill="none" opacity="0.6" />
        <path d="M216 390 Q152 394 98 392 Q148 416 216 406 Z" fill="url(#tgc-lower-beak)" />
        <path d="M216 390 Q152 394 98 392" stroke="#4A3C2C" strokeWidth="2" fill="none" />
      </g>
      <ellipse cx="216" cy="385" rx="9" ry="11" fill="#B85A68" />
      <g className="tgc-beak-top">
        <path d={UPPER_BEAK_D} fill="url(#tgc-beak)" />
        <g clipPath="url(#tgc-beak-clip)">
          <path d={BEAK_GRAIN} stroke="#6E5A40" strokeWidth="1" fill="none" opacity="0.2" />
          <path d={UPPER_BEAK_D} fill="url(#tgc-beak-tip)" />
        </g>
        <path d="M204 322 Q150 318 116 342 Q98 358 88 376" stroke="#F8F0DE" strokeWidth="3" fill="none" opacity="0.6" strokeLinecap="round" />
        <path d="M216 376 Q170 368 128 372 Q100 374 78 388" stroke="#3E3224" strokeWidth="2.4" fill="none" />
        <ellipse cx="176" cy="338" rx="12" ry="5.5" fill="#8E7656" />
        <path d="M167 339.5 Q177 334.5 187 338" stroke="#231A12" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M212 316 Q220 346 216 376" stroke="#C98A94" strokeWidth="5" fill="none" opacity="0.6" strokeLinecap="round" />
      </g>
    </>
  );
}

function Snood() {
  return (
    <g className="tgc-snood">
            <path d={SNOOD_D} fill="url(#tgc-snood)" />
      <path
        d="M200 310 Q210 318 222 311 M190 322 Q200 330 212 323 M180 334 Q192 343 204 335 M172 346 Q184 355 196 347 M165 359 Q177 367 189 359 M160 372 Q172 380 184 372 M156 386 Q167 393 179 386 M152 400 Q163 407 175 400 M149 415 Q160 421 171 415 M147 430 Q158 436 169 430 M146 445 Q156 451 168 445 M146 460 Q155 466 167 460 M147 474 Q155 479 166 474"
        stroke="#6E0E1C"
        strokeWidth="1.6"
        fill="none"
        opacity="0.45"
        strokeLinecap="round"
      />
      <path d="M170 330 Q160 360 156 400 M184 334 Q174 370 172 420" stroke="#8E1A26" strokeWidth="2" fill="none" opacity="0.45" />
      <path d={SNOOD_SKIN.shadow} fill="#5A0814" opacity="0.35" />
      <path d={SNOOD_SKIN.light} fill="#FFC0C8" opacity="0.4" />
      <path d="M152 356 Q142 410 146 470" stroke="#FFA0AC" strokeWidth="3" fill="none" opacity="0.35" strokeLinecap="round" />
      <ellipse cx="158" cy="486" rx="11" ry="9" fill="#F48A98" opacity="0.45" />
    </g>
  );
}

/** The head up close, facing left, beak tip at (78, 388) of a 600×600 box (CLOSE_UP_TIP in the CSS). */
export const TurkeyCloseUp = memo(function TurkeyCloseUp() {
  return (
    <svg viewBox="0 0 600 600" aria-hidden>
      <defs>
        <clipPath id="tgc-head-clip">
          <path d={HEAD_D} />
        </clipPath>
        <clipPath id="tgc-beak-clip">
          <path d={UPPER_BEAK_D} />
        </clipPath>
      </defs>
      <Neck />
      <Wattle />
      <Skin />
      <Bristles />
      <Eye />
      <Beak />
      <Snood />
    </svg>
  );
});
