"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Folder, Loader2, Play } from "lucide-react";
import { InlineError, InlineNote } from "@/components/kit/alert";
import { VideoPlayer } from "@/components/kit/video-player";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import type { ShowRecording } from "@/src/lib/show-editor";
import {
  MAX_SHOW_EDIT_SOURCES, recordingNotes, RECORDINGS_SHOWN, setSourceRole, SHOW_EDIT_SOURCE_ROLE_LABELS, SHOW_EDIT_SOURCE_ROLES,
  sourceSelectionError, toggleFolder, toggleSource, visibleRecordings, type ShowEditSource, type ShowEditSourceRole
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

const CANT_PLAY = "This browser can't play this file. Try Safari.";

/** How often the picker asks again while Drive converts a recording, and when it stops asking. */
const PREVIEW_POLL_MS = 4000;
const PREVIEW_GIVE_UP_MS = 15 * 60 * 1000;

/**
 * One recording playing inline; its link is minted when it opens (GET /api/show-roles/edits?preview=). Drive
 * converts a switcher recording for the browser first, so the picker asks again until it's ready.
 */
function RecordingPreview({ recording }: { recording: ShowRecording }) {
  const [url, setUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const ask = () =>
      fetch(`/api/show-roles/edits?preview=${encodeURIComponent(recording.path)}`, { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json().catch(() => ({}))) as {
            data?: { ready?: boolean; url?: string | null }; error?: { message?: string };
          };
          if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Couldn't load the preview.");
          if (!current) return;
          if (body.data.ready && body.data.url) {
            setUrl(body.data.url);
            return;
          }
          if (Date.now() - startedAt > PREVIEW_GIVE_UP_MS) throw new Error("The preview is taking too long. Try again later.");
          setPreparing(true);
          timer = setTimeout(ask, PREVIEW_POLL_MS);
        })
        .catch((reason: unknown) => {
          if (current) setError(reason instanceof Error ? reason.message : "Couldn't load the preview.");
        });
    void ask();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [recording.path]);
  if (error) return <InlineNote tone="warning">{error}</InlineNote>;
  if (!url) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {preparing
          ? "Preparing the preview. The first look at a recording takes a minute or two."
          : "Loading the preview…"}
      </p>
    );
  }
  return (
    <VideoPlayer
      src={url}
      preload="metadata"
      className="max-w-xl rounded-md border border-border"
      label={`Preview of ${recording.name}`}
      onError={() => setError(CANT_PLAY)}
    />
  );
}

/** Which recording's preview is open (one at a time). */
type PreviewProps = { previewPath: string | null; onPreview: (path: string | null) => void };

function FileRow({ recording, chosen, disabled, note, onToggle, previewPath, onPreview }: {
  recording: ShowRecording; chosen: boolean; disabled: boolean; note?: string; onToggle: () => void;
} & PreviewProps) {
  const previewing = previewPath === recording.path;
  return (
    <div className="space-y-2 px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-3">
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
        <Button type="button" size="sm" variant="ghost" className="shrink-0" aria-expanded={previewing}
          aria-label={`Preview ${recording.name}`} onClick={() => onPreview(previewing ? null : recording.path)}>
          <Play aria-hidden />
          Preview
        </Button>
      </div>
      {previewing ? <RecordingPreview recording={recording} /> : null}
    </div>
  );
}

function FolderRows({ group, selected, disabled, notes, onChange, previewPath, onPreview }: {
  group: Group & { folder: string }; selected: ShowEditSource[]; disabled: boolean; notes: Record<string, string>;
  onChange: (next: ShowEditSource[]) => void;
} & PreviewProps) {
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
              onToggle={() => onChange(toggleSource(selected, recording.path))} previewPath={previewPath} onPreview={onPreview} />
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

/** The loose files: the newest 6 and any older ticked ones, with Show older / Show fewer. */
function LooseFiles({ files, chosen, selected, disabled, notes, onChange, previewPath, onPreview }: {
  files: ShowRecording[]; chosen: Set<string>; selected: ShowEditSource[]; disabled: boolean; notes: Record<string, string>;
  onChange: (next: ShowEditSource[]) => void;
} & PreviewProps) {
  const [showAll, setShowAll] = useState(false);
  const { shown, hidden } = visibleRecordings(files, chosen, showAll);
  return (
    <div>
      {shown.map((recording) => (
        <FileRow key={recording.path} recording={recording} chosen={chosen.has(recording.path)} disabled={disabled} note={notes[recording.path]}
          onToggle={() => onChange(toggleSource(selected, recording.path))} previewPath={previewPath} onPreview={onPreview} />
      ))}
      {hidden > 0 || (showAll && files.length > RECORDINGS_SHOWN) ? (
        <div className="px-3 py-1">
          <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show ${hidden} older`}
          </Button>
        </div>
      ) : null}
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
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  if (recordings.length === 0) {
    return <p className="text-sm text-muted-foreground">No recordings in the Shows folder on Drive yet.</p>;
  }
  const chosen = new Set(selected.map((source) => source.path));
  const notes = recordingNotes(recordings);
  const preview = { previewPath, onPreview: setPreviewPath };
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Recordings in the Shows folder" className="divide-y divide-border rounded-md border border-border">
        {groupsOf(recordings).map((group) =>
          group.folder === null ? (
            <LooseFiles key="loose" files={group.files} chosen={chosen} selected={selected} disabled={disabled}
              notes={notes} onChange={onChange} {...preview} />
          ) : (
            <FolderRows key={group.folder} group={{ ...group, folder: group.folder }} selected={selected} disabled={disabled}
              notes={notes} onChange={onChange} {...preview} />
          )
        )}
      </div>
      <ChosenSources selected={selected} disabled={disabled} onChange={onChange} />
    </div>
  );
}
