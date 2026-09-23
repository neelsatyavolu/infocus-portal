"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/src/lib/utils";

export function CopyTextButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  className
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copy() {
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={!text}
      aria-label={copied ? copiedLabel : label}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-secondary px-3 text-sm font-semibold text-foreground transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50",
        className
      )}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? copiedLabel : label}
    </button>
  );
}
