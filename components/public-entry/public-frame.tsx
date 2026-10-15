import type { ReactNode } from "react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { cn } from "@/src/lib/utils";

export type PublicFrameWidth = "narrow" | "reading" | "wide";

const WIDTH: Record<PublicFrameWidth, string> = {
  narrow: "max-w-[28rem]",
  reading: "max-w-[44rem]",
  wide: "max-w-[64rem]"
};

/**
 * The one column for pages outside the app shell (sign-in, onboarding, access, maintenance,
 * public forms, shared links): the wordmark row, then the plate and panels, all on the same
 * left and right edges. Top-weighted (not vertically centred), so nothing jumps when a step,
 * an error or the phone keyboard appears.
 */
export function PublicFrame({
  width,
  aside,
  children
}: {
  width: PublicFrameWidth;
  /** Small muted text on the right of the wordmark row ("Signed in as …"). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full space-y-5 px-4 pb-10 pt-6 md:px-6",
        WIDTH[width],
        width === "narrow" ? "md:pt-[10vh]" : "md:pt-10"
      )}
    >
      <div className="flex h-10 items-center justify-between gap-4">
        {/* The file has empty space above and below the letters; cover-crop keeps them ~120px wide. */}
        <BrandWordmark priority className="h-9 w-[128px] shrink-0 object-cover" />
        {aside ? <div className="min-w-0 truncate text-[13px] text-muted-foreground">{aside}</div> : null}
      </div>
      {children}
    </main>
  );
}
