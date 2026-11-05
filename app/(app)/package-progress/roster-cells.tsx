"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Mic, StickyNote } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { NativeSelect } from "@/components/ui/native-select";
import { parseGroupMembers } from "@/src/lib/group-members";
import { exclusiveProducerAssignment, selectedAssignedProducerId } from "@/src/lib/package-producer-assignment";
import { cn } from "@/src/lib/utils";
import { MembersEditor, MEMBER_CHIP_CLASS } from "./members-editor";
import { NoteField } from "./roster-note-dialog";
import {
  assignedProducerOf,
  consecutiveWarning,
  firstNameOf,
  hasMembers,
  rowNumberLabel,
  type AssignableProducer,
  type ProgressRow,
  type RosterUser,
  type RowStatus
} from "./roster-model";
import {
  CELL_LABEL,
  FIELD_BORDER,
  FIELD_TEXT,
  IN_ROW_HOVER,
  KEY_VALUE_CELL,
  LINE_HEIGHT,
  STATIC_CELL_LABEL,
  STATIC_LINE_HEIGHT,
  WRAP_TAG_SM
} from "./roster-styles";

/** Everything a row's cells read that is the same for every row. */
export type RosterCellContext = {
  canEdit: boolean;
  /** Edit mode (editors only). */
  editing: boolean;
  canAssignProducer: boolean;
  /** A cycle is loading or failed to load: nothing can change. */
  locked: boolean;
  users: RosterUser[];
  usersById: Map<string, RosterUser>;
  producers: AssignableProducer[];
  executives: AssignableProducer[];
  producerOptions: Array<AssignableProducer & { kind: "ap" | "ep" }>;
  executiveIds: Set<string>;
  previousTeammatesByUser: Record<string, string[]>;
};

type UpdateRow = (next: Partial<ProgressRow>) => void;

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * The topic as an inline text field (contentEditable, so long topics wrap). Commits on blur, or
 * on Enter (Shift+Enter keeps a line break); outside changes sync in while it is not focused.
 */
