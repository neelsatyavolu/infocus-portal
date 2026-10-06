"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type WorkspaceOption = {
  id: string;
  name: string;
};

/** The shell fetches the list once per dashboard visit and passes it in (null while loading). */
export function DashboardWorkspaceSelector({ workspaces }: { workspaces: WorkspaceOption[] | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentWorkspaceId = useMemo(() => {
    if (!workspaces?.length) {
      return "";
    }

    const fromQuery = searchParams.get("workspaceId");
    const match = fromQuery ? workspaces.find((workspace) => workspace.id === fromQuery) : null;
    return match?.id ?? workspaces[0].id;
  }, [searchParams, workspaces]);

  if (!workspaces) {
    return null;
  }

  if (!workspaces.length) {
    return (
      <span className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        No workspaces
      </span>
    );
  }

  return (
    <div className="w-52">
      <Select
        value={currentWorkspaceId}
        onValueChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("workspaceId", event);
          if (!next.has("sort")) {
            next.set("sort", "name");
          }

          router.push(`/dashboard?${next.toString()}`);
        }}
      >
        <SelectTrigger aria-label="Workspace selector">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((workspace) => (
            <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
