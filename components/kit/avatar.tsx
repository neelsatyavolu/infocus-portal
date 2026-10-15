import type { ReactNode } from "react";
import { renderIcon, type KitIcon } from "@/components/kit/icon";
import { cn } from "@/src/lib/utils";

/** "Abby Lane" → "AL"; falls back to the email's first letter, then "?". */
export function initialsFor(name?: string | null, email?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const local = (email ?? "").trim();
  return local ? local[0].toUpperCase() : "?";
}

const SIZE: Record<20 | 24 | 28 | 32 | 36 | 40, string> = {
  20: "h-5 w-5 text-[9px]",
  24: "h-6 w-6 text-[10px]",
  28: "h-7 w-7 text-[11px]",
  32: "h-8 w-8 text-xs",
  36: "h-9 w-9 text-[13px]",
  40: "h-10 w-10 text-sm"
};

/**
 * A person: their picture, or initials on one neutral tone (no rotating colors). Circles are
 * allowed for avatars (DESIGN.md §10). `shape="square"` for group chats and tiles in lists.
 */
export function Avatar({
  name,
  email,
  initials,
  imageUrl,
  size = 32,
  shape = "circle",
  title,
  className
}: {
  name?: string | null;
  email?: string | null;
  initials?: string;
  imageUrl?: string | null;
  size?: 20 | 24 | 28 | 32 | 36 | 40;
  shape?: "circle" | "square";
  title?: string;
  className?: string;
}) {
  const label = title ?? name ?? email ?? undefined;
  return (
    <span
      title={label}
      className={cn(
        "relative inline-grid shrink-0 select-none place-items-center overflow-hidden bg-[var(--ink-4)] font-medium leading-none text-foreground",
        shape === "circle" ? "rounded-full" : "rounded-md",
        SIZE[size],
        className
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote profile pictures of any host, tiny size
        <img src={imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
      ) : (
        <span aria-hidden>{initials ?? initialsFor(name, email)}</span>
      )}
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

/** Up to `max` overlapping avatars, then "+N". */
export function AvatarStack({
  people,
  max = 3,
  size = 24,
  className
}: {
  people: Array<{ id: string; name?: string | null; email?: string | null; imageUrl?: string | null }>;
  max?: number;
  size?: 20 | 24 | 28 | 32;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className={cn("inline-flex items-center", className)}>
      {shown.map((person, index) => (
        <Avatar
          key={person.id}
          name={person.name}
          email={person.email}
          imageUrl={person.imageUrl}
          size={size}
          className={cn("ring-2 ring-[hsl(var(--card))]", index > 0 && "-ml-1.5")}
        />
      ))}
      {extra > 0 ? (
        <span
          title={people.slice(max).map((person) => person.name ?? person.email ?? "").filter(Boolean).join(", ")}
          className={cn(
            "-ml-1.5 inline-grid place-items-center rounded-full bg-[var(--ink-3)] font-mono-broadcast font-medium tabular-nums text-muted-foreground ring-2 ring-[hsl(var(--card))]",
            SIZE[size]
          )}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

/** A square tile holding a 16–20px icon, so leading icons on cards and rows share one size. */
export function IconTile({
  icon,
  tone = "neutral",
  size = 40,
  className
}: {
  icon: KitIcon | ReactNode;
  tone?: "brand" | "neutral";
  size?: 32 | 36 | 40;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-md",
        size === 32 ? "h-8 w-8" : size === 36 ? "h-9 w-9" : "h-10 w-10",
        size === 40 ? "[&>svg]:size-5" : "[&>svg]:size-4",
        // A green tint (not --ink, which is white in Light mode and would vanish on a card).
        tone === "brand" ? "bg-[var(--brand-green)]/10 text-[var(--brand-green)]" : "bg-[var(--ink-3)] text-muted-foreground",
        className
      )}
    >
      {renderIcon(icon, size === 40 ? "h-5 w-5" : "h-4 w-4")}
    </span>
  );
}
