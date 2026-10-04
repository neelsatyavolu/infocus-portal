import { cn } from "@/src/lib/utils";

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

const SIZE = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-xl md:h-20 md:w-20 md:text-2xl"
} as const;

/** Initials in a circle (circles are for avatars, DESIGN.md §10). */
export function Avatar({ name, size = "md", className }: { name: string; size?: keyof typeof SIZE; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--ink-4)] font-semibold text-foreground",
        SIZE[size],
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
