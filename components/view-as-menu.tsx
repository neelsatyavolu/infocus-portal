"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RotateCw, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/kit/alert";
import { Avatar } from "@/components/kit/avatar";
import { SearchField } from "@/components/kit/search-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { switchViewAs } from "@/components/shell/view-as-actions";

type DirectoryUser = {
  id: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
};

/**
 * View as: staff who may (canViewAs) pick any account to see the Portal as that person, or stop.
 * A dialog controlled with `open` / `onOpenChange` (the top bar's account menu and the in-page
 * "Viewing as" notice open it), or on its own when `open` is left out. The user list loads on
 * first open and is kept for the page's lifetime.
 */
export function ViewAsMenu({
  currentUser,
  canViewAs,
  viewingAs,
  open: openProp,
  onOpenChange
}: {
  currentUser: { name: string | null; email: string | null; imageUrl: string | null };
  canViewAs: boolean;
  viewingAs: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<DirectoryUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);

  function setOpen(next: boolean) {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  }

  useEffect(() => {
    if (!open || users) return;
    let cancelled = false;
    setLoadError(null);
    void fetch("/api/auth/view-as/users", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { data?: DirectoryUser[]; error?: { message?: string } };
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message ?? "Could not load users.");
        }
        if (!cancelled) setUsers(body.data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Could not load users.";
        setLoadError(message);
        toast.error(message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, users, attempt]);

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
      await switchViewAs(userId);
    } catch (error) {
      setSavingId(null);
      toast.error(error instanceof Error ? error.message : "Could not switch user.");
    }
  }

  if (!canViewAs) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>View as</DialogTitle>
          <DialogDescription>
            See the portal as another account. Your signed-in session stays active.
          </DialogDescription>
        </DialogHeader>
        {viewingAs ? (
          <Alert
            tone="warning"
            icon={UserCog}
            compact
            action={
              <Button type="button" size="sm" variant="outline" disabled={savingId !== null} onClick={() => void choose(null)}>
                {savingId === "self" ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Stop
              </Button>
            }
          >
            <span className="block truncate">Viewing as {currentUser.name ?? currentUser.email ?? "this user"}</span>
          </Alert>
        ) : null}
        <SearchField value={query} onChange={setQuery} placeholder="Search name or email" />
        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {users == null && loadError ? (
            <div role="alert" className="flex flex-col items-center gap-3 px-3 py-8 text-center text-sm">
              <p className="flex items-center gap-1.5 text-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                Couldn&rsquo;t load users.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((count) => count + 1)}>
                <RotateCw aria-hidden />
                Retry
              </Button>
            </div>
          ) : users == null ? (
            <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading users…
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matching users.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    disabled={savingId !== null}
                    onClick={() => void choose(user.id)}
                    className="flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)] focus-visible:outline-none disabled:opacity-60"
                  >
                    <Avatar name={user.name} email={user.email} imageUrl={user.imageUrl} size={24} title="" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{user.name ?? "Unnamed"}</span>
                      <span className="block truncate text-xs text-muted-foreground">{user.email ?? "no-email"}</span>
                    </span>
                    {savingId === user.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
