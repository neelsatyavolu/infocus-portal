"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * "Download project": a Terminal script that downloads every file and zips the folder. The
 * script is fetched once per page visit and reused (each fetch issues new signed URLs).
 */
export default function TerminalScriptDialog({
  projectId,
  open,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [scriptText, setScriptText] = useState<string | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);

  const [openedFor, setOpenedFor] = useState({ open, projectId });
  if (open !== openedFor.open || projectId !== openedFor.projectId) {
    setOpenedFor({ open, projectId });
    if (open) setScriptCopied(false);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    if (scriptText) {
      // Already fetched in this session; reuse to avoid re-issuing tokens.
      return;
    }

    let cancelled = false;
    async function loadScript() {
      setScriptLoading(true);
      setScriptError(null);
      try {
        const response = await fetch(`/api/projects/${projectId}/download/script`, {
          cache: "no-store"
        });
        if (!response.ok) {
          let message = `Failed to load script (HTTP ${response.status}).`;
          try {
            const payload = (await response.json()) as { error?: { message?: string } };
            message = payload.error?.message ?? message;
          } catch {
            // Keep the HTTP status fallback for non-JSON error bodies.
          }
          throw new Error(message);
        }
        const text = await response.text();
        if (!cancelled) setScriptText(text);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load script.";
        if (!cancelled) setScriptError(message);
      } finally {
        if (!cancelled) setScriptLoading(false);
      }
    }

    void loadScript();
    return () => {
      cancelled = true;
    };
    // Only (re)load when the dialog opens; a loaded script is reused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  async function copyScript() {
    if (!scriptText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(scriptText);
      setScriptCopied(true);
      window.setTimeout(() => setScriptCopied(false), 2000);
    } catch {
      setScriptError("Couldn't copy to clipboard. Select the text manually instead.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" aria-hidden />
            Terminal download script
          </DialogTitle>
          <DialogDescription>
            Paste this whole block into a Terminal window. It will create the project folder under
            ~/Downloads, fetch each file directly from Bunny CDN, then zip the folder.
            Signed URLs are valid for 6 hours.
          </DialogDescription>
        </DialogHeader>

        {scriptLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading script…</p>
        ) : null}
        {scriptError ? <Alert tone="danger">{scriptError}</Alert> : null}
        {!scriptLoading && scriptText ? (
          <div className="relative min-w-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyScript()}
              className="absolute right-2 top-2 bg-card"
            >
              {scriptCopied ? <Check className="text-[var(--brand-green)]" aria-hidden /> : <Copy aria-hidden />}
              {scriptCopied ? "Copied" : "Copy"}
            </Button>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-[var(--ink-3)] px-3 py-3 pr-24 font-mono-broadcast text-xs leading-relaxed text-foreground">
              <code>{scriptText}</code>
            </pre>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
