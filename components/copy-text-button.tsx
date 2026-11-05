"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

/**
 * Copy-to-clipboard button with a "Copied" state. With `size` or `variant` it uses the Button
 * family (h-8 / h-9 / square icon) so it matches the buttons beside it; without either it keeps
 * its original 40px look (the meeting call dialogs rely on that).
 */
export function CopyTextButton({
  text,
  getText,
  label = "Copy",
  copiedLabel = "Copied",
  size,
  variant,
  onError,
  className
}: {
  text?: string;
  /** Builds the text at click time (e.g. fetches a secret). */
  getText?: () => string | Promise<string>;
  label?: string;
  copiedLabel?: string;
  size?: "sm" | "default" | "icon" | "icon-sm";
  variant?: "outline" | "ghost" | "secondary";
  /** Replaces the default "Couldn't copy" toast. */
  onError?: (error: unknown) => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const iconOnly = size === "icon" || size === "icon-sm";
  const kitStyle = size !== undefined || variant !== undefined;

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copy() {
    try {
      const value = getText ? await getText() : text;
      if (!value) {
        return;
      }
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch (error) {
      setCopied(false);
      if (onError) onError(error);
      else toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }

  const icon = copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />;

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={!text && !getText}
      aria-label={copied ? copiedLabel : label}
      title={iconOnly ? label : undefined}
      className={
        kitStyle
          ? cn(
              buttonVariants({
                variant: variant ?? "outline",
                size: size === "icon-sm" ? "icon" : (size ?? "default")
              }),
              size === "icon-sm" && "h-8 w-8",
              copied && "text-[var(--brand-green)]",
              className
            )
          : cn(
              "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-secondary px-3 text-sm font-semibold text-foreground transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50",
              className
            )
      }
    >
      {icon}
      {iconOnly ? null : copied ? copiedLabel : label}
    </button>
  );
}

/** The kit name for the same button. */
export const CopyButton = CopyTextButton;
