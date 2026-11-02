/**
 * Fixed geometry for the giant turkey's drawings (giant-turkey-art.tsx, turkey-close-up.tsx):
 * where each feather, bump and bristle goes. Seeded and worked out once when the module loads,
 * so every visit draws the same bird.
 */

export type Look = "c" | "g" | "r";
export type Feather = { x: number; y: number; angle: number; scale: number; look: Look };
export type Flight = { x: number; y: number; angle: number; length: number };
export type Dot = { x: number; y: number; r: number };
type Ellipse = { cx: number; cy: number; rx: number; ry: number; rot: number };
type Point = readonly [number, number];

/** Seeded random numbers in [0, 1). */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RAD = Math.PI / 180;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 0 at the centre of the ellipse, 1 on its edge. */
function ellipseDistance(x: number, y: number, e: Ellipse) {
  const a = -e.rot * RAD;
  const dx = x - e.cx;
  const dy = y - e.cy;
  const u = dx * Math.cos(a) - dy * Math.sin(a);
  const v = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.hypot(u / e.rx, v / e.ry);
}

function pickLook(random: () => number, copper: number, green: number): Look {
  const n = random();
  return n < copper ? "c" : n < copper + green ? "g" : "r";
}

/** Many small circles as one path, so a skin texture costs one element. */
export function dotsPath(dots: readonly Dot[], dx = 0, dy = 0, scale = 1) {
  return dots
    .map(({ x, y, r }) => {
      const rr = r2(r * scale);
      return `M${r1(x + dx - rr)} ${r1(y + dy)}a${rr} ${rr} 0 1 0 ${r2(rr * 2)} 0a${rr} ${rr} 0 1 0 ${r2(-rr * 2)} 0`;
    })
    .join("");
}

/** A long flight feather along +x from its base: `width` is its half-width. */
export function flightPath(length: number, width: number) {
  const L = length;
  const w = width;
  return `M0 ${r1(-w * 0.7)} C${r1(L * 0.4)} ${r1(-w)} ${r1(L * 0.85)} ${r1(-w * 1.05)} ${r1(L - 2)} ${r1(-w * 0.6)} Q${r1(L + 1.5)} 0 ${r1(L - 2)} ${r1(w * 0.6)} C${r1(L * 0.85)} ${r1(w * 1.05)} ${r1(L * 0.4)} ${r1(w)} 0 ${r1(w * 0.7)} Z`;
}

// ---------------------------------------------------------------- the whole bird (520×420)

/** The body: an egg tilted forward. Its outline is scalloped like the feather tips along it. */
const BODY: Ellipse = { cx: 228, cy: 214, rx: 130, ry: 97, rot: -8 };
const WING: Ellipse = { cx: 292, cy: 226, rx: 74, ry: 32, rot: 16 };

export const BODY_OUTLINE = (() => {
  const n = 96;
  const random = seeded(3);
  const a = BODY.rot * RAD;
  const points = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const k = i % 2 ? 1.035 : 0.97 - random() * 0.02;
    const x0 = Math.cos(t) * BODY.rx * k;
    const y0 = Math.sin(t) * BODY.ry * k;
    return `${r1(BODY.cx + x0 * Math.cos(a) - y0 * Math.sin(a))} ${r1(BODY.cy + x0 * Math.sin(a) + y0 * Math.cos(a))}`;
  });
  const curves = Array.from({ length: n / 2 }, (_, j) => `Q${points[2 * j + 1]} ${points[(2 * j + 2) % n]}`);
  return `M${points[0]} ${curves.join(" ")} Z`;
})();

/**
 * Body feathers, laid like shingles: each points back along the body, and the ones nearer the
 * head are drawn later so their tips cover the bases behind them. Breast feathers turn down.
 */
