"use client";

import { useEffect, useState } from "react";
import {
  readAssistantStream,
  uid,
  type ActionState,
  type ChatMessage,
  type PlaceState
} from "@/components/assistant/assistant-stream";

/** How long "Conversation cleared · Undo" stays up. */
const UNDO_MS = 6000;

type ClearedSnapshot = {
  messages: ChatMessage[];
  error: string | null;
  actionState: Record<string, ActionState>;
  actionNote: Record<string, string>;
  placeState: Record<string, PlaceState>;
};

/**
 * The assistant conversation: POST /api/assistant/chat with the whole client history (the
 * server keeps the last 12), streamed progress steps, approval cards (POST
 * /api/assistant/actions) and place cards. Lives in the panel, so it survives closing it.
 */
export function useAssistantChat({
  onSend,
  onReplyLanded
}: {
  /** Pin the conversation to the bottom again. */
  onSend: () => void;
  /** A reply (or its error) arrived. */
  onReplyLanded: () => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusSteps, setStatusSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [actionState, setActionState] = useState<Record<string, ActionState>>({});
  const [actionNote, setActionNote] = useState<Record<string, string>>({});
  const [placeState, setPlaceState] = useState<Record<string, PlaceState>>({});
  const [cleared, setCleared] = useState<ClearedSnapshot | null>(null);

  useEffect(() => {
    if (!cleared) {
      return;
    }
    const timer = window.setTimeout(() => setCleared(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [cleared]);

  /** Sends the composer text, or a Try suggestion. Either way the composer is emptied. */
  async function send(starter?: string) {
    const content = (starter ?? input).trim();
    if (!content || busy) {
      return;
    }

    const nextMessages: ChatMessage[] = [...messages, { id: uid(), role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setStatusSteps([]);
    setError(null);
    setCleared(null);
    onSend();

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({ role: message.role, content: message.content }))
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? "Assistant is unavailable.");
      }

      const payload = await readAssistantStream(response, (label) => {
        setStatusSteps((current) => (current[current.length - 1] === label ? current : [...current, label]));
      });
      const reply = payload.reply?.trim();
      if (!reply) {
        throw new Error("Assistant returned an empty reply.");
      }

      setMessages([
        ...nextMessages,
        {
          id: uid(),
          role: "assistant",
          content: reply,
          sources: payload.sources,
          proposals: payload.proposals,
          places: payload.places
        }
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Assistant is unavailable.");
    } finally {
      setBusy(false);
      setStatusSteps([]);
      onReplyLanded();
    }
  }

  /**
   * Clear: wipes the thread and offers Undo. Not while a reply is on its way: the reply would
   * land on the old history and bring the whole cleared thread back.
   */
  function clear() {
    if (busy || messages.length === 0) {
      return;
    }
    setCleared({ messages, error, actionState, actionNote, placeState });
    setMessages([]);
    setError(null);
    setActionState({});
    setActionNote({});
    setPlaceState({});
  }

  function undoClear() {
    if (!cleared) {
      return;
    }
    setMessages(cleared.messages);
    setError(cleared.error);
    // An approval that was saving when the thread was cleared and has finished since keeps its
    // result, instead of the "running" it was snapshotted in.
    setActionState((current) => ({ ...cleared.actionState, ...current }));
    setActionNote((current) => ({ ...cleared.actionNote, ...current }));
    setPlaceState(cleared.placeState);
    setCleared(null);
  }

  async function decideAction(token: string, approve: boolean) {
    if (!approve) {
      setActionState((current) => ({ ...current, [token]: "dismissed" }));
      return;
    }
    setActionState((current) => ({ ...current, [token]: "running" }));
    try {
      const response = await fetch("/api/assistant/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const payload = (await response.json()) as { data?: { message?: string }; error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not make that change.");
      }
      setActionState((current) => ({ ...current, [token]: "done" }));
      setActionNote((current) => ({ ...current, [token]: payload.data?.message ?? "Done." }));
    } catch (caught) {
      setActionState((current) => ({ ...current, [token]: "error" }));
      setActionNote((current) => ({
        ...current,
        [token]: caught instanceof Error ? caught.message : "Could not make that change."
      }));
    }
  }

  function setPlace(id: string, state: PlaceState) {
    setPlaceState((current) => ({ ...current, [id]: state }));
  }

  /** An approval card nobody has answered yet (or one that is saving). */
  const hasOpenApproval = messages.some((message) =>
    message.proposals?.some((proposal) => {
      const state = actionState[proposal.token] ?? "pending";
      return state === "pending" || state === "running";
    })
  );

  return {
    input,
    setInput,
    busy,
    statusSteps,
    error,
    messages,
    actionState,
    actionNote,
    placeState,
    cleared: cleared !== null,
    hasOpenApproval,
    send,
    clear,
    undoClear,
    decideAction,
    setPlace
  };
}
