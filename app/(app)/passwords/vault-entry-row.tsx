"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Eye, EyeOff, Loader2, Pencil, ShieldCheck, StickyNote, Wifi } from "lucide-react";
import type { VaultEntrySummary } from "@/src/lib/password-vault";
import { cn } from "@/src/lib/utils";
import { copyToClipboard, revealVaultTotp, revealVaultValue } from "./vault-api";

/** Revealed secrets are wiped from the page after this long. */
const REVEAL_MS = 30_000;

type TotpState = { code: string; expiresAt: number; period: number };

function hostLabel(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function hostname(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const WIFI_NAME = /wi-?fi/i;

/**
 * Wi-Fi icon for Wi-Fi entries, else the site favicon (via
 * /api/vault/favicon), else the first letter.
 */
function SiteIcon({ name, url }: { name: string; url: string | null }) {
  const host = hostname(url);
  const [failed, setFailed] = useState(false);
  const tile = "grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-[var(--ink-3)]";

  if (WIFI_NAME.test(name)) {
    return (
      <span className={tile}>
        <Wifi className="h-4 w-4 text-foreground" aria-hidden />
      </span>
    );
  }

  if (!host || failed) {
    return (
      <span className={cn(tile, "font-display text-sm font-bold text-foreground")}>
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <span className={cn(tile, "overflow-hidden bg-foreground/[0.06]")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/vault/favicon?host=${encodeURIComponent(host)}`}
        alt=""
        width={20}
        height={20}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-5 w-5 object-contain"
      />
    </span>
  );
}

function IconButton({
  label,
  onClick,
  busy,
  done,
  children
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground active:scale-[0.94] disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : done ? (
        <Check className="h-3.5 w-3.5 text-[var(--brand-green)]" />
      ) : (
        children
      )}
    </button>
  );
}

function FieldCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-lg border border-border bg-background py-0.5 pl-2.5 pr-0.5">
      <span className="eyebrow shrink-0 !text-[9px]">{label}</span>
      {children}
    </div>
  );
}

export function VaultEntryRow({
  entry,
  onEdit,
  onError
}: {
  entry: VaultEntrySummary;
  onEdit: () => void;
  onError: (message: string) => void;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [totp, setTotp] = useState<TotpState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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
    const timer = window.setTimeout(() => setCopied(null), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function run(key: string, task: () => Promise<void>) {
    setBusy(key);
    try {
      await task();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const copy = (key: string, text: string) =>
    run(key, async () => {
      await copyToClipboard(text);
      setCopied(key);
    });

  const togglePassword = () =>
    password !== null
      ? setPassword(null)
      : run("show-password", async () => setPassword((await revealVaultValue(entry.id, "password")).value));

  const copyPassword = () =>
    run("copy-password", async () => {
      await copyToClipboard(password ?? (await revealVaultValue(entry.id, "password")).value);
      setCopied("copy-password");
    });

  const toggleNotes = () =>
    notes !== null
      ? setNotes(null)
      : run("notes", async () => setNotes((await revealVaultValue(entry.id, "notes")).value));

  const showTotp = () =>
    run("totp", async () => {
      const result = await revealVaultTotp(entry.id);
      setNow(Date.now());
      setTotp({ code: result.code, expiresAt: Date.now() + result.secondsRemaining * 1000, period: result.period });
    });

  const totpSeconds = totp ? Math.max(0, Math.ceil((totp.expiresAt - now) / 1000)) : 0;

  return (
    <li className="border-b border-border last:border-b-0">
      <div className="grid gap-3 px-4 py-3 lg:grid-cols-[16rem_minmax(0,1fr)_3.75rem] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <SiteIcon key={entry.url ?? ""} name={entry.name} url={entry.url} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{entry.name}</p>
            {entry.url ? (
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1 truncate font-mono-broadcast text-[11px] text-muted-foreground hover:text-foreground"
              >
                <span className="truncate">{hostLabel(entry.url)}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <p className="font-mono-broadcast text-[11px] text-muted-foreground">No website</p>
            )}
          </div>
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <FieldCell label="User">
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{entry.username || "—"}</span>
            {entry.username ? (
              <IconButton label="Copy username" onClick={() => void copy("copy-username", entry.username!)} done={copied === "copy-username"}>
                <Copy className="h-3.5 w-3.5" />
              </IconButton>
            ) : null}
          </FieldCell>

          <FieldCell label="Pass">
            <span className={cn("min-w-0 flex-1 truncate font-mono-broadcast text-sm", password ? "text-foreground" : "text-muted-foreground")}>
              {entry.hasPassword ? (password ?? "••••••••••") : "—"}
            </span>
            {entry.hasPassword ? (
              <>
                <IconButton label={password ? "Hide password" : "Show password"} onClick={() => void togglePassword()} busy={busy === "show-password"}>
                  {password ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </IconButton>
                <IconButton label="Copy password" onClick={() => void copyPassword()} busy={busy === "copy-password"} done={copied === "copy-password"}>
                  <Copy className="h-3.5 w-3.5" />
                </IconButton>
              </>
            ) : null}
          </FieldCell>

          <FieldCell label="2FA">
            {entry.hasTotp ? (
              totp ? (
                <>
                  <span className="min-w-0 flex-1 truncate font-mono-broadcast text-sm font-semibold tracking-[0.12em] text-foreground tabular-nums">
                    {totp.code.replace(/^(\d{3})(\d+)$/, "$1 $2")}
                  </span>
                  <span className={cn("shrink-0 font-mono-broadcast text-[10px] tabular-nums", totpSeconds <= 5 ? "text-amber-300" : "text-muted-foreground")}>
                    {totpSeconds}s
                  </span>
                  <IconButton label="Copy 2FA code" onClick={() => void copy("copy-totp", totp.code)} done={copied === "copy-totp"}>
                    <Copy className="h-3.5 w-3.5" />
                  </IconButton>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void showTotp()}
                  disabled={busy === "totp"}
                  className="inline-flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {busy === "totp" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  Show code
                </button>
              )
            ) : (
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">—</span>
            )}
          </FieldCell>
        </div>

        <div className="flex items-center justify-end gap-1">
          {entry.hasNotes ? (
            <IconButton label={notes !== null ? "Hide notes" : "Show notes"} onClick={() => void toggleNotes()} busy={busy === "notes"}>
              <StickyNote className={cn("h-3.5 w-3.5", notes !== null && "text-[var(--brand-green)]")} />
            </IconButton>
          ) : (
            <span className="hidden h-7 w-7 lg:block" aria-hidden />
          )}
          <IconButton label={`Edit ${entry.name}`} onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {notes !== null ? (
        <p className="mx-4 mb-3 whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
          {notes}
        </p>
      ) : null}
    </li>
  );
}
