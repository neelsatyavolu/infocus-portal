"use client";

import { Sparkles, X } from "lucide-react";
import { NamePicker } from "@/components/name-picker";
import { formatPairedNames, type CalendarCrewRole } from "@/src/lib/calendar-show-content";

function optionsForValue(members: string[], value: string) {
  if (!value || members.includes(value)) {
    return members;
  }
  return [value, ...members];
}

const LABEL_CLASS =
  "text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground";

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
                <NamePicker
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
          <NamePicker
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
                <NamePicker
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

// "Filmers" is the older unsorted list: names can only be removed or sorted into another list.
const CREW_LABELS: Record<CalendarCrewRole, { label: string; add: string | null }> = {
  Filmers: { label: "Filmers (unsorted)", add: null },
  "Brunch Filmers": { label: "Brunch filmers", add: "Add brunch filmer" },
  "Lunch Filmers": { label: "Lunch filmers", add: "Add lunch filmer" },
  "Night Rally Filmers": { label: "Night rally filmers", add: "Add night rally filmer" },
  Editors: { label: "Editors", add: "Add editor" }
};

function CrewList({
  role,
  names,
  members,
  canEdit,
  busy,
  onChange
}: {
  role: CalendarCrewRole;
  names: string[];
  members: string[];
  canEdit: boolean;
  busy: boolean;
  onChange: (next: string[]) => void;
}) {
  const { label, add } = CREW_LABELS[role];
  return (
    <div className="space-y-1.5">
      <span className={LABEL_CLASS}>{label}</span>
      {canEdit && !add ? (
        <p className="text-xs text-muted-foreground">Add each person to a list below to sort them.</p>
      ) : null}
      {names.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {names.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--ink-3)] px-2 py-0.5 text-xs text-foreground"
            >
              {name}
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  disabled={busy}
                  onClick={() => onChange(names.filter((entry) => entry !== name))}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : canEdit ? null : (
        <p className="text-sm text-muted-foreground">Not set</p>
      )}
      {canEdit && add ? (
        <NamePicker
          value=""
          options={members}
          disabledOptions={names}
          disabled={busy}
          placeholder={add}
          onChange={(name) => {
            if (name) onChange([...names, name]);
          }}
        />
      ) : null}
    </div>
  );
}

export function SpiritWeekControls({
  theme,
  unsortedFilmers,
  lists,
  members,
  canEdit,
  busy,
  onCrewChange
}: {
  theme: string;
  unsortedFilmers: string[];
  lists: Array<{ role: CalendarCrewRole; names: string[] }>;
  members: string[];
  canEdit: boolean;
  busy: boolean;
  onCrewChange: (role: CalendarCrewRole, names: string[]) => void;
}) {
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border/70 bg-[var(--ink)]/40 p-3 text-left">
      <div className="space-y-0.5">
        <span className={LABEL_CLASS}>Spirit Week theme</span>
        <p className="text-sm font-medium text-[var(--brand-green)]">{theme}</p>
      </div>
      {unsortedFilmers.length > 0 ? (
        <CrewList
          role="Filmers"
          names={unsortedFilmers}
          members={members}
          canEdit={canEdit}
          busy={busy}
          onChange={(names) => onCrewChange("Filmers", names)}
        />
      ) : null}
      {lists.map(({ role, names }) => (
        <CrewList
          key={role}
          role={role}
          names={names}
          members={members}
          canEdit={canEdit}
          busy={busy}
          onChange={(next) => onCrewChange(role, next)}
        />
      ))}
    </div>
  );
}
