import type { PackageCategory, PlatformRole } from "@prisma/client";
import { filterGroupsForViewer } from "@/src/lib/groups-visibility";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { isCustomQueuePackage } from "@/src/lib/publishing-queue";

export const HUB_CHAT_BODY_MAX = 2000;
export const HUB_CHAT_THREAD_MAX = 200;

export type HubChatViewer = {
  platformRole: PlatformRole | null;
  currentUserId: string;
  producerCategory: PackageCategory | null;
};

type ChatGroupRow = {
  id: string;
  assignedProducerUserId?: string | null;
  assignedExecutiveProducerUserId?: string | null;
  category?: PackageCategory | null;
  members: Array<{ userId: string }>;
};

export function canStartDirectChat(role: PlatformRole | null) {
  return hasPlatformRole(role, "ASSOCIATE_PRODUCER");
}

export function isFilledChatGroup<T extends { groupTopic?: string | null; members: unknown[] }>(row: T) {
  return Boolean(row.groupTopic?.trim()) || row.members.length > 0;
}

export function isHubChatGroup<
  T extends {
    groupTopic?: string | null;
    members: unknown[];
    cycleNumber?: number | null;
    groupType?: string | null;
  }
>(row: T) {
  return isFilledChatGroup(row) && !isCustomQueuePackage(row);
}

export function groupChatParticipantIds(row: {
  assignedProducerUserId?: string | null;
  assignedExecutiveProducerUserId?: string | null;
  members: Array<{ userId: string }>;
}) {
  const ids = new Set<string>();
  for (const member of row.members) {
    ids.add(member.userId);
  }
  if (row.assignedProducerUserId) {
    ids.add(row.assignedProducerUserId);
  }
  if (row.assignedExecutiveProducerUserId) {
    ids.add(row.assignedExecutiveProducerUserId);
  }
  return [...ids];
}

export function visibleChatGroups<T extends ChatGroupRow>(rows: T[], viewer: HubChatViewer) {
  const producerVisible = viewer.platformRole
    ? new Set(filterGroupsForViewer(rows, viewer).map((row) => row.id))
    : new Set<string>();
  return rows.filter(
    (row) =>
      row.members.some((member) => member.userId === viewer.currentUserId) || producerVisible.has(row.id)
  );
}

export function canAccessGroupChat<T extends ChatGroupRow>(row: T, viewer: HubChatViewer) {
  return visibleChatGroups([row], viewer).length === 1;
}

export function directChatKey(userIdA: string, userIdB: string) {
  return userIdA < userIdB ? `${userIdA}:${userIdB}` : `${userIdB}:${userIdA}`;
}

export function unreadCountForChat(input: {
  userId: string;
  lastReadAt: Date | null;
  messages: Array<{ authorId: string; createdAt: Date }>;
}) {
  return input.messages.filter((message) => {
    if (message.authorId === input.userId) {
      return false;
    }
    if (!input.lastReadAt) {
      return true;
    }
    return message.createdAt > input.lastReadAt;
  }).length;
}

export function formatGroupChatTitle(memberNames: string[]) {
  const names = [
    ...new Set(memberNames.map((name) => name.trim()).filter(Boolean))
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return names.join(", ");
}

export function formatGroupChatSubtitle(groupTopic: string, cycleNumber: number) {
  return groupTopic.trim() || `Cycle ${cycleNumber}`;
}

export function sortHubInbox<T extends { updatedAt: string | null; title: string }>(chats: T[]) {
  return [...chats].sort((a, b) => {
    if (a.updatedAt && b.updatedAt) {
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    if (a.updatedAt) {
      return -1;
    }
    if (b.updatedAt) {
      return 1;
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

export function sanitizeHubChatBody(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("BAD_REQUEST");
  }
  const body = value.trim().slice(0, HUB_CHAT_BODY_MAX);
  if (!body) {
    throw new Error("BAD_REQUEST");
  }
  return body;
}
