"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { Avatar } from "@/components/kit/avatar";
import { SearchField } from "@/components/kit/search-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getMemberDisplayName } from "@/components/project-assets/format";
import type { MediaTileItem, WorkspaceMemberOption } from "@/components/project-assets/types";

function StateLine({ children }: { children: string }) {
  return <p className="rounded-md border border-border px-3 py-2.5 text-sm text-muted-foreground">{children}</p>;
}

/** Pick workspace members to put on a Final Cut video. Key it by media id so the search resets. */
export default function AddPeopleDialog({
  open,
  item,
  members,
  loading,
  loaded,
  error,
  busy,
  onAdd,
  onClose
}: {
  open: boolean;
  item: MediaTileItem | null;
  members: WorkspaceMemberOption[];
  loading: boolean;
  loaded: boolean;
  /** Loading people or saving failed (shown here, not behind the dialog). */
  error: string | null;
  busy: boolean;
  onAdd: (mediaId: string, userId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const assignedIds = new Set(item?.assignedMembers.map((member) => member.userId) ?? []);
  const available = members.filter((member) => !assignedIds.has(member.userId));
  const query = search.trim().toLowerCase();
  const filtered = available.filter((member) => {
    if (!query) {
      return true;
    }
    const name = member.name?.toLowerCase() ?? "";
    const email = member.email?.toLowerCase() ?? "";
    return name.includes(query) || email.includes(query);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && busy) return;
        if (!isOpen) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add people</DialogTitle>
          <DialogDescription>{item ? `Add people to ${item.title}.` : "Add people to this video."}</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-3">
          {error ? (
            <Alert tone="danger" compact>
              {error}
            </Alert>
          ) : null}
          {item === null ? (
            <StateLine>Video not found.</StateLine>
          ) : loading && !loaded ? (
            <StateLine>Loading people…</StateLine>
          ) : members.length === 0 ? (
            <StateLine>No workspace members found.</StateLine>
          ) : available.length === 0 ? (
            <StateLine>Everyone in this workspace is already assigned.</StateLine>
          ) : (
            <>
              <SearchField value={search} onChange={setSearch} placeholder="Search by name or email" ariaLabel="Search people" />
              {filtered.length === 0 ? (
                <StateLine>No members match your search.</StateLine>
              ) : (
                <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
                  {filtered.map((member) => {
                    const name = getMemberDisplayName(member);
                    return (
                      <li key={member.userId} className="flex min-h-14 items-center gap-3 px-3 py-2">
                        <Avatar name={name} email={member.email} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">{name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{member.email ?? "Workspace member"}</span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => onAdd(item.id, member.userId)}
                          className="[@media(hover:none)]:h-10"
                        >
                          <UserPlus aria-hidden />
                          Add
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
