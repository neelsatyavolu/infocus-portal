"use client";

import { useId, type ReactNode, type RefObject } from "react";
import { MessageSquarePlus, MessagesSquare } from "lucide-react";
import { ChatTile } from "@/components/assistant/chat-tile";
import { inboxTimeLabel } from "@/components/assistant/chat-time";
import {
  chatKey,
  directChatFor,
  inboxRowLines,
  matchesQuery,
  type InboxChat,
  type InboxPayload
} from "@/components/assistant/hub-chat-client";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { SearchField } from "@/components/kit/search-field";
import { SectionLabel } from "@/components/kit/section";
import { Skeleton } from "@/components/kit/skeleton";
import { Spinner } from "@/components/kit/spinner";
import { CountBadge } from "@/components/kit/status-tag";
import { cn } from "@/src/lib/utils";

const SKELETON_ROWS = 6;

/**
 * Messages inbox: a search field pinned on top, then ONE list of group chats and direct chats,
 * newest activity first (no Groups/People/Unread sections). While a producer searches, people
 * without a chat yet follow under "Start a chat". Rows carry data-chat-id so Back can return
 * focus to the chat just left.
 */
export function InboxList({
  inbox,
  error,
  search,
  onSearch,
  searchRef,
  listRef,
  openingKey,
  onOpen,
  touch
}: {
  inbox: InboxPayload | null;
  error: string | null;
  search: string;
  onSearch: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  listRef: RefObject<HTMLDivElement | null>;
  /** The row whose chat is loading. */
  openingKey: string | null;
  onOpen: (chat: InboxChat) => void;
  touch: boolean;
}) {
  const query = search.trim();
  const chats = (inbox?.chats ?? []).filter((chat) => matchesQuery(query, chat.title, chat.subtitle));
  const people = query ? (inbox?.members ?? []).filter((person) => matchesQuery(query, person.name)) : [];
  const loading = inbox === null && !error;
  const now = new Date();
  const labelId = useId();
  const chatsLabelId = `${labelId}-chats`;
  const peopleLabelId = `${labelId}-people`;
  const bothGroups = chats.length > 0 && people.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <SearchField
          value={search}
          onChange={onSearch}
          inputRef={searchRef}
          placeholder={inbox?.canStartDirect ? "Search chats or people…" : "Search chats…"}
          ariaLabel={inbox?.canStartDirect ? "Search chats or people" : "Search chats"}
          className={cn("w-full", touch && "h-11 [&_input]:text-base")}
        />
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-busy={loading || undefined}>
        {error ? (
          <div className="px-4 pt-3">
            <Alert tone="danger" compact>
              {error}
            </Alert>
          </div>
        ) : null}

        {loading ? (
          <InboxSkeleton touch={touch} />
        ) : chats.length === 0 && people.length === 0 ? (
          error ? null : query ? (
            <EmptyState size="inline" title="No matching chats." className="py-4" />
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title="No chats yet."
              description={inbox?.canStartDirect ? "Search for a person to start one." : undefined}
              className="py-10"
            />
          )
        ) : (
          <>
            {bothGroups ? <ListLabel id={chatsLabelId}>Chats</ListLabel> : null}
            {chats.length > 0 ? (
              <ul className="py-1" aria-labelledby={bothGroups ? chatsLabelId : undefined}>
                {chats.map((chat) => {
                  const key = chatKey(chat);
                  const lines = inboxRowLines(chat);
                  const unread = chat.unreadCount > 0;
                  return (
                    <InboxRow
                      key={key}
                      chatId={chat.id}
                      tile={<ChatTile kind={chat.kind} name={chat.title} />}
                      primary={lines.primary}
                      secondary={lines.secondary}
                      meta={inboxTimeLabel(chat.updatedAt, now)}
                      trailing={<CountBadge count={chat.unreadCount} srLabel={`${chat.unreadCount} unread`} />}
                      emphasized={unread}
                      busy={openingKey === key}
                      onClick={() => onOpen(chat)}
                      touch={touch}
                    />
                  );
                })}
              </ul>
            ) : null}
            {people.length > 0 ? (
              <>
                <ListLabel id={peopleLabelId}>Start a chat</ListLabel>
                <ul className="pb-1" aria-labelledby={peopleLabelId}>
                  {people.map((person) => (
                    <InboxRow
                      key={person.id}
                      tile={<ChatTile kind="DIRECT" name={person.name} />}
                      primary={person.name}
                      srPrefix="Start a chat with "
                      trailing={<MessageSquarePlus className="h-4 w-4 text-muted-foreground" aria-hidden />}
                      busy={openingKey === person.id}
                      onClick={() => onOpen(directChatFor(person))}
                      touch={touch}
                    />
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function ListLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <SectionLabel id={id} className="px-4 pb-1 pt-3">
      {children}
    </SectionLabel>
  );
}

function InboxRow({
  chatId,
  tile,
  primary,
  secondary,
  meta,
  trailing,
  emphasized = false,
  busy,
  srPrefix,
  onClick,
  touch
}: {
  /** The chat this row opens (none for a person or a never-opened group). */
  chatId?: string | null;
  tile: ReactNode;
  primary: string;
  secondary?: string;
  /** Right of line 1: when the latest message arrived. */
  meta?: string;
  /** Right of line 2 (or of the only line): the unread count, or the new-chat icon. */
  trailing?: ReactNode;
  emphasized?: boolean;
  busy: boolean;
  srPrefix?: string;
  onClick: () => void;
  touch: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        data-chat-id={chatId ?? undefined}
        aria-busy={busy || undefined}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          touch ? "min-h-16" : "min-h-14"
        )}
      >
        {tile}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm text-foreground",
                emphasized ? "font-semibold" : "font-medium"
              )}
            >
              {srPrefix ? <span className="sr-only">{srPrefix}</span> : null}
              {primary}
            </span>
            {busy ? (
              <Spinner className="self-center text-muted-foreground" label="Opening" />
            ) : meta ? (
              <span className="shrink-0 font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">{meta}</span>
            ) : secondary === undefined ? (
              trailing
            ) : null}
          </span>
          {secondary !== undefined ? (
            <span className="mt-0.5 flex items-center gap-2">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px]",
                  emphasized ? "text-[var(--ink-text)]" : "text-muted-foreground"
                )}
              >
                {secondary}
              </span>
              {trailing}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function InboxSkeleton({ touch }: { touch: boolean }) {
  return (
    <div role="status" aria-label="Loading chats" className="py-1">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div key={index} className={cn("flex items-center gap-3 px-4 py-2.5", touch ? "min-h-16" : "min-h-14")}>
          <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={cn("h-3.5", index % 3 === 1 ? "w-1/2" : "w-2/3")} />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
