"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, ExternalLink, Loader2, Plus } from "lucide-react";
import { AGENDA_TEXT_MAX, agendaProgress, cleanAgendaText } from "@/src/lib/meetings/agenda";
import { cn } from "@/src/lib/utils";
import { SidePanel } from "../call/side-panel";
import { agendaEditorHref } from "./agenda-button";
import { useAgenda } from "./use-agenda";

type Agenda = ReturnType<typeof useAgenda>;

/**
 * The call's agenda. Kept loaded while in the call (for the remaining-items badge) and refetched
 * whenever the room says the agenda changed, and after every (re)connect.
 */
export function useCallAgenda(meetingId: string, agendaVersion: number, welcomeCount: number) {
  const agenda = useAgenda(meetingId);
  const { refresh } = agenda;
  useEffect(() => {
    if (agendaVersion > 0 || welcomeCount > 1) void refresh();
  }, [agendaVersion, welcomeCount, refresh]);
  return agenda;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]";

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="space-y-1.5 border-b border-[var(--ink-4)] px-4 py-3">
      <p className="text-sm text-[var(--ink-text)]">
        <span className="font-mono tabular-nums text-foreground">{done}</span> of{" "}
        <span className="font-mono tabular-nums text-foreground">{total}</span> done
      </p>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[var(--ink-4)]"
        role="progressbar"
        aria-label="Agenda progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div className="h-full rounded-full bg-[var(--brand-green)] transition-[width]" style={{ width: total ? `${(done / total) * 100}%` : "0%" }} />
      </div>
    </div>
  );
}

export function AgendaPanel({
  meetingId,
  agenda,
  selfName,
  onClose,
  mobile
}: {
  meetingId: string;
  agenda: Agenda;
  selfName: string | null;
  onClose: () => void;
  mobile: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const items = agenda.items ?? [];
  const progress = agendaProgress(items);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const text = cleanAgendaText(draft);
    if (!text) return;
    setAdding(true);
    if (await agenda.add(text)) setDraft("");
    setAdding(false);
  };

  const footer = agenda.readOnly ? undefined : (
    <form onSubmit={add} className="flex gap-2">
      <label htmlFor="call-agenda-add" className="sr-only">
        Add an agenda item
      </label>
      <input
        id="call-agenda-add"
        value={draft}
        maxLength={AGENDA_TEXT_MAX}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add an item"
        className={cn("h-11 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground", FOCUS)}
      />
      <button
        type="submit"
        disabled={adding || !cleanAgendaText(draft)}
        aria-label="Add item"
        className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50", FOCUS)}
      >
        {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
      </button>
    </form>
  );

  return (
    <SidePanel title="Agenda" onClose={onClose} mobile={mobile} footer={footer}>
      {agenda.items && items.length > 0 ? <Progress done={progress.done} total={progress.total} /> : null}
      {agenda.loadError ? <p className="p-4 text-sm text-danger">{agenda.loadError}</p> : null}
      {!agenda.items && !agenda.loadError ? (
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading agenda…
        </p>
      ) : null}
      {agenda.items && items.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No agenda yet. Add the first item.</p> : null}

      <ol className="grid gap-1 p-2" aria-label="Agenda items">
        {items.map((item, index) => (
          <li key={item.id}>
            <label
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-[var(--ink-3)]",
                agenda.readOnly && "cursor-default hover:bg-transparent"
              )}
            >
              {/* Native checkbox: Space toggles it, and it carries the accessible state. */}
              <input
                type="checkbox"
                checked={item.done}
                disabled={agenda.readOnly}
                onChange={(e) => void agenda.setDone(item.id, e.target.checked, selfName)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brand-green)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--ink-2)]",
                  item.done ? "border-[var(--brand-fill)] bg-primary text-primary-foreground" : "border-[var(--ink-5)]"
                )}
              >
                {item.done ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", item.done ? "text-muted-foreground line-through" : "text-foreground")}>
                  <span className="mr-1.5 font-mono text-xs tabular-nums text-muted-foreground no-underline">{index + 1}</span>
                  {item.text}
                </span>
                {item.done ? (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Check className="h-3 w-3" aria-hidden /> {item.doneByName ?? "Done"}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ol>

      <div className="px-4 pb-4">
        <a
          href={agendaEditorHref(meetingId)}
          target="_blank"
          rel="noopener"
          className={cn("inline-flex min-h-11 items-center gap-1.5 text-sm text-[var(--brand-green)] hover:underline", FOCUS)}
        >
          Edit agenda <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </SidePanel>
  );
}
