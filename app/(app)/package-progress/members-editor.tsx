"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
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
  className?: string;
  disabled?: boolean;
};

const CHIP_CLASS =
  "mention-chip inline-flex items-center gap-1 rounded-md bg-secondary text-foreground align-baseline text-[12px] font-medium leading-none px-2 py-[3px]";

function pickFirstName(user: MembersEditorUser): string {
  const source = user.name?.trim() || user.email?.split("@")[0]?.trim() || "User";
  return source.split(/\s+/)[0] ?? "User";
}

function displayName(user: MembersEditorUser): string {
  return user.name?.trim() || user.email || "User";
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

export function MembersEditor({
  memberUserIds,
  users,
  onChangeAction,
  className,
  disabled = false
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
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
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((user) => {
        const name = user.name?.toLowerCase() ?? "";
        const email = user.email?.toLowerCase() ?? "";
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 8);
  }, [users, selectedIds, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (event.target instanceof Node && rootRef.current.contains(event.target)) return;
      setOpen(false);
      setQuery("");
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
    inputRef.current?.focus();
  }

  function removeMember(userId: string) {
    commit(memberUserIds.filter((id) => id !== userId));
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {selected.map((user) => (
          <span key={user.id} className={CHIP_CLASS} title={displayName(user)}>
            {pickFirstName(user)}
            {!disabled ? (
              <button
                type="button"
                aria-label={`Remove ${pickFirstName(user)}`}
                onClick={() => removeMember(user.id)}
                className="rounded-sm p-0.5 text-muted-foreground hover:bg-black/20 light:hover:bg-foreground/5 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        ))}
        {selected.length === 0 && disabled ? (
          <span className="text-xs text-muted-foreground">No members linked</span>
        ) : null}

        {!disabled ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setOpen((prev) => !prev);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2.5 py-[3px] text-[12px] font-medium leading-none text-foreground transition hover:bg-secondary"
            >
              <Plus className="h-3 w-3" />
              Add members
            </button>

            {open ? (
              <div className="absolute right-0 top-full z-40 mt-1 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    ref={inputRef}
                    value={query}
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
                    className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {matches.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      {query.trim() ? "No matching people." : "Everyone is already linked."}
                    </p>
                  ) : (
                    matches.map((user, index) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => addMember(user.id)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-3 py-2 text-left",
                          index === activeIndex
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-accent/60"
                        )}
                      >
                        <span className="text-xs font-medium">{displayName(user)}</span>
                        {user.email ? (
                          <span className="truncate text-[10px] text-muted-foreground">
                            {user.email}
                          </span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default MembersEditor;
