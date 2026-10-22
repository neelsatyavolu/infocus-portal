"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Folder } from "lucide-react";
import { InlineError } from "@/components/kit/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import type { ShowRecording } from "@/src/lib/show-editor";
import {
  MAX_SHOW_EDIT_SOURCES, recordingNotes, setSourceRole, SHOW_EDIT_SOURCE_ROLE_LABELS, SHOW_EDIT_SOURCE_ROLES,
  sourceSelectionError, toggleFolder, toggleSource, type ShowEditSource, type ShowEditSourceRole
} from "@/src/lib/show-editor-sources";
import { LABEL_CLASS, pacificTime } from "./show-edit-parts";

function sizeLabel(bytes: number) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

function fileName(path: string) {
  return path.split("/").pop() ?? path;
}

type Group = { folder: string | null; files: ShowRecording[] };

/** Loose files first (newest first), then each subfolder of `Shows/` with its files. */
function groupsOf(recordings: ShowRecording[]): Group[] {
  const loose = recordings.filter((recording) => !recording.folder);
  const folders = new Map<string, ShowRecording[]>();
  for (const recording of recordings) {
    if (recording.folder) folders.set(recording.folder, [...(folders.get(recording.folder) ?? []), recording]);
  }
  return [
    ...(loose.length > 0 ? [{ folder: null, files: loose }] : []),
    ...[...folders].map(([folder, files]) => ({ folder, files }))
  ];
}

function FileRow({ recording, chosen, disabled, note, onToggle }: {
  recording: ShowRecording; chosen: boolean; disabled: boolean; note?: string; onToggle: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-1.5">
      <Checkbox checked={chosen} disabled={disabled || !recording.stable} onCheckedChange={onToggle} labelClassName="min-w-0 flex-1">
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span className="truncate font-medium">{recording.name}</span>
          <span className="text-[13px] text-muted-foreground">
            {pacificTime.format(new Date(recording.modifiedAt))} · {sizeLabel(recording.size)}
            {recording.stable ? "" : " · still copying"}
          </span>
          {note ? <span className="basis-full text-[13px] text-[var(--brand-amber)]">{note}</span> : null}
        </span>
      </Checkbox>
    </div>
  );
}

function FolderRows({ group, selected, disabled, notes, onChange }: {
  group: Group & { folder: string }; selected: ShowEditSource[]; disabled: boolean; notes: Record<string, string>;
  onChange: (next: ShowEditSource[]) => void;
}) {
  const chosen = new Set(selected.map((source) => source.path));
  const usable = group.files.filter((file) => file.stable);
  const picked = usable.filter((file) => chosen.has(file.path)).length;
  const [open, setOpen] = useState(picked > 0 && picked < usable.length);
  const name = fileName(group.folder);
  return (
    <div>
      <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
        <Checkbox
          checked={picked === 0 ? false : picked === usable.length ? true : "indeterminate"}
          disabled={disabled || usable.length === 0}
          onCheckedChange={() => onChange(toggleFolder(selected, group.files))}
          aria-label={`All files in ${name}`}
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate font-medium">{name}</span>
          <span className="shrink-0 text-[13px] text-muted-foreground">{group.files.length} {group.files.length === 1 ? "file" : "files"}</span>
        </button>
      </div>
      {open ? (
        <div className="pl-6">
          {group.files.map((recording) => (
            <FileRow key={recording.path} recording={recording} chosen={chosen.has(recording.path)} disabled={disabled} note={notes[recording.path]}
              onToggle={() => onChange(toggleSource(selected, recording.path))} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The chosen files in order, each with its role, and the reason the set can't be edited yet (if any). */
function ChosenSources({ selected, disabled, onChange }: { selected: ShowEditSource[]; disabled: boolean; onChange: (next: ShowEditSource[]) => void }) {
  const error = sourceSelectionError(selected);
  const move = (index: number, by: number) => {
    const next = [...selected];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };
  if (selected.length === 0) return <p className="text-sm text-muted-foreground">Tick the show&rsquo;s recordings above.</p>;
  return (
    <div className="space-y-2">
      <div className={LABEL_CLASS}>Chosen, in order ({selected.length} of {MAX_SHOW_EDIT_SOURCES})</div>
      <ol className="space-y-1.5" aria-label="Chosen recordings, in order">
        {selected.map((source, index) => (
          <li key={source.path} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <span className="w-5 font-mono text-[12px] text-muted-foreground">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate" title={source.path}>{fileName(source.path)}</span>
            <NativeSelect
              size="sm"
              aria-label={`Role of ${fileName(source.path)}`}
              value={source.role}
              disabled={disabled}
              wrapperClassName="w-48"
              onChange={(event) => onChange(setSourceRole(selected, source.path, event.target.value as ShowEditSourceRole))}
            >
              {SHOW_EDIT_SOURCE_ROLES.map((role) => <option key={role} value={role}>{SHOW_EDIT_SOURCE_ROLE_LABELS[role]}</option>)}
            </NativeSelect>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || index === 0}
              aria-label={`Move ${fileName(source.path)} earlier`} onClick={() => move(index, -1)}>
              <ArrowUp aria-hidden />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || index === selected.length - 1}
              aria-label={`Move ${fileName(source.path)} later`} onClick={() => move(index, 1)}>
              <ArrowDown aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}

/**
 * The recordings in Drive `Shows/` and its subfolders. Ticking a file adds it on Auto (the editor works out
 * what it is); ticking a folder adds all its finished files. Roles and order can be changed below.
 */
export function RecordingPicker({ recordings, selected, disabled, onChange }: {
  recordings: ShowRecording[];
  selected: ShowEditSource[];
    disabled: boolean;
  onChange: (next: ShowEditSource[]) => void;
}) {
  if (recordings.length === 0) {
    return <p className="text-sm text-muted-foreground">No recordings in the Shows folder on Drive yet.</p>;
  }
  const chosen = new Set(selected.map((source) => source.path));
  const notes = recordingNotes(recordings);
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Recordings in the Shows folder" className="divide-y divide-border rounded-md border border-border">
        {groupsOf(recordings).map((group) =>
          group.folder === null ? (
            <div key="loose">
              {group.files.map((recording) => (
                <FileRow key={recording.path} recording={recording} chosen={chosen.has(recording.path)} disabled={disabled} note={notes[recording.path]}
                  onToggle={() => onChange(toggleSource(selected, recording.path))} />
              ))}
            </div>
          ) : (
            <FolderRows key={group.folder} group={{ ...group, folder: group.folder }} selected={selected} disabled={disabled}
              notes={notes} onChange={onChange} />
          )
        )}
      </div>
      <ChosenSources selected={selected} disabled={disabled} onChange={onChange} />
    </div>
  );
}
