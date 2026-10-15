import { ChevronLeft, ChevronRight } from "lucide-react";
import { ButtonGroup } from "@/components/kit/button-group";
import { Spinner } from "@/components/kit/spinner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

const STEP_CLASS = cn(buttonVariants({ variant: "outline", size: "icon" }), "aspect-square w-auto px-0");

/**
 * [‹ Today ›] as one joined control. While a month loads, Today shows a spinner in place (so
 * nothing shifts) and every segment waits. Below md it is 40px tall like the toolbar under it
 * (`!` beats the header ActionBar's `*:h-9`).
 */
export function MonthStepper({
  loading,
  previousDisabled,
  onPrevious,
  onNext,
  onToday
}: {
  loading: boolean;
  previousDisabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <ButtonGroup aria-label="Change month" className="max-sm:w-full max-md:h-10!">
      <button
        type="button"
        aria-label="Previous month"
        title="Previous month"
        onClick={onPrevious}
        disabled={previousDisabled || loading}
        className={STEP_CLASS}
      >
        <ChevronLeft aria-hidden />
      </button>
      <button
        type="button"
        onClick={onToday}
        disabled={loading}
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant: "outline" }), "relative px-4 max-sm:flex-1")}
      >
        <span className={cn(loading && "invisible")}>Today</span>
        {loading ? (
          <span className="absolute inset-0 grid place-items-center">
            <Spinner label="Loading month" />
          </span>
        ) : null}
      </button>
      <button
        type="button"
        aria-label="Next month"
        title="Next month"
        onClick={onNext}
        disabled={loading}
        className={STEP_CLASS}
      >
        <ChevronRight aria-hidden />
      </button>
    </ButtonGroup>
  );
}
