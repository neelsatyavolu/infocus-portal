/* eslint-disable @next/next/no-img-element -- next/og renders plain img elements. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CSSProperties } from "react";
import { fitFontSize, fitWrappedFontSize } from "@/src/lib/live/thumbnail";
import { loadLexend } from "@/src/server/live-thumbnail";
import type { CertificateData } from "@/src/server/package-of-cycle";

/** Landscape US Letter at 200 dpi. */
export const CERTIFICATE_SIZE = { width: 2200, height: 1700 } as const;

const INK = "#0F110F";
const INK_SOFT = "#4B524D";
const GREEN = "#0B6E3E";
const RULE = "#D5DCD7";
const WORDMARK_RATIO = 480 / 206;
const TEXT_WIDTH = 1640;

let wordmarkPromise: Promise<string> | null = null;

/** Color wordmark for light pages (listed in next.config outputFileTracingIncludes). */
function loadWordmark() {
  wordmarkPromise ??= readFile(path.join(process.cwd(), "public/favicon/infocus-wordmark-light.png")).then(
    (file) => `data:image/png;base64,${file.toString("base64")}`
  );
  return wordmarkPromise;
}

export async function loadCertificateAssets() {
  const weights = [400, 600] as const;
  const [wordmark, ...fonts] = await Promise.all([loadWordmark(), ...weights.map((weight) => loadLexend(weight))]);
  return {
    wordmark,
    fonts: fonts.flatMap((data, index) =>
      data ? [{ name: "Lexend", data, weight: weights[index], style: "normal" as const }] : []
    )
  };
}

/** "2026–27" for a date in the 2026–27 school year (August onward starts a new year). */
export function schoolYearLabel(date: Date) {
  const start = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}–${String((start + 1) % 100).padStart(2, "0")}`;
}

const label: CSSProperties = {
  fontSize: 26,
  fontWeight: 600,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: GREEN
};

function Signature({ caption }: { caption: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 520 }}>
      <div style={{ display: "flex", width: "100%", height: 2, backgroundColor: INK }} />
      <div style={{ ...label, color: INK_SOFT, fontSize: 22, marginTop: 18 }}>{caption}</div>
    </div>
  );
}

export function renderCertificate(data: CertificateData, wordmark: string) {
  const title = `“${data.title}”`;
  const nameSize = fitFontSize(data.name, TEXT_WIDTH, 132, 72, 0.58);
  const titleSize = fitWrappedFontSize(title, TEXT_WIDTH, 2, 60, 36, 0.56);
  const awarded = data.awardedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles"
  });

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        backgroundColor: "#FFFFFF",
        padding: 64,
        fontFamily: "Lexend"
      }}
    >
      <div style={{ display: "flex", flex: 1, border: `6px solid ${INK}`, padding: 18 }}>
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            alignItems: "center",
            border: `2px solid ${GREEN}`,
            padding: "84px 120px 72px",
            color: INK
          }}
        >
          <img src={wordmark} alt="" width={Math.round(132 * WORDMARK_RATIO)} height={132} />
          <div style={{ ...label, marginTop: 44 }}>InFocus News · Certificate of Excellence</div>
          <div style={{ display: "flex", fontSize: 150, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 20 }}>
            Package of the Cycle
          </div>
          <div style={{ display: "flex", width: 180, height: 8, backgroundColor: GREEN, marginTop: 36 }} />
          <div style={{ display: "flex", fontSize: 38, color: INK_SOFT, marginTop: 60 }}>Presented to</div>
          <div
            style={{
              display: "flex",
              fontSize: nameSize,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              marginTop: 12,
              paddingBottom: 22,
              borderBottom: `2px solid ${RULE}`,
              minWidth: 1100,
              justifyContent: "center"
            }}
          >
            {data.name}
          </div>
          <div style={{ display: "flex", fontSize: 36, color: INK_SOFT, marginTop: 44 }}>for the package</div>
          <div
            style={{
              display: "flex",
              maxWidth: TEXT_WIDTH,
              fontSize: titleSize,
              fontWeight: 600,
              color: GREEN,
              textAlign: "center",
              justifyContent: "center",
              lineHeight: 1.2,
              marginTop: 14
            }}
          >
            {title}
          </div>
          <div style={{ display: "flex", fontSize: 32, color: INK_SOFT, marginTop: 40 }}>
            {`Chosen by the executive producers · Cycle ${data.cycleNumber} · ${schoolYearLabel(data.awardedAt)}`}
          </div>
          <div
            style={{
              display: "flex",
              flex: 1,
              width: "100%",
              alignItems: "flex-end",
              justifyContent: "space-between"
            }}
          >
            <Signature caption="Executive Producer" />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 34, fontWeight: 600 }}>{awarded}</div>
              <div style={{ ...label, color: INK_SOFT, fontSize: 22, marginTop: 18 }}>Awarded</div>
            </div>
            <Signature caption="Adviser" />
          </div>
        </div>
      </div>
    </div>
  );
}