export const BODY_FEATHERS: readonly Feather[] = (() => {
  const random = seeded(7);
  const cells = Array.from({ length: 23 * 27 }, (_, i) => [Math.floor(i / 27), i % 27] as const);
  return cells
    .map(([row, col]) => {
      const x = 90 + col * 10.5 + (row % 2 ? 5.25 : 0) + (random() - 0.5) * 4;
      const y = 112 + row * 9 + (random() - 0.5) * 4;
      const breast = Math.max(0, 170 - x) / 70;
      const angle = Math.min(78, 12 + (y - 200) * 0.14 + breast * 50 + (random() - 0.5) * 12);
      const scale = (0.66 + random() * 0.2) * (1 - breast * 0.18);
      const look = breast > 0.3 ? pickLook(random, 0.6, 0.1) : y < 175 ? pickLook(random, 0.72, 0.18) : pickLook(random, 0.62, 0.26);
      const midX = x + Math.cos(angle * RAD) * 16 * scale;
      const midY = y + Math.sin(angle * RAD) * 16 * scale;
      const shown = ellipseDistance(midX, midY, BODY) <= 0.98 && ellipseDistance(x, y, WING) >= 0.8;
      return shown ? { x: r1(x), y: r1(y), angle: r1(angle), scale: r2(scale), look } : null;
    })
    .filter((f): f is Feather => f !== null)
    .sort((a, b) => b.x + b.y * 0.4 - (a.x + a.y * 0.4));
})();

function featherLine(count: number, from: Point, to: Point, angles: Point, lengths: Point): Flight[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return {
      x: r1(lerp(from[0], to[0], t)),
      y: r1(lerp(from[1], to[1], t)),
      angle: r1(lerp(angles[0], angles[1], t)),
      length: r1(lerp(lengths[0], lengths[1], t))
    };
  });
}

/** The folded wing: barred primaries tucked lowest, white-barred secondaries, then bronze coverts. */
export const PRIMARIES = featherLine(7, [238, 212], [258, 226], [17, 25], [110, 96]);
export const SECONDARIES = featherLine(10, [200, 200], [276, 196], [34, 13], [70, 72]);

const COVERT_ROWS: readonly { from: Point; to: Point; angles: Point; scale: number; count: number }[] = [
  { from: [190, 186], to: [286, 182], angles: [30, 12], scale: 1.5, count: 11 },
  { from: [184, 176], to: [270, 168], angles: [32, 14], scale: 1.2, count: 10 },
  { from: [180, 167], to: [252, 156], angles: [34, 16], scale: 1.0, count: 9 },
  { from: [178, 160], to: [226, 148], angles: [36, 18], scale: 0.85, count: 7 }
];

export const WING_COVERTS: readonly Feather[] = (() => {
  const random = seeded(29);
  return COVERT_ROWS.flatMap((row) =>
    featherLine(row.count, row.from, row.to, row.angles, [0, 0])
      .map((f) => ({
        x: r1(f.x + (random() - 0.5) * 3),
        y: r1(f.y + (random() - 0.5) * 3),
        angle: r1(f.angle + (random() - 0.5) * 6),
        scale: r2(row.scale * (0.92 + random() * 0.16)),
        look: pickLook(random, 0.75, 0.15)
      }))
      .reverse()
  );
})();

const outsideIn = (a: number, b: number) => Math.abs(b) - Math.abs(a);

/** The strutting fan: 17 tail feathers, outermost first so the middle sits on top. */
export const FAN = Array.from({ length: 17 }, (_, i) => -80 + i * 10)
  .sort(outsideIn)
  .map((angle) => ({ angle, scale: r2(1 - (Math.abs(angle) / 80) * 0.07) }));
/** Two rows of shorter tail coverts in front of the fan, set between the tail feathers. */
export const FAN_COVERTS = [
  ...Array.from({ length: 16 }, (_, i) => -75 + i * 10)
    .sort(outsideIn)
    .map((angle) => ({ angle, scale: r2(1 - (Math.abs(angle) / 75) * 0.1) })),
  ...Array.from({ length: 13 }, (_, i) => -66 + i * 11)
    .sort(outsideIn)
    .map((angle) => ({ angle, scale: 0.68 }))
];
/** The folded tail, pointing down and back from the rump. */
export const FOLDED_TAIL = [136, 118, 132, 122, 127];
export const FOLDED_COVERTS = [133, 121, 127];

