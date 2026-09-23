"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/src/lib/utils";

type DirectoryUser = {
  id: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
};

function initials(name: string | null, email: string | null) {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function ViewAsMenu({
  currentUser,
  canViewAs,
  viewingAs,
  children
}: {
  currentUser: { name: string | null; email: string | null; imageUrl: string | null };
  canViewAs: boolean;
  viewingAs: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<DirectoryUser[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || users) return;
    let cancelled = false;
    void fetch("/api/auth/view-as/users", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { data?: DirectoryUser[]; error?: { message?: string } };
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message ?? "Could not load users.");
        }
        if (!cancelled) setUsers(body.data);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load users.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, users]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users ?? [];
    return (users ?? []).filter((user) => {
      const haystack = `${user.name ?? ""} ${user.email ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, users]);

  async function choose(userId: string | null) {
    setSavingId(userId ?? "self");
    try {
      const response = await fetch("/api/auth/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Could not switch user.");
      }
      window.location.assign("/grades");
    } catch (error) {
      setSavingId(null);
      toast.error(error instanceof Error ? error.message : "Could not switch user.");
    }
  }

  if (!canViewAs) {
    return <>{children}</>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-md px-0.5 py-0.5 text-left hover:bg-card",
          viewingAs && "ring-1 ring-amber-400/50"
        )}
        title="View as another user"
      >
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>View as</DialogTitle>
            <DialogDescription>
              See the portal as another account. Your signed-in session stays active.
            </DialogDescription>
          </DialogHeader>
          {viewingAs ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
              <span className="min-w-0 truncate">
                Viewing as {currentUser.name ?? currentUser.email ?? "this user"}
              </span>
              <Button type="button" size="sm" variant="secondary" disabled={savingId !== null} onClick={() => void choose(null)}>
                Stop
              </Button>
            </div>
          ) : null}
          <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or email"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {users == null ? (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading users…
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matching users.</p>
            ) : (
              <ul>
                {filtered.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      disabled={savingId !== null}
                      onClick={() => void choose(user.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-60"
                    >
                      {user.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.imageUrl}
                          alt=""
                          width={24}
                          height={24}
                          className="h-6 w-6 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[10px] font-bold">
                          {initials(user.name, user.email)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">{user.name ?? "Unnamed"}</span>
                        <span className="block truncate text-xs text-muted-foreground">{user.email ?? "no-email"}</span>
                      </span>
                      {savingId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
