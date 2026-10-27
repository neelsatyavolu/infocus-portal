import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { GhostSprite } from "./sprites";

/** What the page shows for each haunting (halloween-hauntings.tsx). All of it ignores the pointer. */
export type HauntVisual =
  | { kind: "flicker" }
  | { kind: "flashlight" }
  | { kind: "drips"; drips: { left: number; width: number; length: number; delay: number }[] }
  | { kind: "handprints"; prints: { x: number; y: number; r: number; flip: boolean }[] }
  | { kind: "glitch" }
  | { kind: "static" }
  | { kind: "crack"; x: number; y: number; path: string }
  | { kind: "shadow"; rtl: boolean }
  | { kind: "heartbeat" }
  | { kind: "scratches"; x: number; y: number; r: number }
  | { kind: "follower" }
  | { kind: "writing"; x: number; y: number; r: number; text: string }
  | { kind: "fog" };

const between = (min: number, max: number) => min + Math.random() * (max - min);

/** Blood drips along the top edge of the window. */
export function makeDrips(): HauntVisual {
  const count = Math.round(between(9, 16));
  return {
    kind: "drips",
    drips: Array.from({ length: count }, (_, i) => ({
      left: ((i + Math.random()) / count) * 100,
      width: between(5, 13),
      length: between(8, 38),
      delay: between(0, 1.2)
    }))
  };
}

/** Five handprints in a line across the window, alternating hands. */
export function makeHandprints(): HauntVisual {
  const width = window.innerWidth;
  const height = window.innerHeight;
  let x = between(0.1, 0.3) * width;
  let y = between(0.2, 0.7) * height;
  const step = width / 7;
  const rtl = Math.random() < 0.5;
  if (rtl) x = width - x;
  return {
    kind: "handprints",
    prints: Array.from({ length: 5 }, (_, i) => {
      const print = { x, y, r: between(-25, 25), flip: i % 2 === 1 };
      x += rtl ? -step : step;
      y = Math.min(Math.max(y + between(-0.12, 0.12) * height, 80), height - 140);
      return print;
    })
  };
}

/** A cracked window: jagged lines out from where it was hit, and a ring of cracks between them. */
export function makeCrack(): HauntVisual {
  const rays = Math.round(between(7, 10));
  const parts: string[] = [];
  const ring: [number, number][] = [];
  for (let i = 0; i < rays; i += 1) {
    const angle = (i / rays) * Math.PI * 2 + between(-0.25, 0.25);
    let r = 0;
    let px = 150;
    let py = 150;
    let d = `M150 150`;
    const segments = Math.round(between(4, 7));
    for (let s = 0; s < segments; s += 1) {
      r += between(14, 26);
      const wobble = angle + between(-0.25, 0.25);
      px = 150 + Math.cos(wobble) * r;
      py = 150 + Math.sin(wobble) * r;
      d += ` L${px.toFixed(1)} ${py.toFixed(1)}`;
      if (s === 1) ring.push([px, py]);
    }
    parts.push(d);
  }
  parts.push(`M${ring.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")} Z`);
  return { kind: "crack", x: between(0.2, 0.8) * window.innerWidth, y: between(0.2, 0.75) * window.innerHeight, path: parts.join(" ") };
}

function Handprint({ flip }: { flip: boolean }) {
  return (
    <svg viewBox="0 0 60 84" aria-hidden style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <g fill="currentColor">
        <ellipse cx="30" cy="58" rx="17" ry="20" />
        <rect x="11" y="18" width="8" height="30" rx="4" transform="rotate(-12 15 33)" />
        <rect x="21" y="8" width="8" height="36" rx="4" />
        <rect x="31" y="6" width="8" height="38" rx="4" />
        <rect x="41" y="14" width="8" height="32" rx="4" transform="rotate(10 45 30)" />
        <rect x="45" y="44" width="8" height="24" rx="4" transform="rotate(48 49 56)" />
      </g>
    </svg>
  );
}

function ShadowFigure() {
  return (
    <svg viewBox="0 0 60 200" aria-hidden>
      <g fill="#030403">
        <ellipse cx="30" cy="18" rx="11" ry="14" />
        <path d="M14 36 Q30 28 46 36 L50 120 Q52 160 44 200 L16 200 Q8 160 10 120 Z" />
        <path d="M14 40 Q4 80 6 130 L11 130 Q12 84 20 48 Z M46 40 Q56 80 54 130 L49 130 Q48 84 40 48 Z" />
      </g>
    </svg>
  );
}

