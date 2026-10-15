"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

/** Copies a link from a menu item: a toast says it worked (the menu closes, so no icon swap). */
export async function copyLinkWithToast(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied.");
  } catch {
    toast.error("Couldn't copy the link.");
  }
}

/** Copies a shareable link (`url`, on the Meetings host) and shows "Copied" for 1.5 s. Small outline button. */
export function CopyLinkButton({ url, label = "Copy link", className }: { url: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void copy()}
      aria-label={copied ? "Link copied" : label}
      className={cn(copied && "text-[var(--brand-green)]", className)}
    >
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      {copied ? "Copied" : label}
    </Button>
  );
}
