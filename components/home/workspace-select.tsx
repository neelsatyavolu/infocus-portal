"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dashboardHref, type SortValue, type ViewValue } from "@/components/home/home-format";

export type WorkspaceOption = { id: string; name: string };

/**
 * The producer's workspace switcher (it used to be the shell top bar's selector on /dashboard).
 * An h-9 Select at the start of the packages toolbar, listing the workspaces the page already
 * loads. Switching changes ?workspaceId= and keeps sort and view. The toolbar renders it only
 * with 2+ workspaces; with one, the header title already names it.
 */
export function WorkspaceSelect({
  workspaces,
  value,
  sort,
  view
}: {
  workspaces: WorkspaceOption[];
  value: string;
  sort: SortValue;
  view: ViewValue;
}) {
  const router = useRouter();

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== value) {
          router.push(dashboardHref({ workspaceId: next, sort, view }) as never);
        }
      }}
    >
      <SelectTrigger aria-label="Workspace" className="w-full sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((workspace) => (
          <SelectItem key={workspace.id} value={workspace.id}>
            {workspace.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
