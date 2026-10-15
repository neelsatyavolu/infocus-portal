"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { fieldLabelClass } from "@/components/kit/field";
import { Button } from "@/components/ui/button";

/** The YouTube embed code to paste into the website, and the page's one primary: Copy. */
export default function PublicationEmbed({ code }: { code: string }) {
  return (
    <div className="space-y-2">
      <label htmlFor="publication-embed" className={fieldLabelClass}>
        Embed code
      </label>
      <textarea
        id="publication-embed"
        readOnly
        value={code}
        onFocus={(event) => event.currentTarget.select()}
        className="min-h-28 w-full resize-y rounded-md border border-input bg-background p-3 font-mono-broadcast text-xs leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button
        type="button"
        className="w-full"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            toast.success("Embed code copied.");
          } catch {
            toast.error("Could not copy. Select the embed code and copy it manually.");
          }
        }}
      >
        <Copy aria-hidden />
        Copy embed code
      </Button>
    </div>
  );
}