function TopicField({
  value,
  number,
  disabled,
  onCommit
}: {
  value: string;
  number: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const latestValueRef = useRef(value);
  const isFocusedRef = useRef(false);
  const [empty, setEmpty] = useState(!value.trim());
  // Server-rendered text, so the field is filled before hydration. React 19 compares this prop by
  // identity and rewrites innerHTML when it changes, so it must be the same object on every render
  // (or typing would be wiped); later outside changes go through textContent instead.
  const [initialHtml] = useState(() => ({ __html: escapeHtml(value) }));

  useEffect(() => {
    latestValueRef.current = value;

    if (!isFocusedRef.current && editorRef.current && editorRef.current.innerText !== value) {
      editorRef.current.textContent = value;
    }
    if (!isFocusedRef.current) setEmpty(!value.trim());
  }, [value]);

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={editorRef}
        data-topic-field=""
        contentEditable={!disabled}
        role="textbox"
        aria-label={`Topic, group ${number}`}
        aria-multiline="true"
        aria-placeholder="Untitled package"
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        suppressContentEditableWarning
        dangerouslySetInnerHTML={initialHtml}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onInput={(event) => {
          latestValueRef.current = event.currentTarget.innerText;
          setEmpty(!latestValueRef.current.trim());
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        onBlur={(event) => {
          isFocusedRef.current = false;
          latestValueRef.current = event.currentTarget.innerText;
          setEmpty(!latestValueRef.current.trim());
          onCommit(latestValueRef.current);
        }}
        className={cn(
          "-mx-2 min-h-10 whitespace-pre-wrap break-words rounded-md px-[7px] py-[7px] font-semibold leading-6 text-foreground outline-none focus:border-input focus-visible:ring-2 focus-visible:ring-ring @4xl:min-h-8 @4xl:py-[3px]",
          FIELD_TEXT,
          FIELD_BORDER
        )}
      />
      {empty ? (
        <span
          aria-hidden
          className={cn("pointer-events-none absolute left-0 top-0 flex h-10 items-center text-muted-foreground @4xl:h-8", FIELD_TEXT)}
        >
          Untitled package
        </span>
      ) : null}
    </div>
  );
}

export function TopicCell({
  row,
  index,
  context,
  onUpdate
}: {
  row: ProgressRow;
  index: number;
  context: RosterCellContext;
  onUpdate: UpdateRow;
}) {
  const number = rowNumberLabel(index);
  return (
    <div className="flex min-w-0 items-start gap-2 [grid-area:topic]">
      <span className="w-6 shrink-0 font-mono-broadcast text-xs leading-10 tabular-nums text-muted-foreground @4xl:leading-8">
        {number}
      </span>
      {context.editing ? (
        <TopicField
          value={row.groupTopic}
          number={number}
          disabled={context.locked}
          onCommit={(value) => {
            if (value !== row.groupTopic) onUpdate({ groupTopic: value });
          }}
        />
      ) : (
        <p
          className={cn(
            "min-w-0 flex-1 break-words py-2 font-semibold leading-6 @4xl:py-1",
            FIELD_TEXT,
            row.groupTopic ? "text-foreground" : "font-normal text-muted-foreground"
          )}
        >
          {row.groupTopic || "Untitled package"}
        </p>
      )}
    </div>
  );
}

function MembersView({ row, usersById }: { row: ProgressRow; usersById: Map<string, RosterUser> }) {
  const linked = useMemo(
    () =>
      (row.memberUserIds ?? [])
        .map((id) => usersById.get(id))
        .filter((user): user is RosterUser => Boolean(user)),
    [row.memberUserIds, usersById]
  );
  const tokens = useMemo(() => parseGroupMembers(row.groupMembers), [row.groupMembers]);
  const box = cn("flex min-w-0 flex-wrap items-center gap-1 py-1", STATIC_LINE_HEIGHT);

  if (linked.length > 0) {
    return (
      <div className={box}>
        {linked.map((user) => (
          <span key={user.id} className={MEMBER_CHIP_CLASS} title={user.name?.trim() || user.email || undefined}>
            <span className="truncate">{firstNameOf(user)}</span>
          </span>
        ))}
      </div>
    );
  }

  if (!row.groupMembers) {
    return (
      <div className={box}>
        <StatusTag tone="warning" size="sm">
          No members
        </StatusTag>
      </div>
    );
  }
  if (tokens.length === 0) return <p className={cn(box, "text-sm leading-5 text-foreground")}>{row.groupMembers}</p>;
  return (
    <div className={box}>
      {tokens.map((token, tokenIndex) =>
        token.kind === "user" ? (
          <span key={`u-${tokenIndex}-${token.userId}`} className={MEMBER_CHIP_CLASS}>
            {token.firstName}
          </span>
        ) : (
          <span key={`t-${tokenIndex}`} className="text-sm text-foreground">
            {token.value}
          </span>
        )
      )}
    </div>
  );
}

export function MembersCell({
  row,
  context,
  onUpdate
}: {
  row: ProgressRow;
  context: RosterCellContext;
  onUpdate: UpdateRow;
}) {
  const warning = consecutiveWarning(row.memberUserIds ?? [], context.previousTeammatesByUser, context.usersById);
  const topic = row.groupTopic.trim() || "untitled package";
  return (
    <div className={cn(KEY_VALUE_CELL, "[grid-area:members]")}>
      <span className={cn(context.editing ? CELL_LABEL : STATIC_CELL_LABEL, "@4xl:sr-only")}>Members</span>
      <div className="min-w-0 space-y-1.5">
        {context.editing ? (
          <MembersEditor
            memberUserIds={row.memberUserIds ?? []}
            users={context.users}
            previousTeammatesByUser={context.previousTeammatesByUser}
            disabled={context.locked}
            addLabel={`Add members to ${topic}`}
            // The same gap warning as view mode, so editors see it too.
            emptyHint={
              hasMembers(row) ? null : (
                <StatusTag tone="warning" size="sm">
                  No members
                </StatusTag>
              )
            }
            onChangeAction={(next) => {
              const prevIds = row.memberUserIds ?? [];
              const sameIds =
                prevIds.length === next.memberUserIds.length &&
                prevIds.every((id, i) => id === next.memberUserIds[i]);
              if (sameIds && next.groupMembers === row.groupMembers) return;
              onUpdate({ groupMembers: next.groupMembers, memberUserIds: next.memberUserIds });
            }}
          />
        ) : (
          <MembersView row={row} usersById={context.usersById} />
        )}
        {warning ? (
          <StatusTag tone="warning" size="sm" icon={AlertTriangle} wrap className={WRAP_TAG_SM}>
            {warning}
          </StatusTag>
        ) : null}
      </div>
    </div>
  );
}

function ProducerSelect({
  id,
  row,
  context,
  onUpdate
}: {
  id: string;
  row: ProgressRow;
  context: RosterCellContext;
  onUpdate: UpdateRow;
}) {
  const value = selectedAssignedProducerId(row);
  const options = context.producerOptions;
  const known = !value || options.some((option) => option.userId === value);
  const assigned = row.assignedExecutiveProducerUserId ? row.assignedExecutiveProducer : row.assignedProducer;
  const label = (option: AssignableProducer) => option.name?.trim() || option.email || option.userId;
  const executivesList = options.filter((option) => option.kind === "ep");
  const associatesList = options.filter((option) => option.kind === "ap");

  return (
    <NativeSelect
      id={id}
      size="sm"
      value={value}
      disabled={context.locked}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        const nextId = event.target.value || null;
        const match = nextId ? options.find((option) => option.userId === nextId) ?? null : null;
        onUpdate(
          exclusiveProducerAssignment(
            nextId,
            match ? { userId: match.userId, name: match.name, email: match.email } : null,
            context.executiveIds
          )
        );
      }}
      wrapperClassName="-mx-2"
      className={cn(
        "h-10 border-transparent pl-[7px] group-hover/row:border-input focus-visible:border-input pointer-coarse:border-input @4xl:h-8",
        // Options inside optgroups are not direct children, so NativeSelect's option colors miss them.
        "[&_optgroup]:bg-popover [&_optgroup]:text-popover-foreground [&_option]:bg-popover [&_option]:text-popover-foreground",
        !value && "text-[var(--brand-amber)]"
      )}
    >
      <option value="">Unassigned</option>
      {!known ? (
        <option value={value}>
          {assigned?.name?.trim() || assigned?.email || "Assigned producer"} (not in producer list)
        </option>
      ) : null}
      {executivesList.length > 0 ? (
        <optgroup label="Executive producers">
          {executivesList.map((option) => (
            <option key={option.userId} value={option.userId}>
              {label(option)} · EP
            </option>
          ))}
        </optgroup>
      ) : null}
      {associatesList.length > 0 ? (
        <optgroup label="Associate producers">
          {associatesList.map((option) => (
            <option key={option.userId} value={option.userId}>
              {label(option)} · AP
            </option>
          ))}
        </optgroup>
      ) : null}
    </NativeSelect>
  );
}

