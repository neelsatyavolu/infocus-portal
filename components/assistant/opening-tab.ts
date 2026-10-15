import type { PanelMode } from "@/components/assistant/panel-header";

/**
 * The tab the ✱ panel opens on: Assistant while a reply or an approval is pending, else
 * Messages when there are more unread messages than the reader already turned away from, else
 * Assistant when a reply landed while the panel was closed, else the tab picked last.
 */
export function openingTab({
  busy,
  hasOpenApproval,
  unread,
  declinedUnread,
  assistantNews,
  remembered
}: {
  busy: boolean;
  hasOpenApproval: boolean;
  unread: number;
  /** Unread messages the reader saw counted and picked Assistant over. */
  declinedUnread: number;
  assistantNews: boolean;
  /** Read only when nothing else decides (it touches localStorage). */
  remembered: () => PanelMode;
}): PanelMode {
  if (busy || hasOpenApproval) {
    return "assistant";
  }
  if (unread > declinedUnread) {
    return "messages";
  }
  if (assistantNews) {
    return "assistant";
  }
  return remembered();
}
