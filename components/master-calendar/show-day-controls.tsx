"use client";

import { Sparkles } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { formatPairedNames } from "@/src/lib/calendar-show-content";

function optionsForValue(members: string[], value: string) {
  if (!value || members.includes(value)) {
    return members;
  }
  return [value, ...members];
}

const EMPTY_VALUE = "__none__";
const SELECT_TRIGGER_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground shadow-none";
const LABEL_CLASS =
  "font-display text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground";

function NameSelect({
  value,
  options,
  disabledOptions,
  disabled,
  placeholder,
  onChange
}: {
  value: string;
  options: string[];
  disabledOptions?: string[];
  disabled?: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const blocked = new Set(disabledOptions ?? []);
  return (
    <Select
      value={value || EMPTY_VALUE}
      onValueChange={(next) => onChange(next === EMPTY_VALUE ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger className={SELECT_TRIGGER_CLASS}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        <SelectItem value={EMPTY_VALUE}>{placeholder}</SelectItem>
        {optionsForValue(options, value).map((name) => (
          <SelectItem key={name} value={name} disabled={blocked.has(name) && name !== value}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type QueuedPackage = {
  id: string;
  groupTopic: string;
  cycleNumber: number;
  custom?: boolean;
};

export function ShowDayControls({
  dateKey,
  anchors,
  members,
  manager,
  managerPool,
  managerSource,
  packages,
  canEdit,
  busy,
  onChange,
  onRandomize,
  onManagerChange,
  onManagerReset
}: {
  dateKey: string;
  anchors: string[];
  members: string[];
  manager: string;
  managerPool: string[];
  managerSource: "rotation" | "manual";
  packages: QueuedPackage[];
  canEdit: boolean;
  busy: boolean;
  onChange: (names: string[], source: "manual" | "random") => void;
  onRandomize: () => void;
  onManagerChange: (name: string) => void;
  onManagerReset: () => void;
}) {
  const first = anchors[0] ?? "";
  const second = anchors[1] ?? "";
  const managerOptions = optionsForValue(managerPool, manager);

  return (
    <div className="flex min-h-[14.5rem] flex-1 flex-col gap-3 rounded-lg border border-border/70 bg-[var(--ink)]/40 p-3 text-left">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL_CLASS}>Anchors</span>
          {canEdit ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRandomize}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[var(--brand-green)] hover:bg-accent disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Randomize
            </button>
          ) : null}
        </div>
        {canEdit ? (
          <div className="grid gap-1.5">
            {[0, 1].map((slot) => {
              const value = slot === 0 ? first : second;
              const other = slot === 0 ? second : first;
              return (
                <NameSelect
                  key={`${dateKey}-anchor-${slot}`}
                  value={value}
                  options={members}
                  disabledOptions={[other]}
                  disabled={busy}
                  placeholder={`Anchor ${slot + 1}`}
                  onChange={(nextValue) => {
                    const next = slot === 0 ? [nextValue, second] : [first, nextValue];
                    onChange(next, "manual");
                  }}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-foreground">{formatPairedNames([first, second]) || "Not set"}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL_CLASS}>Show manager</span>
          {canEdit && managerSource === "manual" ? (
            <button
              type="button"
              disabled={busy}
              onClick={onManagerReset}
              className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              Auto
            </button>
          ) : canEdit ? (
            <span className="text-[11px] text-muted-foreground">Auto</span>
          ) : null}
        </div>
        {canEdit ? (
          <NameSelect
            value={manager}
            options={managerOptions}
            disabled={busy}
            placeholder="Show manager"
            onChange={onManagerChange}
          />
        ) : (
          <p className="text-sm text-foreground">{manager || "Not set"}</p>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div className={LABEL_CLASS}>Queue</div>
        {packages.length > 0 ? (
          packages.map((row) => (
            <div key={row.id} className="text-sm leading-5 text-foreground">
              {row.custom || row.cycleNumber < 1
                ? row.groupTopic || "Untitled"
                : `${row.groupTopic || "Untitled"} · C${row.cycleNumber}`}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">None yet</p>
        )}
      </div>
    </div>
  );
}

export function PaDayControls({
  dateKey,
  names,
  members,
  canEdit,
  busy,
  onChange,
  onRandomize
}: {
  dateKey: string;
  names: string[];
  members: string[];
  canEdit: boolean;
  busy: boolean;
  onChange: (next: string[]) => void;
  onRandomize: () => void;
}) {
  const first = names[0] ?? "";
  const second = names[1] ?? "";

  return (
    <div className="flex min-h-[14.5rem] flex-1 flex-col gap-3 rounded-lg border border-border/70 bg-[var(--ink)]/40 p-3 text-left">
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL_CLASS}>PA announcers</span>
          {canEdit ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRandomize}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[var(--brand-green)] hover:bg-accent disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Randomize
            </button>
          ) : null}
        </div>
        {canEdit ? (
          <div className="grid gap-1.5">
            {[0, 1].map((slot) => {
              const value = slot === 0 ? first : second;
              const other = slot === 0 ? second : first;
              return (
                <NameSelect
                  key={`${dateKey}-pa-${slot}`}
                  value={value}
                  options={members}
                  disabledOptions={[other]}
                  disabled={busy}
                  placeholder={`Announcer ${slot + 1}`}
                  onChange={(nextValue) => {
                    const next = slot === 0 ? [nextValue, second] : [first, nextValue];
                    onChange(next);
                  }}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-foreground">{formatPairedNames([first, second]) || "Not set"}</p>
        )}
      </div>
    </div>
  );
}
