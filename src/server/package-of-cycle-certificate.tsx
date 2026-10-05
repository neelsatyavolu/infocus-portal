/* eslint-disable @next/next/no-img-element -- next/og renders plain img elements. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CSSProperties } from "react";
import { fitFontSize, fitWrappedFontSize } from "@/src/lib/live/thumbnail";
import { loadLexend } from "@/src/server/live-thumbnail";
import { CERTIFICATE_SIGNER_COUNT, fitSignature, type CertificateSigner } from "@/src/lib/signature-image";
import type { CertificateData } from "@/src/server/package-of-cycle";

/** Landscape US Letter at 200 dpi. */
export const CERTIFICATE_SIZE = { width: 2200, height: 1700 } as const;

const INK = "#0F110F";
const INK_SOFT = "#4B524D";
const GREEN = "#0B6E3E";
const RULE = "#D5DCD7";
/** Flat, muted gold: the certificate's only accent beyond the brand colors. No gradients or foil. */
const GOLD = "#B08D3C";
const WORDMARK_RATIO = 480 / 206;
const TEXT_WIDTH = 1640;
/** Where a drawn signature sits above its line. */
const SIGNATURE_BOX = { width: 440, height: 88 } as const;
const SIGNATURE_WIDTH = 480;

let imagesPromise: Promise<CertificateImages> | null = null;

export type CertificateImages = { wordmark: string; icon: string };

/** Color wordmark and the icon for the Ink seal tile (listed in next.config outputFileTracingIncludes). */
function loadImages() {
  const dataUrl = (file: Buffer) => `data:image/png;base64,${file.toString("base64")}`;
  imagesPromise ??= Promise.all([
    readFile(path.join(process.cwd(), "public/favicon/infocus-wordmark-light.png")),
    readFile(path.join(process.cwd(), "public/live/infocus-icon.png"))
  ]).then(([wordmark, icon]) => ({ wordmark: dataUrl(wordmark), icon: dataUrl(icon) }));
  return imagesPromise;
}

export async function loadCertificateAssets() {
  const weights = [400, 600] as const;
  const [images, ...fonts] = await Promise.all([loadImages(), ...weights.map((weight) => loadLexend(weight))]);
  return {
    images,
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

type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

/** Square gold L at one inner corner of the frame. */
function CornerBracket({ corner }: { corner: Corner }) {
  const top = corner.startsWith("top");
  const left = corner.endsWith("Left");
  const edge = `8px solid ${GOLD}`;
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        width: 96,
        height: 96,
        ...(top ? { top: 22, borderTop: edge } : { bottom: 22, borderBottom: edge }),
        ...(left ? { left: 22, borderLeft: edge } : { right: 22, borderRight: edge })
      }}
    />
  );
}

/** The brand tile (icon on a square Ink plate), framed in gold as the certificate's seal. */
function Seal({ icon }: { icon: string }) {
  return (
    <div style={{ display: "flex", padding: 6, border: `4px solid ${GOLD}` }}>
      <div
        style={{
          display: "flex",
          width: 120,
          height: 120,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: INK
        }}
      >
        <img src={icon} alt="" width={88} height={88} />
      </div>
    </div>
  );
}

/** One executive producer's line: their drawn signature above it (or room to sign by hand), name and title below. */
function Signature({ signer }: { signer: CertificateSigner | undefined }) {
  const signature = signer?.signature;
  const size = signature ? fitSignature(signature, SIGNATURE_BOX) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: SIGNATURE_WIDTH }}>
      <div
        style={{
          display: "flex",
          height: SIGNATURE_BOX.height,
          width: "100%",
          alignItems: "flex-end",
          justifyContent: "center"
        }}
      >
        {signature && size ? <img src={signature.src} alt="" width={size.width} height={size.height} /> : null}
      </div>
      <div style={{ display: "flex", width: "100%", height: 2, backgroundColor: INK, marginTop: 6 }} />
      <div
        style={{
          display: "flex",
          height: 36,
          alignItems: "center",
          fontSize: fitFontSize(signer?.name ?? "", SIGNATURE_WIDTH, 28, 18, 0.58),
          fontWeight: 600,
          marginTop: 14
        }}
      >
        {signer?.name ?? ""}
      </div>
      <div style={{ ...label, color: INK_SOFT, fontSize: 20, marginTop: 6 }}>Executive Producer</div>
    </div>
  );
}

export function renderCertificate(data: CertificateData, images: CertificateImages) {
  const title = `“${data.title}”`;
  const nameSize = fitFontSize(data.name, TEXT_WIDTH, 112, 72, 0.58);
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
            position: "relative",
            border: `3px solid ${GOLD}`,
            padding: "72px 120px 52px",
            color: INK
          }}
        >
          <CornerBracket corner="topLeft" />
          <CornerBracket corner="topRight" />
          <CornerBracket corner="bottomLeft" />
          <CornerBracket corner="bottomRight" />
          <img src={images.wordmark} alt="" width={Math.round(132 * WORDMARK_RATIO)} height={132} />
          <div style={{ ...label, marginTop: 36 }}>InFocus News · Certificate of Excellence</div>
          <div style={{ display: "flex", fontSize: 150, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 20 }}>
            Package of the Cycle
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 30 }}>
            <div style={{ display: "flex", width: 90, height: 3, backgroundColor: GOLD }} />
            <div style={{ display: "flex", width: 180, height: 8, backgroundColor: GREEN, margin: "0 20px" }} />
            <div style={{ display: "flex", width: 90, height: 3, backgroundColor: GOLD }} />
          </div>
          <div style={{ display: "flex", fontSize: 38, color: INK_SOFT, marginTop: 40 }}>Presented to</div>
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
          <div style={{ display: "flex", fontSize: 36, color: INK_SOFT, marginTop: 34 }}>for the package</div>
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
          <div style={{ display: "flex", fontSize: 32, color: INK_SOFT, marginTop: 32 }}>
            {`Chosen by the executive producers · Cycle ${data.cycleNumber} · ${schoolYearLabel(data.awardedAt)}`}
          </div>
          {/* Grows to fill the space but never shrinks below its content, so it can't ride up over the text. */}
          <div
            style={{
              display: "flex",
              flexGrow: 1,
              flexShrink: 0,
              width: "100%",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingTop: 36
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <Seal icon={images.icon} />
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 28 }}>
                <div style={{ ...label, color: INK_SOFT, fontSize: 22 }}>Awarded</div>
                <div style={{ display: "flex", fontSize: 34, fontWeight: 600, marginTop: 8 }}>{awarded}</div>
              </div>
            </div>
            <div style={{ display: "flex", width: "100%", justifyContent: "space-between", marginTop: 20 }}>
              {Array.from({ length: CERTIFICATE_SIGNER_COUNT }, (_, index) => (
                <Signature key={index} signer={data.signers[index]} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