export function ProducerCell({
  row,
  rowKey,
  context,
  onUpdate
}: {
  row: ProgressRow;
  rowKey: string;
  context: RosterCellContext;
  onUpdate: UpdateRow;
}) {
  const selectId = `producer-${rowKey}`;
  const editable = context.editing && context.canAssignProducer;
  const producer = editable ? null : assignedProducerOf(row, context.producers, context.executives);
  return (
    <div className={cn(KEY_VALUE_CELL, "[grid-area:producer]")}>
      {editable ? (
        <label htmlFor={selectId} className={cn(CELL_LABEL, "@4xl:sr-only")}>
          Producer
          <span className="sr-only"> for {row.groupTopic.trim() || "untitled package"}</span>
        </label>
      ) : (
        <span className={cn(STATIC_CELL_LABEL, "@4xl:sr-only")}>Producer</span>
      )}
      {editable ? (
        <ProducerSelect id={selectId} row={row} context={context} onUpdate={onUpdate} />
      ) : (
        <div className={cn("flex min-w-0 items-center gap-1.5", STATIC_LINE_HEIGHT)}>
          {producer ? (
            <>
              <span className="min-w-0 truncate text-sm text-foreground" title={producer.label}>
                {producer.label}
              </span>
              {producer.kind ? (
                <StatusTag tone="neutral" size="sm" title={producer.kind === "EP" ? "Executive producer" : "Associate producer"}>
                  {producer.kind}
                </StatusTag>
              ) : null}
            </>
          ) : (
            <StatusTag tone="warning" size="sm">
              Unassigned
            </StatusTag>
          )}
        </div>
      )}
    </div>
  );
}

