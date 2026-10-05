"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copies a shareable link (`url`, on the Meetings host). `iconOnly` is for meeting rows; the hero shows the label. */
export function CopyLinkButton({ url, label = "Copy link", iconOnly = false }: { url: string; label?: string; iconOnly?: boolean }) {
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

  const icon = copied ? <Check aria-hidden /> : <Link2 aria-hidden />;
  return (
    <Button
      variant="outline"
      size={iconOnly ? "sm" : "default"}
      onClick={() => void copy()}
      aria-label={copied ? "Link copied" : label}
      title={iconOnly ? label : undefined}
      className={iconOnly ? "w-8 px-0" : undefined}
    >
      {icon}
      {iconOnly ? null : copied ? "Copied" : label}
    </Button>
  );
}
