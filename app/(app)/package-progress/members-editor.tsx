"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { AlertTriangle, Plus, Search, X } from "lucide-react";
import { Sheet } from "@/components/kit/sheet";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { lastCycleGroupmatesAmong } from "@/src/lib/consecutive-groupmates";
import { serializeGroupMembers, type GroupMemberToken } from "@/src/lib/group-members";
import { cn } from "@/src/lib/utils";

export type MembersEditorUser = {
  id: string;
  name: string | null;
  email: string | null;
};

type Props = {
  memberUserIds: string[];
  users: MembersEditorUser[];
  onChangeAction: (next: { memberUserIds: string[]; groupMembers: string }) => void;
  /** Flags people in the picker who shared a group last cycle with a current member. */
  previousTeammatesByUser?: Record<string, string[]>;
  className?: string;
  disabled?: boolean;
  /** Accessible name of the "+ Add" button (name the group, so rows can be told apart). */
  addLabel?: string;
  /** Shown before "+ Add" while nobody is linked (e.g. a "No members" warning tag). */
  emptyHint?: ReactNode;
};

const MAX_MATCHES = 8;

/**
 * A member chip: 24px, first name, full name on hover. Ink 3, stepping up to Ink 4 while its row
 * is hovered or has its menu open (the row itself turns Ink 3 then).
 */
export const MEMBER_CHIP_CLASS =
  "inline-flex h-6 max-w-full items-center gap-0.5 rounded-sm bg-[var(--ink-3)] px-2 text-xs font-medium text-foreground group-hover/row:bg-[var(--ink-4)] group-data-[menu-open=true]/row:bg-[var(--ink-4)]";

function pickFirstName(user: MembersEditorUser): string {
  const source = user.name?.trim() || user.email?.split("@")[0]?.trim() || "User";
  return source.split(/\s+/)[0] ?? "User";
}

function displayName(user: MembersEditorUser): string {
  return user.name?.trim() || user.email || "User";
}

// The picker portals out of the row; React events still bubble through it, so keep the row's
// click and right-click out of it.
function stop(event: SyntheticEvent) {
  event.stopPropagation();
}

/** Keep the legacy groupMembers string in sync so cut-status matching still works. */
export function buildGroupMembersString(
  userIds: string[],
  usersById: Map<string, MembersEditorUser>
): string {
  const tokens: GroupMemberToken[] = [];
  for (const id of userIds) {
    const user = usersById.get(id);
    if (!user) continue;
    if (tokens.length > 0) {
      tokens.push({ kind: "text", value: ", " });
    }
    tokens.push({ kind: "user", userId: id, firstName: pickFirstName(user) });
  }
  return serializeGroupMembers(tokens);
}

/**
 * Linked members as a tag input: chips with a remove button, and "+ Add" opening a people picker
 * (a popover under the field on desktop, a bottom sheet on phones so the keyboard and the tab
 * bar never cover it). The picker stays open for several adds; ↑/↓ move, Enter adds, Esc closes.
 */
