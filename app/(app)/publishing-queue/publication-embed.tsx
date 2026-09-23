"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function PublicationEmbed({ code }: { code: string }) {
  return (
    <div className="space-y-3">
      <label htmlFor="publication-embed" className="text-sm font-medium">Embed code</label>
      <textarea
        id="publication-embed"
        readOnly
        value={code}
        onFocus={(event) => event.currentTarget.select()}
        className="min-h-28 w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
      />
      <Button type="button" variant="outline" onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          toast.success("Embed code copied.");
        } catch {
          toast.error("Could not copy. Select the embed code and copy it manually.");
        }
      }}>Copy embed code</Button>
    </div>
  );
}
