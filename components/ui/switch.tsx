"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/src/lib/utils";

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-150 ease-[var(--ease-ui)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:bg-[var(--brand-fill)] data-[state=unchecked]:bg-[var(--ink-4)]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full ring-0 transition-[transform,background-color] duration-150 ease-[var(--ease-ui)] data-[state=checked]:translate-x-4 data-[state=checked]:bg-[var(--on-brand)] data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-foreground"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