/** The beard: coarse black bristles hanging from the breast. */
export const BEARD: readonly { d: string; width: number; light: boolean }[] = (() => {
  const random = seeded(17);
  return Array.from({ length: 34 }, () => {
    const x0 = 108 + random() * 10;
    const y0 = 196 + random() * 10;
    const length = 80 + random() * 20;
    const cx = x0 - 1 + (random() - 0.5) * 6;
    const x1 = x0 - 9 - random() * 8;
    return {
      d: `M${r1(x0)} ${r1(y0)} Q${r1(cx)} ${r1(y0 + length * 0.55)} ${r1(x1)} ${r1(y0 + length)}`,
      width: r2(0.7 + random() * 1.5),
      light: random() < 0.22
    };
  });
})();

/** Red caruncles down the front of the neck, bigger lower down. */
export const NECK_CARUNCLES: readonly Dot[] = (() => {
  const random = seeded(23);
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const off = random() * 13;
    return { x: r1(lerp(84, 120, t) + off * 0.84), y: r1(lerp(100, 156, t) - off * 0.54), r: r1(1.8 + random() * 2.2 + t * 1.2) };
  }).sort((a, b) => a.y - b.y);
})();

/** Fine bumps over the bare neck skin. */
export const NECK_BUMPS: readonly Dot[] = (() => {
  const random = seeded(31);
  return Array.from({ length: 45 }, () => {
    const t = random();
    const off = (random() - 0.5) * 20;
    return { x: r1(lerp(92, 150, t) + off * 0.74), y: r1(lerp(96, 160, t) - off * 0.67), r: r1(0.7 + random() * 0.8) };
  });
})();

/** Small feathers where the bare neck meets the body, drawn top last so they shingle down. */
export const RUFF_FEATHERS: readonly Feather[] = (() => {
  const random = seeded(37);
  const ruff: Ellipse = { cx: 162, cy: 174, rx: 44, ry: 30, rot: 25 };
  return Array.from({ length: 10 * 8 }, (_, i) => [Math.floor(i / 10), i % 10] as const)
    .map(([row, col]) => {
      const x = 118 + col * 9.5 + (row % 2 ? 4.5 : 0) + (random() - 0.5) * 3;
      const y = 140 + row * 8.5 + (random() - 0.5) * 3;
      const angle = 50 + random() * 22;
      const look = pickLook(random, 0.45, 0.35);
      return ellipseDistance(x, y, ruff) < 0.95 ? { x: r1(x), y: r1(y), angle: r1(angle), scale: 0.5, look } : null;
    })
    .filter((f): f is Feather => f !== null)
    .sort((a, b) => b.y - a.y);
})();

/** Skin bumps and bristles on the small head (skull centred on 82, 82). */
export const HEAD_BUMPS: readonly Dot[] = (() => {
  const random = seeded(41);
  return Array.from({ length: 60 }, () => ({ x: 58 + random() * 48, y: 62 + random() * 40, r: r1(0.5 + random() * 0.7) }))
    .filter(({ x, y }) => Math.hypot((x - 82) / 23, (y - 82) / 18) < 1 && Math.hypot(x - 76, y - 76) > 8.5)
    .map(({ x, y, r }) => ({ x: r1(x), y: r1(y), r }));
})();

export const HEAD_BRISTLES = (() => {
  const random = seeded(43);
  return Array.from({ length: 18 }, (_, i) => {
    const a = (200 + (i / 17) * 140) * RAD;
    const x = 82 + Math.cos(a) * 22;
    const y = 82 + Math.sin(a) * 17;
    return `M${r1(x)} ${r1(y)} q${r1(1 + random())} ${r1(-0.8 - random())} ${r1(2.2 + random() * 1.6)} ${r1(-1 - random() * 1.4)}`;
  }).join("");
})();

