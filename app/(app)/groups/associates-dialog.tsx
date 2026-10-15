"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { Users } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { cycleLabel } from "@/components/kit/format";
import { ListDetailSkeleton } from "@/components/kit/skeleton";
import { StatTile } from "@/components/kit/stat-tile";
import { ViewTabPanel, ViewTabs } from "@/components/kit/view-tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import type { AssociatesPayload, AssociatePerformance } from "@/src/lib/associate-performance";
import { cn } from "@/src/lib/utils";
import AssociatesFeedback from "./associates-feedback";
import { AssociatesOverview } from "./associates-overview";

type DetailTab = "overview" | "feedback";
const TAB_PREFIX = "associate-detail";
const TAB_ITEMS: Array<{ value: DetailTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "feedback", label: "Feedback" }
];

function scoreCaption(metrics: AssociatePerformance["metrics"]) {
  if (metrics.score === null) return "Not enough data";
  return metrics.provisional ? "Provisional score" : "Overall score";
}

function TeamList({
  associates,
  selectedId,
  onSelect
}: {
  associates: AssociatePerformance[];
  selectedId: string;
  onSelect: (userId: string) => void;
}) {
  return (
    <nav aria-label="Associates" className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border md:flex">
      <p className="px-4 pb-2 pt-4 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
        Team · <span className="font-mono-broadcast tabular-nums">{associates.length}</span>
      </p>
      <ul className="pb-2">
        {associates.map((associate) => {
          const selected = associate.userId === selectedId;
          return (
            <li key={associate.userId}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(associate.userId)}
                className={cn(
                  "relative flex h-14 w-full items-center justify-between gap-3 px-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  selected
                    ? "bg-[var(--ink-3)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--brand-green)]"
                    : "hover:bg-[var(--ink-3)]"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{associate.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {associate.assignedGroups} assigned {associate.assignedGroups === 1 ? "group" : "groups"}
                  </span>
                </span>
                <span className="shrink-0 font-mono-broadcast text-sm tabular-nums text-foreground">{associate.metrics.score ?? "—"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Associate producer performance, one cycle at a time (executives, the adviser and super admin;
 * the API enforces it too). Controlled by the Groups page, so both the header button and the
 * phone ⋯ menu can open it. The chosen associate and tab survive cycle switches and reopening.
 * With no DialogTrigger, closing focuses `returnFocusRef` (the control that opened it) instead.
 */
export default function AssociatesDialog({ cycles, activeCycleNumber, open, onOpenChange, returnFocusRef }: {
  cycles: Array<{ cycleNumber: number; focus: string }>;
  activeCycleNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [cycle, setCycle] = useState(activeCycleNumber);
  const [wasOpen, setWasOpen] = useState(open);
  const [data, setData] = useState<AssociatesPayload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  // Opening starts on the page's cycle (adjusted during render, so the load below uses it).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setCycle(activeCycleNumber);
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setData(null);
    setError(null);
    async function load() {
      try {
        const response = await fetch(`/api/groups/associates?cycle=${cycle}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { data?: AssociatesPayload; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unable to load associates.");
        if (!controller.signal.aborted) setData(payload.data);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load associates.");
      }
    }
    void load();
    return () => controller.abort();
  }, [open, cycle, retry]);

  const associate = data?.associates.find((a) => a.userId === selected) ?? data?.associates[0];
  const metrics = associate?.metrics;

  async function evaluateQuality() {
    if (!associate) return;
    const response = await fetch("/api/groups/associates", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cycle, userId: associate.userId })
    });
    const payload = await response.json() as { data?: { associate: AssociatePerformance }; error?: { message?: string } };
    if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unable to evaluate feedback.");
    const updated = payload.data.associate;
    setData((previous) => previous?.cycleNumber === cycle ? { ...previous, associates: previous.associates.map((a) => a.userId === updated.userId ? updated : a) } : previous);
  }

  let body: ReactNode;
  if (error) {
    body = (
      <div className="flex-1 overflow-y-auto p-5">
        <Alert
          tone="danger"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      </div>
    );
  } else if (!data) {
    body = (
      <div role="status" className="flex-1 space-y-4 overflow-y-auto p-5">
        <p className="text-sm text-muted-foreground">Loading associate performance…</p>
        <ListDetailSkeleton rows={5} />
      </div>
    );
  } else if (!associate || !metrics) {
    body = (
      <div className="flex-1 overflow-y-auto">
        <EmptyState icon={Users} title="No associate producers are registered yet." />
      </div>
    );
  } else {
    body = (
      <>
        <TeamList associates={data.associates} selectedId={associate.userId} onSelect={setSelected} />
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="space-y-6 p-5">
            <NativeSelect
              aria-label="Associate"
              value={associate.userId}
              onChange={(event) => setSelected(event.target.value)}
              wrapperClassName="md:hidden"
              className="h-10"
            >
              {data.associates.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.name} — {a.metrics.score ?? "—"}
                </option>
              ))}
            </NativeSelect>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-[-0.01em] text-foreground">{associate.name}</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {metrics.eligible} eligible stage {metrics.eligible === 1 ? "review" : "reviews"} · {associate.assignedGroups} assigned groups
                </p>
              </div>
              <StatTile label={scoreCaption(metrics)} value={metrics.score ?? "—"} unit="/100" className="w-44 shrink-0 p-3" />
            </div>

            <div className="flex items-end justify-between gap-3 border-b border-border">
              <ViewTabs
                ariaLabel="Associate detail views"
                idPrefix={TAB_PREFIX}
                items={TAB_ITEMS}
                value={tab}
                onChange={setTab}
                className="border-b-0"
              />
              <span className="pb-3 text-xs text-muted-foreground">{metrics.availableWeight}% of score weight available</span>
            </div>

            <ViewTabPanel idPrefix={TAB_PREFIX} value="overview" active={tab === "overview"}>
              <AssociatesOverview associate={associate} />
            </ViewTabPanel>
            <ViewTabPanel idPrefix={TAB_PREFIX} value="feedback" active={tab === "feedback"}>
              <AssociatesFeedback key={`${cycle}:${associate.userId}`} associate={associate} evaluate={evaluateQuality} />
            </ViewTabPanel>
          </div>
        </div>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
        className="flex max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:h-[85dvh] sm:max-h-[85dvh] sm:p-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:border-0">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border px-5 py-4 pr-12">
          <DialogHeader className="space-y-1 text-left">
            <p className="eyebrow">Producer team</p>
            <DialogTitle className="text-xl">Associates</DialogTitle>
            <DialogDescription>
              Review habits, workload, and feedback — one cycle at a time. Visible to executives &amp; adviser.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-xs text-muted-foreground max-sm:w-full">
            Package cycle
            <NativeSelect
              aria-label="Associate performance cycle"
              value={cycle}
              onChange={(event) => setCycle(Number(event.target.value))}
              wrapperClassName="w-56 max-w-[60vw] max-sm:flex-1 max-sm:max-w-none"
              className="h-10 md:h-9"
            >
              {cycles.map((c) => (
                <option key={c.cycleNumber} value={c.cycleNumber}>
                  {cycleLabel(c.cycleNumber, c.focus)}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
        <div className="flex min-h-0 flex-1">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
