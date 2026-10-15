import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

/** Saved secret in edit mode: keep it, replace it, or remove it. */
export type SecretMode = "keep" | "replace" | "remove";

/** The h-9 dashed "Saved (encrypted)" box; amber while it's set to be removed. */
function SavedBox({ removing, children }: { removing?: boolean; children: ReactNode }) {
  return (
    <span
      aria-live="polite"
      className={cn(
        "flex h-9 min-w-[10rem] flex-1 items-center gap-2 rounded-md border border-dashed border-input px-3 text-sm",
        removing ? "text-brand-amber" : "text-muted-foreground"
      )}
    >
      <Lock className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * A write-only secret that's already saved (password, 2FA key), in the same shape as the
 * replace row: [saved box][Replace][Remove], or [will be removed][Undo]. All h-9.
 */
export function SavedSecret({
  label,
  mode,
  onMode
}: {
  /** "password", "2FA key": names the buttons for screen readers. */
  label: string;
  mode: Exclude<SecretMode, "replace">;
  onMode: (mode: SecretMode) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <SavedBox removing={mode === "remove"}>{mode === "remove" ? "Will be removed when you save" : "Saved (encrypted)"}</SavedBox>
      {mode === "remove" ? (
        <Button type="button" variant="outline" onClick={() => onMode("keep")} aria-label={`Undo removing the ${label}`}>
          Undo
        </Button>
      ) : (
        <>
          <Button type="button" variant="outline" onClick={() => onMode("replace")} aria-label={`Replace the ${label}`}>
            Replace
          </Button>
          <Button type="button" variant="destructive-quiet" onClick={() => onMode("remove")} aria-label={`Remove the ${label}`}>
            Remove
          </Button>
        </>
      )}
    </div>
  );
}

/** Notes that are saved but not loaded: [saved box][Edit notes]. Loading them is a logged view. */
export function SavedNotes({ busy, onEdit }: { busy: boolean; onEdit: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <SavedBox>Saved (encrypted)</SavedBox>
      <Button type="button" variant="outline" onClick={onEdit} disabled={busy}>
        {busy ? <Spinner label="Loading notes" /> : null}
        Edit notes
      </Button>
    </div>
  );
}
