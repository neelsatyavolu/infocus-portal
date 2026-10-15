"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { KeyRound, LogOut, UserCog } from "lucide-react";
import { Avatar } from "@/components/kit/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/src/lib/utils";

const ITEM_CLASS =
  "flex min-h-10 w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] text-foreground outline-none transition-colors md:min-h-9 hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)] [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground";

/** "Abby Lane" → "AL"; the email's name when there is no name; "IF" when there is nothing. */
export function accountInitials(name: string | null, email: string | null) {
  const source = (name?.trim() || email?.split("@")[0] || "").trim();
  if (!source) return "IF";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function MenuLink({ href, icon, children, current }: { href: string; icon: ReactNode; children: ReactNode; current?: boolean }) {
  return (
    <Link href={href as never} role="menuitem" tabIndex={-1} aria-current={current ? "page" : undefined} className={ITEM_CLASS}>
      {icon}
      {children}
    </Link>
  );
}

/**
 * The account button at the right end of the top bar: the person's avatar, opening a menu with
 * who is signed in, View as (staff who may), Passwords and Sign out. Settings stays in the
 * sidebar's footer. While viewing as someone, the avatar has an amber ring (the column's notice
 * says who, with Switch user and Stop viewing) and the View as item reads "Switch or stop".
 */
export function AccountMenu({
  currentUser,
  viewingAs,
  canViewAs,
  showPasswords,
  pathname,
  onViewAs
}: {
  currentUser: { name: string | null; email: string | null; imageUrl: string | null };
  viewingAs: boolean;
  canViewAs: boolean;
  showPasswords: boolean;
  pathname: string;
  onViewAs: () => void;
}) {
  const [open, setOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const name = currentUser.name ?? "InFocus User";

  function items() {
    return Array.from(content.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? (index + 1) % list.length
        : event.key === "ArrowUp"
          ? (index - 1 + list.length) % list.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? list.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    list[next]?.focus();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Account: ${name}${viewingAs ? " (viewing as)" : ""}`}
          aria-haspopup="menu"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:w-9"
        >
          <Avatar
            name={currentUser.name}
            email={currentUser.email}
            imageUrl={currentUser.imageUrl}
            initials={accountInitials(currentUser.name, currentUser.email)}
            size={32}
            title=""
            className={cn(viewingAs && "ring-2 ring-[var(--brand-amber)] ring-offset-2 ring-offset-background")}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        role="menu"
        aria-label="Account"
        align="end"
        onKeyDown={onKeyDown}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          items()[0]?.focus();
        }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a[role="menuitem"]')) setOpen(false);
        }}
        className="w-64"
      >
        <div role="presentation" className="flex items-center gap-2.5 px-2 pb-2 pt-1.5">
          <Avatar
            name={currentUser.name}
            email={currentUser.email}
            imageUrl={currentUser.imageUrl}
            initials={accountInitials(currentUser.name, currentUser.email)}
            size={32}
            title=""
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {viewingAs ? "Viewing as" : currentUser.email ?? "no-email"}
            </p>
          </div>
        </div>
        <div role="separator" className="-mx-1 my-1 h-px bg-border" />
        {canViewAs ? (
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={ITEM_CLASS}
            onClick={() => {
              setOpen(false);
              onViewAs();
            }}
          >
            <UserCog aria-hidden />
            {viewingAs ? "Switch or stop View as…" : "View as…"}
          </button>
        ) : null}
        {showPasswords ? (
          <MenuLink href="/passwords" icon={<KeyRound aria-hidden />} current={pathname.startsWith("/passwords")}>
            Passwords
          </MenuLink>
        ) : null}
        {canViewAs || showPasswords ? <div role="separator" className="-mx-1 my-1 h-px bg-border" /> : null}
        <form action="/api/auth/sign-out?returnTo=/" method="post">
          <button type="submit" role="menuitem" tabIndex={-1} className={ITEM_CLASS}>
            <LogOut aria-hidden />
            Sign out
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
