import type { VaultCounts } from "./vault-logic";

const NUM = "tabular-nums font-mono-broadcast text-[var(--ink-text)]";

/**
 * "24 logins · 9 with 2FA", or "3 of 24 logins" while a search or chip is on. Beside the
 * All / Shared chips (which already show the total) pass `showTotal={false}`: only "9 with 2FA".
 * The live region always renders, so a filter change is announced.
 */
export function VaultCount({
  visible,
  counts,
  filtered,
  showTotal = true
}: {
  visible: number;
  counts: VaultCounts;
  filtered: boolean;
  showTotal?: boolean;
}) {
  const noun = counts.all === 1 ? "login" : "logins";
  const totp =
    counts.withTotp > 0 ? (
      <>
        <span className={NUM}>{counts.withTotp}</span> with 2FA
      </>
    ) : null;

  let content = null;
  if (filtered) {
    content = (
      <>
        <span className={NUM}>{visible}</span> of <span className={NUM}>{counts.all}</span> {noun}
      </>
    );
  } else if (showTotal) {
    content = (
      <>
        <span className={NUM}>{counts.all}</span> {noun}
        {totp ? <> · {totp}</> : null}
      </>
    );
  } else {
    content = totp;
  }

  return (
    <p aria-live="polite" className="whitespace-nowrap text-xs text-muted-foreground">
      {content}
    </p>
  );
}
