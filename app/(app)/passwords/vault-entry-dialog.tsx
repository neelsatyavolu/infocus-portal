"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  VAULT_ACTION_LABELS,
  VAULT_NAME_MAX,
  VAULT_NOTES_MAX,
  VAULT_PASSWORD_MAX,
  VAULT_TOTP_MAX,
  VAULT_URL_MAX,
  VAULT_USERNAME_MAX,
  type VaultActivityRow,
  type VaultEntrySummary
} from "@/src/lib/password-vault";
import { generateStrongPassword } from "@/src/lib/password-strength";
import { cn } from "@/src/lib/utils";
import { PasswordStrengthMeter } from "./password-strength-meter";
import { revealVaultValue, vaultRequest } from "./vault-api";

const inputClass =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-[var(--brand-green)]/50 focus:ring-1 focus:ring-[var(--brand-green)]/30";

/** Saved secret in edit mode: keep it, replace it, or remove it. */
type SecretMode = "keep" | "replace" | "remove";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="eyebrow">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function SavedSecret({ label, mode, onMode }: { label: string; mode: SecretMode; onMode: (mode: SecretMode) => void }) {
  return (
    <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 text-sm">
      <span className={cn(mode === "remove" ? "text-amber-300" : "text-muted-foreground")}>
        {mode === "remove" ? `${label} will be removed` : `${label} saved (encrypted)`}
      </span>
      <span className="flex gap-3 text-xs font-semibold">
        {mode === "remove" ? (
          <button type="button" className="text-foreground hover:underline" onClick={() => onMode("keep")}>
            Undo
          </button>
        ) : (
          <>
            <button type="button" className="text-foreground hover:underline" onClick={() => onMode("replace")}>
              Replace
            </button>
            <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => onMode("remove")}>
              Remove
            </button>
          </>
        )}
      </span>
    </div>
  );
}

export function VaultEntryDialog({
  open,
  entry,
  onOpenChange,
  onSaved
}: {
  open: boolean;
  entry: VaultEntrySummary | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const editing = Boolean(entry);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totp, setTotp] = useState("");
  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [passwordMode, setPasswordMode] = useState<SecretMode>("replace");
  const [totpMode, setTotpMode] = useState<SecretMode>("replace");
  const [activity, setActivity] = useState<VaultActivityRow[]>([]);
  const [busy, setBusy] = useState<"save" | "delete" | "notes" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(entry?.name ?? "");
    setUrl(entry?.url ?? "");
    setUsername(entry?.username ?? "");
    setPassword("");
    setShowPassword(false);
    setTotp("");
    setNotes("");
    setNotesLoaded(!entry?.hasNotes);
    setPasswordMode(entry?.hasPassword ? "keep" : "replace");
    setTotpMode(entry?.hasTotp ? "keep" : "replace");
    setActivity([]);
    setConfirmDelete(false);
    setError(null);
    if (entry) {
      vaultRequest<VaultActivityRow[]>(`/api/vault/${entry.id}/activity`)
        .then(setActivity)
        .catch(() => setActivity([]));
    }
  }, [open, entry]);

  async function loadNotes() {
    if (!entry) return;
    setBusy("notes");
    try {
      setNotes((await revealVaultValue(entry.id, "notes")).value);
      setNotesLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load notes.");
    } finally {
      setBusy(null);
    }
  }

  function secretValue(mode: SecretMode, value: string) {
    if (mode === "remove") return "";
    if (mode === "keep" || (editing && !value)) return undefined;
    return value;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy("save");
    setError(null);
    const body = {
      name: name.trim(),
      url,
      username,
      password: secretValue(passwordMode, password),
      totp: secretValue(totpMode, totp),
      notes: notesLoaded ? notes : undefined
    };
    try {
      await vaultRequest(entry ? `/api/vault/${entry.id}` : "/api/vault", {
        method: entry ? "PATCH" : "POST",
        body
      });
      onSaved();
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!entry) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy("delete");
    try {
      await vaultRequest(`/api/vault/${entry.id}`, { method: "DELETE" });
      onSaved();
      onOpenChange(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${entry?.name}` : "Add password"}</DialogTitle>
          <DialogDescription>
            Shared with associate producers, executive producers, and advisers. Every view is logged.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void save(event)} className="space-y-3" autoComplete="off">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={VAULT_NAME_MAX} placeholder="InFocus YouTube" className={inputClass} autoFocus />
          </Field>
          <Field label="Website">
            <input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={VAULT_URL_MAX} placeholder="youtube.com" className={inputClass} inputMode="url" />
          </Field>
          <Field label="Username or email">
            <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={VAULT_USERNAME_MAX} className={inputClass} autoComplete="off" />
          </Field>

          <Field label="Password">
            {passwordMode === "replace" ? (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    maxLength={VAULT_PASSWORD_MAX}
                    placeholder={entry?.hasPassword ? "New password" : ""}
                    className={cn(inputClass, "pr-9 font-mono-broadcast")}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <PasswordStrengthMeter
                  password={password}
                  onSuggest={() => {
                    setPassword(generateStrongPassword());
                    setShowPassword(true);
                  }}
                />
              </div>
            ) : (
              <SavedSecret label="Password" mode={passwordMode} onMode={setPasswordMode} />
            )}
          </Field>

          <Field label="2FA setup key" hint={totpMode === "replace" ? "Paste the setup key or otpauth:// link from the site’s authenticator setup. It can’t be viewed again, only its codes." : undefined}>
            {totpMode === "replace" ? (
              <input
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                maxLength={VAULT_TOTP_MAX}
                placeholder="JBSW Y3DP EHPK 3PXP"
                className={cn(inputClass, "font-mono-broadcast")}
                autoComplete="off"
                spellCheck={false}
              />
            ) : (
              <SavedSecret label="2FA key" mode={totpMode} onMode={setTotpMode} />
            )}
          </Field>

          <Field label="Notes" hint={notesLoaded ? "Recovery codes, security answers, who owns the account." : undefined}>
            {notesLoaded ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={VAULT_NOTES_MAX}
                rows={3}
                className={cn(inputClass, "h-auto min-h-[4.5rem] resize-y py-2")}
              />
            ) : (
              <button
                type="button"
                onClick={() => void loadNotes()}
                disabled={busy === "notes"}
                className="flex h-9 w-full items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                {busy === "notes" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Notes saved (encrypted) · Edit notes
              </button>
            )}
          </Field>

          {error ? (
            <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">{error}</p>
          ) : null}

          {editing && activity.length ? (
            <div className="space-y-1.5 border-t border-border pt-3">
              <span className="eyebrow">Recent activity</span>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {activity.map((row) => (
                  <li key={row.id} className="flex justify-between gap-3">
                    <span className="truncate">
                      <span className="text-foreground">{row.actor}</span> · {VAULT_ACTION_LABELS[row.action] ?? row.action}
                    </span>
                    <span className="shrink-0 font-mono-broadcast tabular-nums">
                      {new Date(row.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <DialogFooter className="gap-2 pt-1 sm:justify-between">
            {entry?.canDelete ? (
              <Button type="button" variant="destructive" size="sm" onClick={() => void remove()} disabled={busy !== null}>
                {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {confirmDelete ? "Delete permanently" : "Delete"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy !== null}>
                {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {editing ? "Save" : "Add password"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
