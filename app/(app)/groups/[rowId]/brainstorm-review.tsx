import type { ReactNode } from "react";
import { ExternalLink, FileText, ImageOff } from "lucide-react";
import { ScrollStrip } from "@/components/kit/layout";
import { PROOF_OF_CONTACT_SLOTS, type BrainstormProofView } from "@/src/lib/package-brainstorm";
import { cn } from "@/src/lib/utils";

const FRAME = "flex min-w-0 flex-col overflow-hidden rounded-md border bg-card";
const LINK_FRAME = cn(
  FRAME,
  "border-border transition-colors hover:border-[var(--ink-5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
);
/** Phones: a fixed-height strip tile. From sm: a portrait frame, so screenshots of texts fit uncropped. */
const PREVIEW = "relative block h-[clamp(14rem,60vw,22rem)] w-full sm:aspect-[3/4] sm:h-auto sm:max-h-[min(45vh,24rem)]";
const CAPTION = "flex min-h-9 min-w-0 items-center gap-2 border-t px-3 py-2";
const LABEL = "shrink-0 text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground";

function Caption({
  label,
  name,
  mono = true,
  dashed = false
}: {
  label: string;
  name?: string;
  /** File names are data (Geist Mono); plain words stay Lexend. */
  mono?: boolean;
  dashed?: boolean;
}) {
  return (
    <span className={cn(CAPTION, dashed ? "border-dashed border-border" : "border-border")}>
      <span className={LABEL}>{label}</span>
      {name ? (
        <>
          <span className={cn("min-w-0 flex-1 truncate text-xs text-[var(--ink-text)]", mono && "font-mono-broadcast")}>
            {name}
          </span>
          <ExternalLink aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">(opens in a new tab)</span>
        </>
      ) : null}
    </span>
  );
}

function MissingTile({ label, icon, text }: { label: string; icon: ReactNode; text: string }) {
  return (
    <div className={cn(FRAME, "border-dashed border-border")}>
      <span className={cn(PREVIEW, "grid place-items-center")}>
        <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {text}
        </span>
      </span>
      <Caption label={label} dashed />
    </div>
  );
}

function docHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * The four things a producer checks before approving Contact: three proof screenshots (shown
 * whole, never cropped) and the brainstorm doc. Each opens full size in a new tab; a missing one
 * is a dashed slot. A swipe strip on phones, two columns from sm, one row of four from lg.
 */
export function BrainstormReview({ proofs, docUrl }: { proofs: BrainstormProofView[]; docUrl: string }) {
  return (
    <ScrollStrip
      aria-label="Brainstorm materials"
      itemWidth="85%"
      gridClassName="sm:grid-cols-2 lg:grid-cols-4"
      className="sm:gap-4"
    >
      {PROOF_OF_CONTACT_SLOTS.map((slot) => {
        const proof = proofs.find((item) => item.slot === slot);
        if (!proof) {
          return (
            <MissingTile
              key={slot}
              label={`Proof ${slot}`}
              icon={<ImageOff aria-hidden className="h-4 w-4" />}
              text="Not uploaded"
            />
          );
        }
        return (
          <a key={slot} href={proof.imageUrl} target="_blank" rel="noreferrer" title={proof.fileName} className={LINK_FRAME}>
            <span className={cn(PREVIEW, "bg-muted")}>
              {/* The caption names the link, so the image itself is decorative here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proof.imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
            </span>
            <Caption label={`Proof ${slot}`} name={proof.fileName} />
          </a>
        );
      })}
      {docUrl ? (
        <a href={docUrl} target="_blank" rel="noreferrer" title={docUrl} className={LINK_FRAME}>
          <span className={cn(PREVIEW, "grid place-items-center bg-[var(--ink-3)]")}>
            <span className="flex min-w-0 max-w-full flex-col items-center gap-2 px-4 text-center">
              <FileText aria-hidden className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Brainstorm doc</span>
              <span className="max-w-full truncate font-mono-broadcast text-xs text-muted-foreground">{docHost(docUrl)}</span>
            </span>
          </span>
          <Caption label="Doc" name="Open Google Doc" mono={false} />
        </a>
      ) : (
        <MissingTile label="Doc" icon={<FileText aria-hidden className="h-4 w-4" />} text="No Google Doc yet" />
      )}
    </ScrollStrip>
  );
}