export function NotesCell({
  row,
  context,
  onUpdate
}: {
  row: ProgressRow;
  context: RosterCellContext;
  onUpdate: UpdateRow;
}) {
  const interviews = row.possibleInterviews ?? "";
  const notes = row.possibleIdeas ?? "";
  const hasInterviews = interviews.trim().length > 0;
  const hasNotes = notes.trim().length > 0;
  // Editors always get both (an empty one reads "+ Add"); in view mode only notes with text show.
  const showInterviews = context.editing || hasInterviews;
  const showNotes = context.editing || hasNotes;
  const showBoth = showInterviews && showNotes;
  const showNone = !showInterviews && !showNotes;
  return (
    <div
      className={cn(
        "min-w-0 space-y-1 [grid-area:notes]",
        // Cards skip a note area with nothing in it (the table keeps its "—"). From @2xl,
        // Interviews | Notes share a line on the row's own columns (a subgrid), like Members |
        // Producer; a note on its own takes the whole line.
        showNone ? "hidden" : "@2xl:grid @2xl:grid-cols-subgrid @2xl:space-y-0",
        // Table: two fixed halves, Interviews then Notes (one note alone spans both), so every
        // row's icons and text start on the same lines; held to the top of the row like every
        // other cell instead of stretching to the row's height.
        "@4xl:grid @4xl:min-h-8 @4xl:grid-cols-2 @4xl:items-center @4xl:content-start @4xl:self-start @4xl:gap-x-3"
      )}
    >
      {showInterviews ? (
        <NoteField
          label="Interviews"
          icon={Mic}
          value={interviews}
          placeholder="Possible interviews…"
          topic={row.groupTopic}
          editing={context.editing}
          disabled={context.locked}
          className={showBoth ? undefined : "@2xl:col-span-full"}
          onCommit={(value) => onUpdate({ possibleInterviews: value })}
        />
      ) : null}
      {showNotes ? (
        <NoteField
          label="Notes"
          icon={StickyNote}
          value={notes}
          placeholder="Notes…"
          topic={row.groupTopic}
          editing={context.editing}
          disabled={context.locked}
          // Beside Interviews it starts on Producer's column (and spans the ⋮ column too, like Producer).
          className={showBoth ? "@2xl:[grid-column:2/-1]" : "@2xl:col-span-full"}
          onCommit={(value) => onUpdate({ possibleIdeas: value })}
        />
      ) : null}
      {showNone ? (
        <span className="hidden h-8 items-center text-sm text-muted-foreground @4xl:col-span-2 @4xl:flex">
          <span aria-hidden>—</span>
          <span className="sr-only">No interviews or notes</span>
        </span>
      ) : null}
    </div>
  );
}

/**
 * Stage status in the Groups words (read only), as one key/value line in card mode so its tags
 * start on the same edge as every other value. Links everyone to the group's pending stage.
 * The stage tag sits on the row's first line (centred like every other cell) and the extension
 * tag flows under it; both keep the 18px small-tag height.
 */
export function StatusCell({ status, topic }: { status: RowStatus; topic: string }) {
  const tags = (
    <span className="flex min-w-0 flex-col items-start">
      <span className={cn("flex min-w-0 items-center", LINE_HEIGHT)}>
        <StatusTag tone={status.tile.tone} size="sm" wrap className={WRAP_TAG_SM}>
          {status.tile.label}
        </StatusTag>
      </span>
      {status.extension ? (
        <span className="flex min-w-0 pb-2">
          <StatusTag tone="warning" size="sm" wrap className={WRAP_TAG_SM}>
            {status.extension}
          </StatusTag>
        </span>
      ) : null}
    </span>
  );
  return (
    <div className={cn(KEY_VALUE_CELL, "[grid-area:status]")}>
      <span className={cn(CELL_LABEL, "@4xl:sr-only")}>Stage</span>
      {status.href ? (
        <Link
          href={status.href as never}
          title="Open in Groups"
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "-mx-1.5 block min-w-0 rounded-md px-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            IN_ROW_HOVER
          )}
        >
          {tags}
          <span className="sr-only">. Open {topic.trim() || "this package"} in Groups</span>
        </Link>
      ) : (
        tags
      )}
    </div>
  );
}
