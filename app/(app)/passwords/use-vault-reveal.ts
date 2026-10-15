"use client";

import { useEffect, useRef, useState } from "react";
import { copyToClipboard, revealVaultTotp, revealVaultValue } from "./vault-api";

/** Revealed secrets are wiped from the page after this long. */
const REVEAL_MS = 30_000;
const COPIED_MS = 1500;

type TotpState = { code: string; expiresAt: number; period: number };
type BusyKey = "show-password" | "copy-password" | "notes" | "totp" | "copy-username" | "copy-totp";
type CopyKey = "copy-username" | "copy-password" | "copy-totp";

const COPIED_WORDS: Record<CopyKey, string> = {
  "copy-username": "Username copied",
  "copy-password": "Password copied",
  "copy-totp": "2FA code copied"
};

/**
 * One login's revealed values. They live only in this hook's state (never storage, URLs or
 * logs). The caller keys the component by entry id, so switching logins wipes them; a new
 * `savedAt` (the entry's updatedAt after an edit) wipes them too, without remounting the
 * buttons that hold focus. Every reveal goes through POST /api/vault/:id/reveal, which logs it.
 */
export function useVaultReveal(
  entryId: string,
  savedAt: string,
  { onError, onAnnounce }: { onError: (message: string) => void; onAnnounce: (message: string) => void }
) {
  const [password, setPassword] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [totp, setTotp] = useState<TotpState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<BusyKey | null>(null);
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const [revealedFor, setRevealedFor] = useState(savedAt);
  const callbacks = useRef({ onError, onAnnounce });
  useEffect(() => {
    callbacks.current = { onError, onAnnounce };
  });

  // An edit was saved: what is on screen may be stale, so hide it (adjusting state in render).
  if (revealedFor !== savedAt) {
    setRevealedFor(savedAt);
    setPassword(null);
    setNotes(null);
    setTotp(null);
  }

  useEffect(() => {
    if (password === null) return;
    const timer = window.setTimeout(() => setPassword(null), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [password]);

  useEffect(() => {
    if (notes === null) return;
    const timer = window.setTimeout(() => setNotes(null), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [notes]);

  useEffect(() => {
    if (!totp) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= totp.expiresAt) setTotp(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [totp]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function run(key: BusyKey, task: () => Promise<void>) {
    setBusy(key);
    try {
      await task();
    } catch (error) {
      callbacks.current.onError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  function markCopied(key: CopyKey) {
    setCopied(key);
    callbacks.current.onAnnounce(COPIED_WORDS[key]);
  }

  const copyUsername = (username: string) =>
    run("copy-username", async () => {
      await copyToClipboard(username);
      markCopied("copy-username");
    });

  const togglePassword = () =>
    password !== null
      ? setPassword(null)
      : run("show-password", async () => {
          setPassword((await revealVaultValue(entryId, "password")).value);
        });

  // A hidden password is revealed (and logged) just to copy it; it stays masked on screen.
  const copyPassword = () =>
    run("copy-password", async () => {
      if (password !== null) {
        await copyToClipboard(password);
      } else {
        const revealed = (await revealVaultValue(entryId, "password")).value;
        await copyToClipboard(revealed);
      }
      markCopied("copy-password");
    });

  const toggleNotes = () =>
    notes !== null
      ? setNotes(null)
      : run("notes", async () => {
          setNotes((await revealVaultValue(entryId, "notes")).value);
        });

  const showTotp = () =>
    run("totp", async () => {
      const result = await revealVaultTotp(entryId);
      setNow(Date.now());
      setTotp({ code: result.code, expiresAt: Date.now() + result.secondsRemaining * 1000, period: result.period });
    });

  const copyTotp = () => {
    if (!totp) return;
    const code = totp.code;
    void run("copy-totp", async () => {
      await copyToClipboard(code);
      markCopied("copy-totp");
    });
  };

  return {
    password,
    notes,
    totp: totp ? { code: totp.code, seconds: Math.max(0, Math.ceil((totp.expiresAt - now) / 1000)) } : null,
    busy,
    copied,
    copyUsername,
    togglePassword,
    copyPassword,
    toggleNotes,
    showTotp,
    copyTotp
  };
}

export type VaultReveal = ReturnType<typeof useVaultReveal>;
