"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Previous / Next for the phone row sheets. The kit Sheet footer holds its buttons to 36px, so
 * `h-10!` keeps these at the 40px touch size on phones (36px from md, like every touch control).
 */
export function SheetStepButtons({ onPrevious, onNext }: { onPrevious: (() => void) | null; onNext: (() => void) | null }) {
  return (
    <>
      <Button type="button" variant="outline" className="h-10! px-4 md:h-9!" disabled={!onPrevious} onClick={() => onPrevious?.()}>
        <ChevronLeft aria-hidden />
        Previous
      </Button>
      <Button type="button" variant="outline" className="h-10! px-4 md:h-9!" disabled={!onNext} onClick={() => onNext?.()}>
        Next
        <ChevronRight aria-hidden />
      </Button>
    </>
  );
}
