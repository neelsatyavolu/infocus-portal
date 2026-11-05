"use client";

import { useEffect, useRef } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import type { VaultEntrySummary } from "@/src/lib/password-vault";
import { cn } from "@/src/lib/utils";
import type { VaultReveal } from "./use-vault-reveal";
import { HidesCaption, SlotButton, VaultFieldList, VaultFieldRow } from "./vault-field-row";
import { formatTotpCode } from "./vault-logic";

function Dash() {
  return <span className="text-sm text-muted-foreground">—</span>;
}

function Masked({ dots }: { dots: string }) {
  return (
    <span className="font-mono-broadcast text-sm tabular-nums text-muted-foreground">
      <span aria-hidden>{dots}</span>
      <span className="sr-only">Hidden</span>
    </span>
  );
}

function TotpValue({ code, seconds }: { code: string; seconds: number }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-3">
      <span className="font-mono-broadcast text-lg font-medium tracking-[0.12em] tabular-nums text-foreground">
        {formatTotpCode(code)}
      </span>
      <span className={cn("font-mono-broadcast text-xs tabular-nums", seconds <= 5 ? "text-brand-amber" : "text-muted-foreground")}>
        {seconds}s
      </span>
    </span>
  );
}

/**
 * The four field rows of one login (notes only with full access), each with the same
 * [reveal][copy] slots. `reveal` is the login's useVaultReveal state, owned by the detail.
 */
export function VaultEntryFields({ entry, full, reveal }: { entry: VaultEntrySummary; full: boolean; reveal: VaultReveal }) {
  const totpCopyRef = useRef<HTMLDivElement>(null);
  const focusCopyAfterShow = useRef(false);
  const totpShown = reveal.totp !== null;

  // "Show code" turns into the code. When it was pressed from the keyboard, keep focus on the
  // row by moving it to Copy (a mouse click leaves focus alone, so no tooltip pops up).
  useEffect(() => {
    if (!totpShown || !focusCopyAfterShow.current) return;
    focusCopyAfterShow.current = false;
    if (document.activeElement === document.body || document.activeElement === null) {
      totpCopyRef.current?.querySelector("button")?.focus();
    }
  }, [totpShown]);

  return (
    <VaultFieldList>
      <VaultFieldRow
        label="Username"
        value={entry.username ? <span className="block text-sm text-foreground [overflow-wrap:anywhere]">{entry.username}</span> : <Dash />}
        copy={
          entry.username ? (
            <SlotButton
              label="Copy username"
              icon={Copy}
              done={reveal.copied === "copy-username"}
              onClick={() => void reveal.copyUsername(entry.username!)}
            />
          ) : null
        }
      />
      <VaultFieldRow
        label="Password"
        value={
          !entry.hasPassword ? (
            <Dash />
          ) : reveal.password !== null ? (
            <>
              <span className="block break-all font-mono-broadcast text-sm tabular-nums text-foreground">{reveal.password}</span>
              <HidesCaption />
            </>
          ) : (
            <Masked dots="••••••••••" />
          )
        }
        reveal={
          entry.hasPassword ? (
            <SlotButton
              label={reveal.password !== null ? "Hide password" : "Show password"}
              icon={reveal.password !== null ? EyeOff : Eye}
              busy={reveal.busy === "show-password"}
              onClick={() => void reveal.togglePassword()}
            />
          ) : null
        }
        copy={
          entry.hasPassword ? (
            <SlotButton
              label="Copy password"
              icon={Copy}
              busy={reveal.busy === "copy-password"}
              done={reveal.copied === "copy-password"}
              onClick={() => void reveal.copyPassword()}
            />
          ) : null
        }
      />
      <VaultFieldRow
        label="2FA code"
        value={
          !entry.hasTotp ? <Dash /> : reveal.totp ? <TotpValue {...reveal.totp} /> : <Masked dots="••• •••" />
        }
        reveal={
          entry.hasTotp && !reveal.totp ? (
            <SlotButton
              label="Show code"
              icon={Eye}
              busy={reveal.busy === "totp"}
              onClick={(event) => {
                focusCopyAfterShow.current = event.currentTarget.matches(":focus-visible");
                void reveal.showTotp();
              }}
            />
          ) : null
        }
        copy={
          reveal.totp ? (
            <div ref={totpCopyRef} className="flex">
              <SlotButton label="Copy 2FA code" icon={Copy} done={reveal.copied === "copy-totp"} onClick={reveal.copyTotp} />
            </div>
          ) : null
        }
      />
      {full ? (
        <VaultFieldRow
          label="Notes"
          value={entry.hasNotes ? <span className="text-sm text-muted-foreground">Saved (encrypted)</span> : <Dash />}
          reveal={
            entry.hasNotes ? (
              <SlotButton
                label={reveal.notes !== null ? "Hide notes" : "Show notes"}
                icon={reveal.notes !== null ? EyeOff : Eye}
                busy={reveal.busy === "notes"}
                onClick={() => void reveal.toggleNotes()}
              />
            ) : null
          }
          expanded={
            reveal.notes !== null ? (
              <div className="rounded-md border border-border bg-background p-3">
                <p className="whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere]">{reveal.notes}</p>
                <HidesCaption />
              </div>
            ) : null
          }
        />
      ) : null}
    </VaultFieldList>
  );
}
