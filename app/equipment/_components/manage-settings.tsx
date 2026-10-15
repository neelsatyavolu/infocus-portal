"use client";

import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { Panel, PanelSection } from "@/components/kit/panel";
import { SearchField } from "@/components/kit/search-field";
import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { EquipmentPasskeySettings } from "@/components/equipment-passkeys";
import { formatShortDate, hubLabel } from "@/components/equipment/equipment-status";
import type { ManageSettings as ManageSettingsData } from "./use-manage-data";

/**
 * Managers (producers appoint extra ones) beside the signed-in manager's passkeys. Both panels
 * list first, then add, so their parts line up; equal height on desktop, stacked on phones.
 */
export function ManageSettings({
  data,
  loaded,
  failed,
  busy,
  onAddManager,
  onRemoveManager
}: {
  data: ManageSettingsData;
  loaded: boolean;
  /** The first load failed (the page banner says why and offers Try again). */
  failed: boolean;
  busy: boolean;
  /** Resolves true when the manager was added. */
  onAddManager: (userId: string) => Promise<boolean>;
  onRemoveManager: (userId: string) => void;
}) {
  return (
    <div className="grid items-stretch gap-5 lg:grid-cols-2">
      <Panel
        divided
        title="Managers"
        titleAs="h2"
        description="Producers appoint extra managers. Appointed managers can run inventory and requests but cannot appoint others."
      >
        <PanelSection title="Extra managers">
          {!loaded ? (
            failed ? (
              <p className="text-sm text-muted-foreground">Managers could not be loaded.</p>
            ) : (
              <LoadingRegion label="Loading managers" className="space-y-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </LoadingRegion>
            )
          ) : data.managers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No extra managers yet.</p>
          ) : (
            <ul aria-label="Extra managers" className="-my-2 divide-y divide-border">
              {data.managers.map((row) => {
                const label = hubLabel(row.user);
                return (
                  <li key={row.id} className="flex min-h-12 items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">Added {formatShortDate(row.createdAt)}</p>
                    </div>
                    {data.canAppoint ? (
                      <Button
                        type="button"
                        variant="destructive-quiet"
                        size="sm"
                        className="max-md:h-10"
                        aria-label={`Remove ${label}`}
                        disabled={busy}
                        onClick={() => onRemoveManager(row.userId)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </PanelSection>
        {loaded ? (
          <PanelSection title="Add a manager" grow>
            {data.canAppoint ? (
              <ManagerPicker data={data} busy={busy} onAddManager={onAddManager} />
            ) : (
              <p className="text-sm text-muted-foreground">Only producers appoint managers.</p>
            )}
          </PanelSection>
        ) : null}
      </Panel>

      <EquipmentPasskeySettings />
    </div>
  );
}

/**
 * As before: the find box narrows a list of every member who is not a manager yet, the list
 * shows them all while the box is empty, and nothing changes until Add is pressed.
 */
function ManagerPicker({
  data,
  busy,
  onAddManager
}: {
  data: ManageSettingsData;
  busy: boolean;
  onAddManager: (userId: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState("");

  const eligible = useMemo(() => {
    const appointed = new Set(data.managers.map((row) => row.userId));
    const search = query.trim().toLowerCase();
    return data.users.filter((user) => {
      if (appointed.has(user.id)) return false;
      if (!search) return true;
      return hubLabel(user).toLowerCase().includes(search) || (user.email ?? "").toLowerCase().includes(search);
    });
  }, [data.users, data.managers, query]);

  // A pick the search has hidden no longer counts, so Add never appoints someone out of view.
  const picked = eligible.some((user) => user.id === pick) ? pick : "";

  async function add() {
    if (!picked || busy) return;
    if (await onAddManager(picked)) setPick("");
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="manager-search">Find member</Label>
        <SearchField id="manager-search" value={query} onChange={setQuery} placeholder="Search name or email" size="touch" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="manager-pick">Member</Label>
        <ActionBar size="touch" className="flex-nowrap">
          <NativeSelect
            id="manager-pick"
            value={picked}
            onChange={(event) => setPick(event.target.value)}
            placeholderOption={
              // The page banner says why the roster failed and offers Try again.
              data.rosterFailed ? "Members could not be loaded." : eligible.length > 0 ? "Add manager…" : "No members match."
            }
            disabled={data.rosterFailed}
            wrapperClassName="flex-1"
            className="h-full"
          >
            {eligible.map((user) => (
              <option key={user.id} value={user.id}>
                {hubLabel(user)}
              </option>
            ))}
          </NativeSelect>
          <Button type="button" variant="outline" className="shrink-0" onClick={() => void add()} disabled={!picked || busy}>
            <UserPlus aria-hidden />
            Add
          </Button>
        </ActionBar>
      </div>
    </div>
  );
}
