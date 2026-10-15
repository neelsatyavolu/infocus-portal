"use client";

import type { ReactNode } from "react";
import { SaveState } from "@/components/kit/status-tag";
import { memberNoteKey } from "@/src/lib/member-notes";
import { type MemberRow, type NoteMap, personLabel, tabTitle } from "./member-notes-model";
import { type EditorHandlers, NoteCount, NoteField, notesLabel, notesPlaceholder } from "./note-editor";

/**
 * The whole-class layout: every listed member's note for the active tab on one page, each in its
 * own autosaving field (name and email beside it from md, above it on phones) — read and write the
 * class's notes in one pass. The RosterHeader stays pinned under the top bar while scrolling.
 */
export function MemberSheet({
  header,
  empty,
  members,
  activeTab,
  drafts,
  handlers
}: {
  header: ReactNode;
  empty: ReactNode;
  members: MemberRow[];
  activeTab: number;
  drafts: NoteMap;
  handlers: EditorHandlers;
}) {
  return (
    <section aria-label={`${tabTitle(activeTab)} notes`} className="min-w-0 rounded-md border border-border bg-card">
      <div className="rounded-t-md lg:sticky lg:top-[var(--app-header-h,0px)] lg:z-10 lg:bg-card">{header}</div>
      {empty ?? (
        <ul aria-label="Members" className="divide-y divide-border">
          {members.map((member) => {
            const name = personLabel(member);
            const noteKey = memberNoteKey(member.id, activeTab);
            const value = drafts[noteKey] ?? "";
            return (
              <li
                key={member.id}
                className="grid min-w-0 gap-2 px-4 py-3 md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] md:gap-x-5"
              >
                <div className="flex min-w-0 items-start justify-between gap-2 md:flex-col md:justify-start md:pt-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                    {member.email ? (
                      <p className="truncate font-mono-broadcast text-[11px] text-muted-foreground">{member.email}</p>
                    ) : null}
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <SaveState state={handlers.noteState(noteKey)} title={handlers.errorFor(noteKey)} />
                    <NoteCount length={value.length} />
                  </span>
                </div>
                <NoteField
                  noteKey={noteKey}
                  value={value}
                  placeholder={notesPlaceholder(activeTab)}
                  ariaLabel={notesLabel(activeTab, name)}
                  size="md"
                  handlers={handlers}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
