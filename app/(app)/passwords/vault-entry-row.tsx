import { ShieldCheck, Users } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import type { VaultEntrySummary } from "@/src/lib/password-vault";
import { SiteIcon, hostLabel } from "./site-icon";

/** "abby@example.edu · youtube.com": the username and website, whichever exist, else "No website". */
function secondaryLine(entry: VaultEntrySummary) {
  const parts = [entry.username, entry.url ? hostLabel(entry.url) : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No website";
}

/**
 * The summary line of one login in the list: site icon, name, a muted second line (username and
 * website) and a compact status slot, so the name keeps its room in the 22rem list and on
 * phones: a shield mark when 2FA is on and, for execs, a green Shared tag with just the count
 * (the words are in the hover title and for screen readers). Render it inside a 3-column grid
 * (`grid-cols-[2.25rem_minmax(0,1fr)_auto]`).
 */
export function VaultEntryRow({ entry }: { entry: VaultEntrySummary }) {
  const shared = entry.canShare && entry.sharedWith > 0;
  return (
    <>
      <SiteIcon name={entry.name} url={entry.url} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{entry.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{secondaryLine(entry)}</span>
      </span>
      <span className="flex items-center justify-end gap-1.5">
        {entry.hasTotp ? (
          <span title="2FA on" className="flex text-muted-foreground">
            <ShieldCheck aria-hidden className="h-4 w-4" />
            <span className="sr-only">2FA on</span>
          </span>
        ) : null}
        {shared ? (
          <StatusTag
            tone="success"
            size="sm"
            icon={Users}
            title={`Shared with ${entry.sharedWith}`}
            srLabel="Shared with "
          >
            {entry.sharedWith}
          </StatusTag>
        ) : null}
      </span>
    </>
  );
}
