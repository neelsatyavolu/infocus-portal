"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Eye, EyeOff, Sparkles, Trash2 } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { Field } from "@/components/kit/field";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SubmitShortcutHint, isSubmitShortcut } from "@/components/ui/submit-shortcut";
import { Textarea } from "@/components/ui/textarea";
import {
  VAULT_NAME_MAX,
  VAULT_NOTES_MAX,
  VAULT_PASSWORD_MAX,
  VAULT_TOTP_MAX,
  VAULT_URL_MAX,
  VAULT_USERNAME_MAX,
  type VaultEntrySummary
} from "@/src/lib/password-vault";
import { generateStrongPassword } from "@/src/lib/password-strength";
import { PasswordStrengthMeter } from "./password-strength-meter";
import { SavedNotes, SavedSecret, type SecretMode } from "./saved-secret";
import { revealVaultValue, vaultRequest } from "./vault-api";

/** What a save did, so the page can select the new login or move on from a deleted one. */
export type VaultEntryChange = { kind: "created" | "updated" | "deleted"; id: string };

const MONO = "font-mono-broadcast tabular-nums";

export function VaultEntryDialog({
  open,
  entry,
  onOpenChange,
  onSaved
}: {
  open: boolean;
  entry: VaultEntrySummary | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (change: VaultEntryChange) => void;
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
  const [busy, setBusy] = useState<"save" | "delete" | "notes" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
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
    setConfirmDelete(false);
    setNameError(null);
    setError(null);
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

  async function save(event: FormEvent) {
    event.preventDefault();
    // Matches the disabled Save button: no second write while a save, delete or notes load runs.
    if (busy !== null) return;
    if (!name.trim()) {
      setNameError("Name is required.");
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
      if (entry) {
        await vaultRequest(`/api/vault/${entry.id}`, { method: "PATCH", body });
        onSaved({ kind: "updated", id: entry.id });
      } else {
        const created = await vaultRequest<{ id: string; name: string }>("/api/vault", { method: "POST", body });
        onSaved({ kind: "created", id: created.id });
      }
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
      onSaved({ kind: "deleted", id: entry.id });
      onOpenChange(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete.");
    } finally {
      setBusy(null);
    }
  }

  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (!isSubmitShortcut(event)) return;
    event.preventDefault();
    // requestSubmit() ignores the disabled Save button, so skip key repeat and busy states here.
    if (event.repeat || busy !== null) return;
    event.currentTarget.requestSubmit();
  }

  function suggestPassword() {
    setPassword(generateStrongPassword());
    setShowPassword(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${entry?.name}` : "Add password"}</DialogTitle>
          <DialogDescription>
            Shared with associate producers, executive producers, and advisers. Every view is logged.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void save(event)} onKeyDown={onFormKeyDown} className="grid gap-4" autoComplete="off">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="vault-name" error={nameError} required>
              <Input
                id="vault-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                maxLength={VAULT_NAME_MAX}
                placeholder="InFocus YouTube"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "vault-name-error" : undefined}
                autoFocus
              />
            </Field>
            <Field label="Website" htmlFor="vault-url">
              <Input
                id="vault-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                maxLength={VAULT_URL_MAX}
                placeholder="youtube.com"
                inputMode="url"
              />
            </Field>
            <Field label="Username or email" htmlFor="vault-username" span={2}>
              <Input
                id="vault-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={VAULT_USERNAME_MAX}
                autoComplete="off"
              />
            </Field>

            <Field label="Password" htmlFor={passwordMode === "replace" ? "vault-password" : undefined} span={2}>
              {passwordMode === "replace" ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Input
                        id="vault-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        maxLength={VAULT_PASSWORD_MAX}
                        placeholder={entry?.hasPassword ? "New password" : ""}
                        className={`h-10 pr-11 md:h-9 ${MONO}`}
                        autoComplete="new-password"
                        aria-describedby="vault-password-strength"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        title={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-0.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center md:h-8 md:w-8 rounded-sm text-muted-foreground transition-colors hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                      </button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={suggestPassword}
                      aria-label="Suggest strong password"
                      className="h-10 md:h-9"
                    >
                      <Sparkles aria-hidden />
                      <span className="sm:hidden">Suggest</span>
                      <span className="max-sm:hidden">Suggest strong password</span>
                    </Button>
                  </div>
                  <PasswordStrengthMeter password={password} id="vault-password-strength" />
                </div>
              ) : (
                <SavedSecret label="password" mode={passwordMode} onMode={setPasswordMode} />
              )}
            </Field>

            <Field
              label="2FA setup key"
              htmlFor={totpMode === "replace" ? "vault-totp" : undefined}
              hint={
                totpMode === "replace"
                  ? "Paste the setup key or otpauth:// link from the site’s authenticator setup. It can’t be viewed again, only its codes."
                  : undefined
              }
              span={2}
            >
              {totpMode === "replace" ? (
                <Input
                  id="vault-totp"
                  value={totp}
                  onChange={(event) => setTotp(event.target.value)}
                  maxLength={VAULT_TOTP_MAX}
                  placeholder="JBSW Y3DP EHPK 3PXP"
                  className={MONO}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="vault-totp-hint"
                />
              ) : (
                <SavedSecret label="2FA key" mode={totpMode} onMode={setTotpMode} />
              )}
            </Field>

            <Field
              label="Notes"
              htmlFor={notesLoaded ? "vault-notes" : undefined}
              hint={notesLoaded ? "Recovery codes, security answers, who owns the account." : undefined}
              span={2}
            >
              {notesLoaded ? (
                <Textarea
                  id="vault-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={VAULT_NOTES_MAX}
                  rows={3}
                  className="min-h-[4.5rem] resize-y"
                  aria-describedby="vault-notes-hint"
                />
              ) : (
                <SavedNotes busy={busy === "notes"} onEdit={() => void loadNotes()} />
              )}
            </Field>
          </div>

          {error ? (
            <Alert tone="danger" compact>
              {error}
            </Alert>
          ) : null}

          <DialogFooter
            sticky
            className="flex-row flex-wrap items-center justify-between gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:justify-between sm:space-x-0"
          >
            <div>
              {entry?.canDelete ? (
                <Button
                  type="button"
                  variant={confirmDelete ? "destructive" : "destructive-quiet"}
                  onClick={() => void remove()}
                  disabled={busy !== null}
                >
                  {busy === "delete" ? <Spinner /> : <Trash2 aria-hidden />}
                  {confirmDelete ? "Delete permanently" : "Delete"}
                </Button>
              ) : null}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <SubmitShortcutHint action="save" className="mr-1 max-sm:hidden" />
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy !== null}>
                {busy === "save" ? <Spinner /> : null}
                {editing ? "Save" : "Add password"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
