"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { ErrorState } from "@/components/kit/empty-state";
import { useRememberedState } from "@/components/kit/remembered-state";
import { StatusTag } from "@/components/kit/status-tag";
import { ViewTabPanel, ViewTabs } from "@/components/kit/view-tabs";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { errorText, readJson, sendJson, type FormStatus } from "@/components/equipment/equipment-api";
import { formatTime, isOverdueItem } from "@/components/equipment/equipment-status";
import { StatusAlert } from "@/components/equipment/status-alert";
import { cn } from "@/src/lib/utils";
import { ManageInventory } from "./_components/manage-inventory";
import { ManageOut } from "./_components/manage-out";
import { ManageRequests } from "./_components/manage-requests";
import { ManageSettings } from "./_components/manage-settings";
import { useManageData, type ManageResource } from "./_components/use-manage-data";

const TABS: ManageResource[] = ["out", "requests", "inventory", "settings"];
const TAB_PREFIX = "equipment-manage";

function isTab(value: unknown): value is ManageResource {
  return typeof value === "string" && (TABS as string[]).includes(value);
}

export default function EquipmentManageClient() {
  const data = useManageData();
  const { load } = data;
  const [tab, setTab] = useRememberedState<ManageResource>("equipment:manage:tab:v1", "out", isTab);
  // Tabs mount on first visit and then stay mounted (hidden), so revisits are instant.
  const [visited, setVisited] = useState<ReadonlySet<ManageResource>>(() => new Set<ManageResource>(["out"]));
  const [busy, setBusy] = useState(false);
  // The last change's result. It stays until the next change, Refresh, a tab switch or dismiss.
  const [message, setMessage] = useState<FormStatus>(null);

  useEffect(() => {
    setVisited((prev) => (prev.has(tab) ? prev : new Set([...prev, tab])));
    void load(tab);
  }, [tab, load]);

  const overdueCount = useMemo(() => data.outItems.filter((item) => isOverdueItem(item, data.now)).length, [data.outItems, data.now]);
  const pendingCount = useMemo(() => data.requests.filter((row) => row.status === "PENDING").length, [data.requests]);
  const refreshing = data.loading[tab];
  const retry = (resource: ManageResource) => void load(resource, { force: true });

  /**
   * Runs one change and reports it in the message slot under the tabs (pinned under the top bar,
   * so it is in view wherever the manager is on a long list); then it quietly reloads what the
   * change touched, which keeps the message. Resolves to the error message, or null when it saved.
   * With `inlineError` the caller shows the error itself instead of the slot.
   */
  async function act(
    change: () => Promise<unknown>,
    success: string,
    failure: string,
    reload: ManageResource,
    { inlineError = false }: { inlineError?: boolean } = {}
  ): Promise<string | null> {
    setBusy(true);
    setMessage(null);
    try {
      await change();
      setMessage({ type: "success", text: success });
      await load(reload, { force: true });
      return null;
    } catch (error) {
      const text = errorText(error, failure);
      if (!inlineError) setMessage({ type: "error", text });
      return text;
    } finally {
      setBusy(false);
    }
  }

  /** For forms that reset after a save. */
  const saved = (result: Promise<string | null>) => result.then((error) => error === null);

  const patchOut = (action: "force-return" | "release-hold", itemId: string) =>
    void act(
      () => sendJson("/api/equipment/manage/out", "PATCH", { action, itemId }),
      action === "force-return" ? "Item returned." : "Hold released.",
      "Update failed.",
      "out"
    );

  /** A tab whose first load failed shows the error and Try again in place of its content. */
  function tabBody(resource: ManageResource, content: ReactNode) {
    const error = data.errors[resource];
    if (!visited.has(resource)) return null;
    if (error && !data.loaded[resource] && resource !== "settings") {
      return (
        <div className="rounded-md border border-border bg-card">
          <ErrorState message={error} onRetry={() => retry(resource)} busy={data.loading[resource]} />
        </div>
      );
    }
    return content;
  }

  // Settings always renders (the passkeys panel loads on its own), so its errors use the banner;
  // so do reload errors on a tab that still shows its last copy.
  const bannerError = data.errors[tab] && (data.loaded[tab] || tab === "settings") ? data.errors[tab] : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Equipment"
        status={data.updatedAt ? <StatusTag tone="muted">{`Updated ${formatTime(data.updatedAt)}`}</StatusTag> : null}
        title="Manage"
        description="Requests, gear that's out, inventory and managers."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setMessage(null);
              // The open tab plus Out and Requests, so the tab badges are fresh too.
              data.refresh(tab);
            }}
            disabled={refreshing || busy}
          >
            <RefreshCw aria-hidden className={cn(refreshing && "motion-safe:animate-spin")} />
            Refresh
          </Button>
        }
      />

      <ViewTabs
        ariaLabel="Manage equipment"
        idPrefix={TAB_PREFIX}
        value={tab}
        onChange={(next) => {
          setMessage(null);
          setTab(next);
        }}
        items={[
          { value: "out", label: "Out", count: overdueCount, countTone: "danger", countLabel: `${overdueCount} overdue` },
          { value: "requests", label: "Requests", count: pendingCount, countTone: "warning", countLabel: `${pendingCount} pending` },
          { value: "inventory", label: "Inventory" },
          { value: "settings", label: "Settings" }
        ]}
      />

      {bannerError || message ? (
        // One message slot, pinned under the top bar (opaque, so rows never show through a tint).
        <div className="sticky top-[calc(var(--app-header-h,0px)+0.5rem)] z-30 space-y-2 rounded-md bg-background">
          {bannerError ? (
            <Alert
              tone="danger"
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => retry(tab)} disabled={refreshing}>
                  Try again
                </Button>
              }
            >
              {bannerError}
            </Alert>
          ) : null}
          <StatusAlert status={message} onDismiss={() => setMessage(null)} />
        </div>
      ) : null}

      <ViewTabPanel idPrefix={TAB_PREFIX} value="out" active={tab === "out"}>
        {tabBody(
          "out",
          <ManageOut
            items={data.outItems}
            now={data.now}
            loaded={data.loaded.out}
            busy={busy}
            onForceReturn={(id) => patchOut("force-return", id)}
            onReleaseHold={(id) => patchOut("release-hold", id)}
          />
        )}
      </ViewTabPanel>

      <ViewTabPanel idPrefix={TAB_PREFIX} value="requests" active={tab === "requests"}>
        {tabBody(
          "requests",
          <ManageRequests
            requests={data.requests}
            loaded={data.loaded.requests}
            active={tab === "requests"}
            busy={busy}
            onDecide={(id, action) =>
              // An error shows in the open request, beside its buttons (and in the phone's action bar).
              act(
                () => sendJson("/api/equipment/manage/requests", "POST", { id, action }),
                action === "approve" ? "Request approved." : "Request denied.",
                "Could not update request.",
                "requests",
                { inlineError: true }
              )
            }
          />
        )}
      </ViewTabPanel>

      <ViewTabPanel idPrefix={TAB_PREFIX} value="inventory" active={tab === "inventory"}>
        {tabBody(
          "inventory",
          <ManageInventory
            items={data.inventory}
            loaded={data.loaded.inventory}
            busy={busy}
            onAdd={(draft) =>
              saved(act(() => sendJson("/api/equipment/manage/items", "POST", draft), "Item added.", "Could not add item.", "inventory"))
            }
            onSave={(id, draft) =>
              saved(
                act(() => sendJson("/api/equipment/manage/items", "PATCH", { id, ...draft }), "Item updated.", "Could not update item.", "inventory")
              )
            }
            onArchive={(id) =>
              void act(
                () => sendJson("/api/equipment/manage/items", "PATCH", { id, archived: true }),
                "Item archived.",
                "Could not archive item.",
                "inventory"
              )
            }
          />
        )}
      </ViewTabPanel>

      <ViewTabPanel idPrefix={TAB_PREFIX} value="settings" active={tab === "settings"}>
        {tabBody(
          "settings",
          <ManageSettings
            data={data.settings}
            loaded={data.loaded.settings}
            failed={Boolean(data.errors.settings) && !data.loaded.settings}
            busy={busy}
            onAddManager={(userId) =>
              saved(act(() => sendJson("/api/equipment/manage/managers", "POST", { userId }), "Manager added.", "Could not add manager.", "settings"))
            }
            onRemoveManager={(userId) =>
              void act(
                async () => readJson(await fetch(`/api/equipment/manage/managers?userId=${encodeURIComponent(userId)}`, { method: "DELETE" })),
                "Manager removed.",
                "Could not remove manager.",
                "settings"
              )
            }
          />
        )}
      </ViewTabPanel>
    </div>
  );
}