// ---------------------------------------------------------------- the head up close (600×600)

const CLOSE_HEAD: Ellipse = { cx: 330, cy: 292, rx: 150, ry: 132, rot: -6 };
const CLOSE_EYE: Point = [330, 262];
const CLOSE_EAR: Point = [404, 304];

export type Blob = { x: number; y: number; rx: number; ry: number; rot: number; tone: number };

/** Caruncles: irregular fleshy lumps packed over the neck below the head, lower ones on top. */
export const CLOSE_CARUNCLES: readonly Blob[] = (() => {
  const random = seeded(53);
  return Array.from({ length: 260 }, () => {
    const y = 392 + random() * 214;
    const x = 300 + random() * 310;
    const r = 9 + random() * 8 + ((y - 392) / 214) * 8;
    return { x, y, r, aspect: 0.65 + random() * 0.35, rot: random() * 180, tone: Math.floor(random() * 3) };
  })
    .filter(({ x, y }) => x > 304 + (y - 400) * 0.1 && y < 610)
    .slice(0, 150)
    .map(({ x, y, r, aspect, rot, tone }) => ({ x: r1(x), y: r1(y), rx: r1(r), ry: r1(r * aspect), rot: Math.round(rot), tone }))
    .sort((a, b) => a.y - b.y);
})();

/** Bumpy skin over the head, kept off the eye and ear. */
export const CLOSE_PAPILLAE: readonly Dot[] = (() => {
  const random = seeded(59);
  return Array.from({ length: 620 }, () => ({ x: 170 + random() * 320, y: 150 + random() * 290, r: 0.9 + random() * 2.3 }))
    .filter(
      ({ x, y }) =>
        ellipseDistance(x, y, CLOSE_HEAD) < 0.96 &&
        Math.hypot(x - CLOSE_EYE[0], y - CLOSE_EYE[1]) > 50 &&
        Math.hypot(x - CLOSE_EAR[0], y - CLOSE_EAR[1]) > 16
    )
    .slice(0, 300)
    .map(({ x, y, r }) => ({ x: r1(x), y: r1(y), r: r1(r) }));
})();

/** Hair-like bristles lying back over the crown, around the ear and around the eye. */
export const CLOSE_BRISTLES: { thin: string; thick: string } = (() => {
  const random = seeded(61);
  const crown = Array.from({ length: 52 }, (_, i) => {
    const a = (198 + (i / 51) * 146 + (random() - 0.5) * 4) * RAD;
    const k = 0.78 + random() * 0.2;
    const rot = CLOSE_HEAD.rot * RAD;
    const ex = Math.cos(a) * CLOSE_HEAD.rx * k;
    const ey = Math.sin(a) * CLOSE_HEAD.ry * k;
    const x = CLOSE_HEAD.cx + ex * Math.cos(rot) - ey * Math.sin(rot);
    const y = CLOSE_HEAD.cy + ex * Math.sin(rot) + ey * Math.cos(rot);
    const len = 7 + random() * 10;
    const lie = a + Math.PI / 2 - 0.35;
    return `M${r1(x)} ${r1(y)} q${r1(Math.cos(lie) * len * 0.5)} ${r1(Math.sin(lie) * len * 0.5 - 3)} ${r1(Math.cos(lie) * len)} ${r1(Math.sin(lie) * len)}`;
  });
  const ear = Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2 + random() * 0.2;
    const from = 6 + random() * 4;
    const to = 16 + random() * 8;
    const [cx, cy] = CLOSE_EAR;
    return `M${r1(cx + Math.cos(a) * from)} ${r1(cy + Math.sin(a) * from)} L${r1(cx + Math.cos(a) * to + 5)} ${r1(cy + Math.sin(a) * to)}`;
  });
  const eye = Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2 + random() * 0.15;
    const from = 42 + random() * 3;
    const to = from + 5 + random() * 5;
    const [cx, cy] = CLOSE_EYE;
    return `M${r1(cx + Math.cos(a) * from)} ${r1(cy + Math.sin(a) * from)} L${r1(cx + Math.cos(a + 0.12) * to)} ${r1(cy + Math.sin(a + 0.12) * to)}`;
  });
  return { thin: [...ear, ...eye].join(""), thick: crown.join("") };
})();