export function MembersEditor({
  memberUserIds,
  users,
  onChangeAction,
  previousTeammatesByUser = {},
  className,
  disabled = false,
  addLabel = "Add members",
  emptyHint
}: Props) {
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const escapedRef = useRef(false);
  const listId = useId();
  const wide = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const selected = useMemo(
    () =>
      memberUserIds
        .map((id) => usersById.get(id))
        .filter((user): user is MembersEditorUser => Boolean(user)),
    [memberUserIds, usersById]
  );

  const selectedIds = useMemo(() => new Set(memberUserIds), [memberUserIds]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = users.filter((user) => !selectedIds.has(user.id));
    if (!q) return pool.slice(0, MAX_MATCHES);
    return pool
      .filter((user) => {
        const name = user.name?.toLowerCase() ?? "";
        const email = user.email?.toLowerCase() ?? "";
        return name.includes(q) || email.includes(q);
      })
      .slice(0, MAX_MATCHES);
  }, [users, selectedIds, query]);

  // A new search or a reopened picker starts at the first match (adjusted during render).
  const [indexFor, setIndexFor] = useState({ query, open });
  if (indexFor.query !== query || indexFor.open !== open) {
    setIndexFor({ query, open });
    setActiveIndex(0);
  }

  // Opening the picker puts the cursor in its search box. The desktop popover does it in
  // onOpenAutoFocus; the phone sheet focuses its panel after a tap, so move focus once it has.
  useEffect(() => {
    if (!open || wide) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, wide]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function commit(nextIds: string[]) {
    const unique = [...new Set(nextIds)];
    onChangeAction({
      memberUserIds: unique,
      groupMembers: buildGroupMembersString(unique, usersById)
    });
  }

  function addMember(userId: string) {
    if (selectedIds.has(userId)) return;
    commit([...memberUserIds, userId]);
    setQuery("");
    setActiveIndex(0);
    // Phones: don't pop the keyboard back up after a tap on a name.
    if (wide) inputRef.current?.focus();
  }

  function removeMember(userId: string) {
    commit(memberUserIds.filter((id) => id !== userId));
  }

  const activeOptionId = matches[activeIndex] ? `${listId}-option-${activeIndex}` : undefined;

  const picker = (
    <div onClick={stop} onPointerDown={stop} onContextMenu={stop} className="min-w-0">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring md:h-9">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (matches.length === 0) return;
              setActiveIndex((i) => (i + 1) % matches.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (matches.length === 0) return;
              setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const pick = matches[activeIndex];
              if (pick) addMember(pick.id);
            }
          }}
          placeholder="Search by name or email…"
          aria-label="Search people to add"
          className="h-full w-full min-w-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
      {matches.length === 0 ? (
        <p className="px-3 py-3 text-[13px] text-muted-foreground">
          {query.trim() ? "No matching people." : "Everyone is already linked."}
        </p>
      ) : null}
      <div id={listId} role="listbox" aria-label="People" className={cn("max-h-64 overflow-y-auto p-1", matches.length === 0 && "hidden")}>
        {matches.map((user, index) => {
          const repeats = lastCycleGroupmatesAmong(user.id, memberUserIds, previousTeammatesByUser)
            .map((id) => usersById.get(id))
            .filter((other): other is MembersEditorUser => Boolean(other))
            .map(pickFirstName);
          const active = index === activeIndex;
          return (
            <div
              key={user.id}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={active}
              // Keep focus in the search box so typing and Enter keep working after a click.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addMember(user.id)}
              className={cn(
                "flex min-h-10 cursor-pointer flex-col justify-center gap-0.5 rounded-sm px-2 py-1.5",
                active ? "bg-[var(--ink-3)]" : "hover:bg-[var(--ink-3)]"
              )}
            >
              <span className="text-[13px] font-medium text-foreground">{displayName(user)}</span>
              {user.email ? <span className="truncate text-xs text-muted-foreground">{user.email}</span> : null}
              {repeats.length > 0 ? (
                <span className="flex items-center gap-1 text-xs font-medium text-[var(--brand-amber)]">
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                  Same group last cycle as {repeats.join(", ")}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );

  const field = (
    <div
      ref={fieldRef}
      className={cn(
        // 40px in card mode (touch), 32px in table mode: the same line height as the other cells.
        "flex min-h-10 min-w-0 flex-wrap items-center gap-1 rounded-md @4xl:min-h-8",
        disabled
          ? "py-1"
          : "-mx-1 border border-transparent p-[3px] group-hover/row:border-input focus-within:border-input pointer-coarse:border-input"
      )}
    >
      {selected.map((user) => (
        <span key={user.id} className={cn(MEMBER_CHIP_CLASS, !disabled && "pr-0.5")} title={displayName(user)}>
          <span className="truncate">{pickFirstName(user)}</span>
          {!disabled ? (
            <button
              type="button"
              aria-label={`Remove ${pickFirstName(user)}`}
              onClick={() => removeMember(user.id)}
              className="relative grid h-5 w-5 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:after:absolute max-lg:after:-inset-2.5"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          ) : null}
        </span>
      ))}
      {selected.length === 0 && disabled ? (
        <span className="text-xs text-muted-foreground">No members linked</span>
      ) : null}
      {selected.length === 0 && !disabled ? emptyHint : null}
      {!disabled ? (
        <button
          ref={addButtonRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={addLabel}
          onClick={() => (open ? close() : setOpen(true))}
          // 24px to sit with the chips; the hit area grows to 40px tall on touch-size screens.
          className="relative inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--ink-4)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:after:absolute max-lg:after:-inset-x-1 max-lg:after:-inset-y-2"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add
        </button>
      ) : null}
    </div>
  );

  return (
    <div className={cn("relative min-w-0", className)}>
      <Popover open={open && wide} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <PopoverAnchor asChild>{field}</PopoverAnchor>
        {wide ? (
          <PopoverContent
            className="w-80 overflow-hidden p-0"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
            onEscapeKeyDown={() => {
              escapedRef.current = true;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (escapedRef.current) addButtonRef.current?.focus();
              escapedRef.current = false;
            }}
            onInteractOutside={(event) => {
              // Clicks on the field itself (chips, "+ Add") are handled there.
              const target = event.detail.originalEvent.target;
              if (target instanceof Node && fieldRef.current?.contains(target)) event.preventDefault();
            }}
          >
            {picker}
          </PopoverContent>
        ) : null}
      </Popover>
      {!wide ? (
        // The sheet (and its scrim) portal out, but React events still bubble to the row.
        <div className="contents" onClick={stop} onContextMenu={stop}>
          <Sheet
            open={open}
            onOpenChange={(next) => (next ? setOpen(true) : close())}
            side="bottom"
            title="Add members"
            bodyClassName="p-0 md:p-0"
            footer={
              <Button type="button" onClick={close}>
                Done
              </Button>
            }
          >
            {picker}
          </Sheet>
        </div>
      ) : null}
    </div>
  );
}

export default MembersEditor;
