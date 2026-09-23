"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type WorkspaceOption = {
  id: string;
  name: string;
};

export function DashboardWorkspaceSelector() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);

  const isDashboardRoute = pathname.startsWith("/dashboard");

  useEffect(() => {
    if (!isDashboardRoute) {
      return;
    }

    let active = true;

    async function loadWorkspaces() {
      const response = await fetch("/api/workspaces", { cache: "no-store" });
      const payload = await response.json();

      if (!active || !response.ok) {
        return;
      }

      const options = (payload.data as Array<{ id: string; name: string }>).map((item) => ({
        id: item.id,
        name: item.name
      }));
      setWorkspaces(options);
    }

    void loadWorkspaces();

    return () => {
      active = false;
    };
  }, [isDashboardRoute]);

  const currentWorkspaceId = useMemo(() => {
    if (!workspaces.length) {
      return "";
    }

    const fromQuery = searchParams.get("workspaceId");
    const match = fromQuery ? workspaces.find((workspace) => workspace.id === fromQuery) : null;
    return match?.id ?? workspaces[0].id;
  }, [searchParams, workspaces]);

  if (!isDashboardRoute) {
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
