"use client";

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useListHotkeys } from "@/components/kit/hotkeys";
import { Kbd } from "@/components/kit/kbd";
import { buttonVariants } from "@/components/ui/button";
import { neighborIds, readGroupOrder } from "@/src/lib/keyboard-nav";
import { cn } from "@/src/lib/utils";

/** Where this group sits in the order the Groups page last showed (its filters applied). */
export type GroupOrder =
  | { ready: false }
  | { ready: true; previous: string | null; next: string | null; index: number; total: number };

function readSavedOrder() {
  try {
    return readGroupOrder(window.sessionStorage);
  } catch {
    // Storage blocked (private mode): no queue, so the stepper stays hidden.
    return [];
  }
}

/**
 * Reads the saved Groups order and binds J (next) / K (previous) with the kit's list hotkeys
 * (skips typing, modifiers and open dialogs, like every other list). The keys work whether or
 * not the stepper is shown. The stepper's links prefetch the neighbors' loading view.
 */
export function useGroupOrder(rowId: string): GroupOrder {
  const router = useRouter();
  const [order, setOrder] = useState<string[] | null>(null);

  // Before paint, so arriving from Groups never shows the header without its stepper first.
  useLayoutEffect(() => {
    setOrder(readSavedOrder());
  }, []);

  const { previous, next } = order ? neighborIds(order, rowId) : { previous: null, next: null };

  useListHotkeys({
    enabled: Boolean(previous || next),
    onNext: () => {
      if (next) router.push(`/groups/${next}` as never);
    },
    onPrevious: () => {
      if (previous) router.push(`/groups/${previous}` as never);
    }
  });

  if (!order) return { ready: false };
  return { ready: true, previous, next, index: order.indexOf(rowId) + 1, total: order.length };
}

const STEP_CLASS = cn(
  buttonVariants({ variant: "outline" }),
  "h-full gap-1.5 px-3 max-sm:aspect-square max-sm:w-10 max-sm:px-0"
);

function StepLink({ id, direction }: { id: string | null; direction: "previous" | "next" }) {
  const key = direction === "previous" ? "K" : "J";
  const label = `${direction === "previous" ? "Previous" : "Next"} group (${key})`;
  const body =
    direction === "previous" ? (
      <>
        <ChevronLeft aria-hidden />
        <span className="max-sm:hidden">Previous</span>
        <Kbd className="hidden lg:inline-flex">{key}</Kbd>
      </>
    ) : (
      <>
        <span className="max-sm:hidden">Next</span>
        <Kbd className="hidden lg:inline-flex">{key}</Kbd>
        <ChevronRight aria-hidden />
      </>
    );
  return id ? (
    <Link href={`/groups/${id}` as never} aria-label={label} aria-keyshortcuts={key} title={label} className={STEP_CLASS}>
      {body}
    </Link>
  ) : (
    <span role="link" aria-disabled="true" aria-label={label} className={cn(STEP_CLASS, "pointer-events-none opacity-50")}>
      {body}
    </span>
  );
}

/**
 * ‹ Previous K   4 / 12   Next J ›. Ends stay in place as disabled twins. Until the saved order
 * is read (only on a full page load), a same-size invisible copy holds its place beside the
 * title from sm; phones reserve nothing, since a group opened from a push link has no stepper.
 */
export function GroupStepper({ order }: { order: GroupOrder }) {
  const placeholder = !order.ready;
  const position = order.ready ? `${order.index} / ${order.total}` : "– / –";
  return (
    <div
      role={placeholder ? undefined : "group"}
      aria-label={placeholder ? undefined : "Previous and next group"}
      aria-hidden={placeholder || undefined}
      className={cn("flex items-center gap-2 max-sm:h-10!", placeholder && "invisible max-sm:hidden")}
    >
      <StepLink id={order.ready ? order.previous : null} direction="previous" />
      <span
        title="Position in your Groups list order"
        className="inline-flex h-full items-center justify-center px-1 font-mono-broadcast text-[13px] tabular-nums text-muted-foreground max-sm:flex-1"
      >
        <span aria-hidden>{position}</span>
        {order.ready ? (
          <span className="sr-only">{`Group ${order.index} of ${order.total} in your Groups list order`}</span>
        ) : null}
      </span>
      <StepLink id={order.ready ? order.next : null} direction="next" />
    </div>
  );
}
