import { Users } from "lucide-react";
import { initialsFor } from "@/components/kit/avatar";

/**
 * The 32px square at the start of every inbox row and thread bar: a group icon for a package
 * chat, initials for a person. Ink 4, so it still shows on an Ink 3 row hover.
 */
export function ChatTile({ kind, name }: { kind: "GROUP" | "DIRECT"; name: string }) {
  return (
    <span
      aria-hidden
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--ink-4)] text-xs font-medium text-[var(--ink-text)]"
    >
      {kind === "GROUP" ? <Users className="h-4 w-4" /> : initialsFor(name)}
    </span>
  );
}