function ClawMarks() {
  return (
    <svg viewBox="0 0 200 260" aria-hidden>
      {[30, 75, 120, 160].map((x, i) => (
        <g key={x} className="hw-claw" style={{ animationDelay: `${i * 0.08}s` }}>
          <path d={`M${x} 10 Q${x + 20} 130 ${x + 6} 250`} stroke="#4A060C" strokeWidth="9" fill="none" strokeLinecap="round" pathLength={1} />
          <path d={`M${x} 10 Q${x + 20} 130 ${x + 6} 250`} stroke="#A3172A" strokeWidth="2.5" fill="none" strokeLinecap="round" pathLength={1} />
        </g>
      ))}
    </svg>
  );
}

/** TV snow: random grey pixels, redrawn about 15 times a second. */
function StaticNoise() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(160, 90);
    const draw = () => {
      for (let i = 0; i < image.data.length; i += 4) {
        const v = Math.random() * 255;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
        image.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    };
    draw();
    const timer = window.setInterval(draw, 66);
    return () => window.clearInterval(timer);
  }, []);
  return <canvas ref={canvas} width={160} height={90} className="hw-static-snow" />;
}

/** The dark, with a circle of light wherever the pointer is. */
function Flashlight({ pointer }: { pointer: { x: number; y: number } }) {
  const light = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      light.current?.style.setProperty("--hw-x", `${event.clientX}px`);
      light.current?.style.setProperty("--hw-y", `${event.clientY}px`);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);
  return <div ref={light} className="hw-flashlight" style={{ "--hw-x": `${pointer.x}px`, "--hw-y": `${pointer.y}px` } as CSSProperties} />;
}

/** A little ghost that trails the pointer. */
function Follower({ pointer }: { pointer: { x: number; y: number } }) {
  const ghost = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let target = { ...pointer };
    let at = { x: pointer.x - 120, y: pointer.y + 80 };
    let frame = 0;
    const move = (event: PointerEvent) => {
      target = { x: event.clientX, y: event.clientY };
    };
    const step = () => {
      at = { x: at.x + (target.x - 40 - at.x) * 0.05, y: at.y + (target.y + 24 - at.y) * 0.05 };
      if (ghost.current) ghost.current.style.transform = `translate(${at.x}px, ${at.y}px)`;
      frame = requestAnimationFrame(step);
    };
    window.addEventListener("pointermove", move, { passive: true });
    frame = requestAnimationFrame(step);
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, [pointer]);
  return (
    <div ref={ghost} className="hw-follower">
      <GhostSprite />
    </div>
  );
}

export function HauntOverlay({ visual, pointer }: { visual: HauntVisual; pointer: { x: number; y: number } }): ReactNode {
  switch (visual.kind) {
    case "flicker":
    case "heartbeat":
    case "fog":
      return <div className={`hw-${visual.kind}`} />;
    case "flashlight":
      return <Flashlight pointer={pointer} />;
    case "drips":
      return (
        <div className="hw-drips">
          {visual.drips.map((drip, i) => (
            <div
              key={i}
              className="hw-drip"
              style={{ left: `${drip.left}%`, width: drip.width, "--hw-length": `${drip.length}vh`, animationDelay: `${drip.delay}s` } as CSSProperties}
            />
          ))}
        </div>
      );
    case "handprints":
      return visual.prints.map((print, i) => (
        <div
          key={i}
          className="hw-handprint"
          style={{ left: print.x, top: print.y, rotate: `${print.r}deg`, animationDelay: `${i * 0.45}s` }}
        >
          <Handprint flip={print.flip} />
        </div>
      ));
    case "glitch":
      return (
        <div className="hw-glitch-bars">
          <i />
          <i />
          <i />
        </div>
      );
    case "static":
      return (
        <div className="hw-static">
          <StaticNoise />
          <div className="hw-static-band" />
          <div className="hw-static-text">NO SIGNAL</div>
        </div>
      );
    case "crack":
      return (
        <svg className="hw-crack" viewBox="0 0 300 300" style={{ left: visual.x, top: visual.y }} aria-hidden>
          <path d={visual.path} />
        </svg>
      );
    case "shadow":
      return (
        <div className="hw-shadow" data-direction={visual.rtl ? "rtl" : "ltr"}>
          <ShadowFigure />
        </div>
      );
    case "scratches":
      return (
        <div className="hw-scratches" style={{ left: visual.x, top: visual.y, rotate: `${visual.r}deg` }}>
          <ClawMarks />
        </div>
      );
    case "follower":
      return <Follower pointer={pointer} />;
    case "writing":
      return (
        <div className="hw-writing" style={{ left: visual.x, top: visual.y, rotate: `${visual.r}deg` }}>
          {visual.text.split("").map((letter, i) => (
            <span key={i} style={{ animationDelay: `${0.3 + i * 0.16}s` }}>
              {letter === " " ? " " : letter}
            </span>
          ))}
        </div>
      );
  }
}
