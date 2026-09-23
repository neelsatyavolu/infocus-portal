"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Mic2, ScrollText, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import App from "@/src/show-roles/App";
import { queuePackageSubtitle } from "@/src/lib/publishing-queue";
import { cn } from "@/src/lib/utils";

type Overview = {
  date: string;
  label: string;
  kind: string;
  mode: "VOLUNTEER" | "RANDOM";
  weekOfMonth: number;
  members: string[];
  roles: string[];
  anchors: string[];
  paAnnouncers: string[];
  assignments: Record<string, string>;
  confirmed: Record<string, boolean>;
  showManager?: { name: string; source: "rotation" | "manual" };
  showManagerPool?: string[];
  monthAnchors: string[];
  suggestedAnchors: string[];
  suggestedPa: string[];
  packages: Array<{
    id: string;
    cycleNumber: number;
    groupTopic: string;
    custom?: boolean;
    queuedForShowDate: string | null;
    members: Array<string | null>;
  }>;
  upcomingShows: Array<{
    date: string;
    label: string;
    mode: "VOLUNTEER" | "RANDOM";
    packageCount: number;
    showManager?: string;
  }>;
  teleprompterDocId: string | null;
  teleprompterHref: string;
};

const EMPTY_VALUE = "__none__";

function NameSelect({
  value,
  options,
  disabledOptions,
  onChange,
  placeholder
}: {
  value: string;
  options: string[];
  disabledOptions?: string[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const blocked = new Set(disabledOptions ?? []);
  const items = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select value={value || EMPTY_VALUE} onValueChange={(next) => onChange(next === EMPTY_VALUE ? "" : next)}>
      <SelectTrigger className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground shadow-none">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        <SelectItem value={EMPTY_VALUE}>{placeholder}</SelectItem>
        {items.map((name) => (
          <SelectItem key={name} value={name} disabled={blocked.has(name) && name !== value}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OverviewBody() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (date?: string) => {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    const response = await fetch(`/api/show-roles/overview${query}`, { cache: "no-store" });
    const payload = (await response.json()) as { data?: Overview; error?: { message?: string } };
    if (!response.ok || !payload.data) {
      throw new Error(payload.error?.message ?? "Could not load the show.");
    }
    setData(payload.data);
  }, []);

  useEffect(() => {
    void load()
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load the show."))
      .finally(() => setLoading(false));
  }, [load]);

  async function saveAnchors(names: string[], source: "manual" | "random") {
    if (!data) return;
    setSaving(true);
    try {
      const response = await fetch("/api/show-roles/anchors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: data.date, names, source })
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not save anchors.");
      }
      await load(data.date);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save anchors.");
    } finally {
      setSaving(false);
    }
  }

  async function saveShowManager(name: string) {
    if (!data) return;
    setSaving(true);
    try {
      const response = await fetch("/api/show-roles/show-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: data.date, name })
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not save show manager.");
      }
      await load(data.date);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save show manager.");
    } finally {
      setSaving(false);
    }
  }

  async function randomizeAnchors() {
    if (!data) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/show-roles/anchors?date=${encodeURIComponent(data.date)}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as {
        data?: { suggested?: string[] };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not suggest anchors.");
      }
      const suggested = payload.data?.suggested ?? [];
      if (suggested.length === 0) {
        throw new Error("No eligible anchors left this month.");
      }
      await saveAnchors(suggested, "random");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not randomize anchors.");
      setSaving(false);
    }
  }

  const daysOut = useMemo(() => {
    if (!data) return null;
    const [year, month, day] = data.date.split("-").map(Number);
    const target = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86_400_000);
  }, [data]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading the next show…</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">No upcoming show found.</p>;
  }

  const anchor1 = data.anchors[0] ?? "";
  const anchor2 = data.anchors[1] ?? "";
  const showManager = data.showManager ?? { name: "", source: "rotation" as const };
  const showManagerPool = data.showManagerPool ?? [];
  const liveLabel =
    daysOut === 0 ? "Live today" : daysOut && daysOut > 0 ? `Live in ${daysOut} day${daysOut === 1 ? "" : "s"}` : data.label;

  return (
    <div className="route-enter mx-auto w-full max-w-4xl space-y-5 pb-24">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow flex items-center gap-2">
              <Mic2 className="h-3 w-3" />
              The Show
            </div>
            <h1 className="display-md mt-2 text-foreground">{data.label}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {liveLabel}. Week {data.weekOfMonth} ·{" "}
              {data.mode === "VOLUNTEER" ? "volunteer anchors" : "random anchors"}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={data.teleprompterHref as never} className={buttonVariants({ variant: "outline" })}>
              <ScrollText className="h-4 w-4" />
              {data.teleprompterDocId ? "Open script" : "Create script"}
            </Link>
            <Link href={"/show-roles?generator=1" as never} className={buttonVariants()}>
              <Wand2 className="h-4 w-4" />
              Open generator
            </Link>
          </div>
        </div>
        {data.upcomingShows.length > 1 ? (
          <div className="relative mt-4 flex flex-wrap gap-1">
            {data.upcomingShows.map((show) => (
              <button
                key={show.date}
                type="button"
                onClick={() => void load(show.date)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-semibold",
                  show.date === data.date
                    ? "border-border bg-background text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {show.label.replace(/, \d{4}$/, "")}
                {show.packageCount > 0 ? ` · ${show.packageCount}` : ""}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold uppercase tracking-tight">Show manager</h2>
          {showManager.source === "manual" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void saveShowManager("")}
            >
              Use rotation
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Rotates across EPs and APs</span>
          )}
        </div>
        <div className="mt-3">
          <NameSelect
            value={showManager.name}
            options={
              showManager.name && !showManagerPool.includes(showManager.name)
                ? [showManager.name, ...showManagerPool]
                : showManagerPool
            }
            placeholder="Show manager"
            onChange={(value) => void saveShowManager(value)}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold uppercase tracking-tight">Anchors</h2>
          {data.mode === "RANDOM" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void randomizeAnchors()}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Randomize
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Pick volunteers for this week</span>
          )}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <NameSelect
            value={anchor1}
            options={data.members}
            disabledOptions={[anchor2, ...data.monthAnchors]}
            placeholder="Anchor 1"
            onChange={(value) => void saveAnchors([value, anchor2], "manual")}
          />
          <NameSelect
            value={anchor2}
            options={data.members}
            disabledOptions={[anchor1, ...data.monthAnchors]}
            placeholder="Anchor 2"
            onChange={(value) => void saveAnchors([anchor1, value], "manual")}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold uppercase tracking-tight">Packages</h2>
        {data.packages.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing from the publishing queue is assigned to this show yet.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {data.packages.map((row) => {
              const body = (
                <>
                  <div className="font-medium">{row.groupTopic || "Untitled group"}</div>
                  <div className="text-xs text-muted-foreground">{queuePackageSubtitle(row)}</div>
                </>
              );
              return row.custom ? (
                <div key={row.id} className="rounded-xl border border-border px-4 py-3">
                  {body}
                </div>
              ) : (
                <Link
                  key={row.id}
                  href={`/groups/${row.id}/final-cut` as never}
                  className="block rounded-xl border border-border px-4 py-3"
                >
                  {body}
                </Link>
              );
            })}
          </div>
        )}
        <Link href={"/publishing-queue" as never} className="mt-3 inline-block text-xs text-muted-foreground underline">
          Open publishing queue
        </Link>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold uppercase tracking-tight">Show roles</h2>
          <Link href={"/show-roles?generator=1" as never} className={buttonVariants({ size: "sm", variant: "outline" })}>
            Generate
          </Link>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {data.roles.map((role) => (
            <div key={role} className="rounded-lg border border-border px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{role}</div>
              <div className="mt-0.5 text-sm font-medium">{data.assignments[role] || "—"}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function TheShowClient() {
  const params = useSearchParams();
  if (params.get("generator") === "1") {
    return (
      <div className="space-y-3 pb-24">
        <Link
          href={"/show-roles" as never}
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          <CalendarDays className="h-3 w-3" />
          Back to The Show
        </Link>
        <App />
      </div>
    );
  }
  return <OverviewBody />;
}