/** Folds and creases across the head skin, roughly following its curve. */
export const CLOSE_WRINKLES = (() => {
  const random = seeded(71);
  return Array.from({ length: 160 }, () => ({ x: 190 + random() * 290, y: 170 + random() * 260, len: 12 + random() * 30, tilt: (random() - 0.5) * 0.7, bow: 2 + random() * 5 }))
    .filter(({ x, y }) => ellipseDistance(x, y, CLOSE_HEAD) < 0.9 && Math.hypot(x - CLOSE_EYE[0], y - CLOSE_EYE[1]) > 52)
    .slice(0, 60)
    .map(({ x, y, len, tilt, bow }) => {
      const dx = Math.cos(tilt) * len;
      const dy = Math.sin(tilt) * len;
      return `M${r1(x)} ${r1(y)} q${r1(dx / 2)} ${r1(dy / 2 + bow)} ${r1(dx)} ${r1(dy)}`;
    })
    .join("");
})();

/** Blotches of red and violet where the blue head skin turns red, lower down and toward the back. */
export const CLOSE_MOTTLE: readonly (Blob & { opacity: number })[] = (() => {
  const random = seeded(73);
  return Array.from({ length: 60 }, () => ({ x: 200 + random() * 290, y: 250 + random() * 190 }))
    .filter(({ x, y }) => ellipseDistance(x, y, CLOSE_HEAD) < 0.95 && Math.hypot(x - CLOSE_EYE[0], y - CLOSE_EYE[1]) > 46)
    .slice(0, 22)
    .map(({ x, y }) => ({
      x: r1(x),
      y: r1(y),
      rx: r1(14 + random() * 30),
      ry: r1(8 + random() * 16),
      rot: Math.round((random() - 0.5) * 60),
      tone: random() < 0.75 ? 0 : 1,
      opacity: r2(0.18 + random() * 0.22 + ((y - 250) / 190) * 0.2)
    }));
})();

/** Lumps along the snood, top to tip. */
export const SNOOD_BUMPS: readonly Dot[] = (() => {
  const random = seeded(79);
  const spine: readonly Point[] = [[222, 304], [184, 340], [162, 380], [152, 420], [152, 460], [156, 488]];
  return Array.from({ length: 70 }, () => {
    const t = random() * (spine.length - 1);
    const i = Math.min(Math.floor(t), spine.length - 2);
    const f = t - i;
    const width = lerp(16, 9, t / (spine.length - 1));
    return {
      x: r1(lerp(spine[i][0], spine[i + 1][0], f) + (random() - 0.5) * width * 1.6),
      y: r1(lerp(spine[i][1], spine[i + 1][1], f) + (random() - 0.5) * 6),
      r: r1(1.8 + random() * 3.2)
    };
  });
})();

/** Fine streaks in the iris, out from the pupil. */
export const IRIS_STREAKS = (() => {
  const random = seeded(67);
  const [cx, cy] = CLOSE_EYE;
  return Array.from({ length: 34 }, (_, i) => {
    const a = (i / 34) * Math.PI * 2 + random() * 0.12;
    const to = 22 + random() * 5;
    return `M${r1(cx + Math.cos(a) * 13.5)} ${r1(cy + Math.sin(a) * 13.5)} L${r1(cx + Math.cos(a) * to)} ${r1(cy + Math.sin(a) * to)}`;
  }).join("");
})();

/** Grain running along the upper beak. */
export const BEAK_GRAIN = Array.from({ length: 11 }, (_, k) => `M206 ${322 + k * 5} Q150 ${320 + k * 5} ${118 + k * 3} ${346 + k * 3}`).join("");
