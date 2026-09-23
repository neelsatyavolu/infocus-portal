import { isExcludedFromGrading, loadNonGradableEmails } from "@/src/lib/gradable-roster";
import {
  canAccessGroupChat,
  canStartDirectChat,
  directChatKey,
  formatGroupChatSubtitle,
  formatGroupChatTitle,
  groupChatParticipantIds,
  HUB_CHAT_THREAD_MAX,
  isHubChatGroup,
  sanitizeHubChatBody,
  sortHubInbox,
  visibleChatGroups,
  type HubChatViewer
} from "@/src/lib/hub-chat";
import { getPlatformRoleForEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";

const personSelect = { id: true, name: true, nickname: true, email: true } as const;

const groupSelect = {
  id: true,
  cycleNumber: true,
  groupTopic: true,
  groupType: true,
  category: true,
  assignedProducerUserId: true,
  assignedExecutiveProducerUserId: true,
  members: { select: { userId: true, user: { select: personSelect } } }
} as const;

type GroupRow = {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  groupType: string;
  category: "NEWS" | "FEATURE" | "COMMENTARY" | null;
  assignedProducerUserId: string | null;
  assignedExecutiveProducerUserId: string | null;
  members: Array<{ userId: string; user: { id: string; name: string | null; nickname: string | null; email: string | null } }>;
};

async function viewerFor(userId: string): Promise<HubChatViewer & { name: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: personSelect
  });
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  const platformRole = await getPlatformRoleForEmail(user.email);
  return {
    platformRole,
    currentUserId: userId,
    producerCategory: null,
    name: userDisplayName(user) || "You"
  };
}

async function loadFilledGroups() {
  const rows = await prisma.packageProgressRow.findMany({
    orderBy: [{ cycleNumber: "asc" }, { rowOrder: "asc" }],
    select: groupSelect
  });
  return rows.filter((row) => isHubChatGroup(row));
}

function serializePerson(person: { id: string; name: string | null; nickname: string | null; email: string | null }) {
  return { id: person.id, name: userDisplayName(person) || person.email || "Unknown" };
}

function groupLabels(row: {
  groupTopic: string;
  cycleNumber: number;
  members: Array<{ user: { id: string; name: string | null; nickname: string | null; email: string | null } }>;
}) {
  const title =
    formatGroupChatTitle(row.members.map((member) => serializePerson(member.user).name)) || "No members";
  return {
    title,
    subtitle: formatGroupChatSubtitle(row.groupTopic, row.cycleNumber)
  };
}

async function classMembers(excludeUserId: string) {
  const [users, nonGradableEmails] = await Promise.all([
    prisma.user.findMany({
      select: personSelect,
      orderBy: [{ name: "asc" }, { email: "asc" }]
    }),
    loadNonGradableEmails()
  ]);
  return users
    .filter((user) => user.id !== excludeUserId && !isExcludedFromGrading(user, nonGradableEmails))
    .map(serializePerson);
}

async function requireClassMember(userId: string) {
  const [user, nonGradableEmails] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: personSelect }),
    loadNonGradableEmails()
  ]);
  if (!user || isExcludedFromGrading(user, nonGradableEmails)) {
    throw new Error("NOT_FOUND");
  }
  return user;
}

async function ensureMembers(chatId: string, userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) {
    return;
  }
  await prisma.hubChatMember.createMany({
    data: unique.map((userId) => ({ chatId, userId })),
    skipDuplicates: true
  });
}

async function markRead(chatId: string, userId: string) {
  await prisma.hubChatMember.updateMany({
    where: { chatId, userId },
    data: { lastReadAt: new Date() }
  });
}

type UnreadMembership = { chatId: string; lastReadAt: Date | null };

/**
 * Unread per chat in one grouped count: messages by other people, newer than the
 * membership's lastReadAt (all of them when it was never read). Same rule as
 * unreadCountForChat, but counted in the database instead of loading every message.
 */
async function unreadCountsByChat(userId: string, memberships: UnreadMembership[]) {
  if (memberships.length === 0) {
    return new Map<string, number>();
  }
  const grouped = await prisma.hubChatMessage.groupBy({
    by: ["chatId"],
    where: {
      authorId: { not: userId },
      OR: memberships.map((membership) =>
        membership.lastReadAt
          ? { chatId: membership.chatId, createdAt: { gt: membership.lastReadAt } }
          : { chatId: membership.chatId }
      )
    },
    _count: { _all: true }
  });
  return new Map(grouped.map((group) => [group.chatId, group._count._all] as const));
}

export async function unreadHubChatCount(userId: string) {
  const [viewer, memberships] = await Promise.all([
    viewerFor(userId),
    prisma.hubChatMember.findMany({
      where: { userId },
      select: {
        chatId: true,
        lastReadAt: true,
        chat: { select: { kind: true, packageRow: { select: groupSelect } } }
      }
    })
  ]);
  const visibleMemberships = memberships.filter(({ chat }) =>
    chat.kind === "DIRECT" ||
    (chat.packageRow && isHubChatGroup(chat.packageRow) && canAccessGroupChat(chat.packageRow, viewer))
  );
  const counts = await unreadCountsByChat(userId, visibleMemberships);
  return [...counts.values()].reduce((sum, count) => sum + count, 0);
}

async function upsertGroupChat(packageRowId: string) {
  const existing = await prisma.hubChat.findUnique({
    where: { packageRowId },
    select: { id: true }
  });
  if (existing) {
    return existing;
  }
  try {
    return await prisma.hubChat.create({
      data: { kind: "GROUP", packageRowId },
      select: { id: true }
    });
  } catch {
    const raced = await prisma.hubChat.findUnique({
      where: { packageRowId },
      select: { id: true }
    });
    if (!raced) {
      throw new Error("CONFLICT");
    }
    return raced;
  }
}

async function upsertDirectChat(userId: string, peerId: string) {
  const key = directChatKey(userId, peerId);
  const existing = await prisma.hubChat.findUnique({
    where: { directKey: key },
    select: { id: true }
  });
  if (existing) {
    return existing;
  }
  try {
    return await prisma.hubChat.create({
      data: {
        kind: "DIRECT",
        directKey: key,
        members: { create: [{ userId }, { userId: peerId }] }
      },
      select: { id: true }
    });
  } catch {
    const raced = await prisma.hubChat.findUnique({
      where: { directKey: key },
      select: { id: true }
    });
    if (!raced) {
      throw new Error("CONFLICT");
    }
    return raced;
  }
}

export async function listHubInbox(userId: string) {
  const viewer = await viewerFor(userId);
  const [groups, memberships, people] = await Promise.all([
    loadFilledGroups(),
    prisma.hubChatMember.findMany({
      where: { userId },
      select: {
        lastReadAt: true,
        chat: {
          select: {
            id: true,
            kind: true,
            packageRowId: true,
            updatedAt: true,
            members: { select: { userId: true, user: { select: personSelect } } },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                body: true,
                createdAt: true,
                authorId: true,
                author: { select: personSelect }
              }
            }
          }
        }
      }
    }),
    canStartDirectChat(viewer.platformRole) ? classMembers(userId) : Promise.resolve([])
  ]);

  const visibleGroups = visibleChatGroups(groups, viewer);
  const groupByRowId = new Map(
    memberships
      .filter((entry) => entry.chat.kind === "GROUP" && entry.chat.packageRowId)
      .map((entry) => [entry.chat.packageRowId as string, entry] as const)
  );

  const unreadByChatId = await unreadCountsByChat(
    userId,
    memberships.map((entry) => ({ chatId: entry.chat.id, lastReadAt: entry.lastReadAt }))
  );

  const groupChats = visibleGroups.map((row) => {
    const existing = groupByRowId.get(row.id);
    const last = existing?.chat.messages[0];
    const labels = groupLabels(row);
    return {
      id: existing?.chat.id ?? null,
      kind: "GROUP" as const,
      title: labels.title,
      subtitle: labels.subtitle,
      preview: last?.body ?? null,
      updatedAt: last?.createdAt.toISOString() ?? null,
      unreadCount: existing ? (unreadByChatId.get(existing.chat.id) ?? 0) : 0,
      packageRowId: row.id,
      cycleNumber: row.cycleNumber
    };
  });

  const groupChatIds = new Set(groupChats.map((chat) => chat.id).filter(Boolean));
  const directChats = memberships
    .filter((entry) => entry.chat.kind === "DIRECT")
    .map((entry) => {
      const peer = entry.chat.members.find((member) => member.userId !== userId)?.user;
      const last = entry.chat.messages[0];
      return {
        id: entry.chat.id,
        kind: "DIRECT" as const,
        title: peer ? serializePerson(peer).name : "Direct message",
        subtitle: "Direct",
        preview: last?.body ?? null,
        updatedAt: last?.createdAt.toISOString() ?? entry.chat.updatedAt.toISOString(),
        unreadCount: unreadByChatId.get(entry.chat.id) ?? 0,
        peer: peer ? serializePerson(peer) : null
      };
    });

  const chats = sortHubInbox([...groupChats, ...directChats]);
  const unreadCount = [...unreadByChatId.entries()].reduce((sum, [chatId, count]) => {
    if (groupChatIds.has(chatId) || directChats.some((chat) => chat.id === chatId)) {
      return sum + count;
    }
    return sum;
  }, 0);

  const dmPeerIds = new Set(directChats.map((chat) => chat.peer?.id).filter(Boolean));
  const members = people.filter((person) => !dmPeerIds.has(person.id));

  return {
    me: { id: userId, name: viewer.name },
    canStartDirect: canStartDirectChat(viewer.platformRole),
    unreadCount,
    chats,
    members
  };
}

async function loadGroupOrThrow(packageRowId: string) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: packageRowId },
    select: groupSelect
  });
  if (!row || !isHubChatGroup(row)) {
    throw new Error("NOT_FOUND");
  }
  return row;
}

async function requireChatAccess(userId: string, chatId: string) {
  const [viewer, chat] = await Promise.all([
    viewerFor(userId),
    prisma.hubChat.findUnique({
      where: { id: chatId },
      include: {
        members: { select: { userId: true, lastReadAt: true, user: { select: personSelect } } },
        packageRow: { select: groupSelect }
      }
    })
  ]);
  if (!chat) {
    throw new Error("NOT_FOUND");
  }
  if (chat.kind === "GROUP") {
    if (!chat.packageRow || !isHubChatGroup(chat.packageRow) || !canAccessGroupChat(chat.packageRow, viewer)) {
      throw new Error("NOT_FOUND");
    }
  } else if (!chat.members.some((member) => member.userId === userId)) {
    throw new Error("NOT_FOUND");
  }
  return { viewer, chat };
}

function serializeMessages(
  messages: Array<{
    id: string;
    body: string;
    createdAt: Date;
    authorId: string;
    author: { id: string; name: string | null; nickname: string | null; email: string | null };
  }>
) {
  return messages.map((message) => ({
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    authorId: message.authorId,
    author: serializePerson(message.author)
  }));
}

function serializeChat(input: {
  id: string;
  kind: "DIRECT" | "GROUP";
  packageRowId: string | null;
  packageRow?: GroupRow | null;
  members: Array<{ userId: string; user: { id: string; name: string | null; nickname: string | null; email: string | null } }>;
  viewerId: string;
}) {
  const peer = input.members.find((member) => member.userId !== input.viewerId)?.user;
  const labels =
    input.kind === "GROUP" && input.packageRow ? groupLabels(input.packageRow) : null;
  return {
    id: input.id,
    kind: input.kind,
    title: labels?.title ?? (peer ? serializePerson(peer).name : "Direct message"),
    subtitle: labels?.subtitle ?? "Direct",
    packageRowId: input.packageRowId,
    peer: peer ? serializePerson(peer) : null
  };
}

async function loadThread(chatId: string, userId: string) {
  const messages = await prisma.hubChatMessage.findMany({
    where: { chatId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HUB_CHAT_THREAD_MAX,
    select: {
      id: true,
      body: true,
      createdAt: true,
      authorId: true,
      author: { select: personSelect }
    }
  });
  const chat = await prisma.hubChat.findUnique({
    where: { id: chatId },
    include: {
      members: { select: { userId: true, user: { select: personSelect } } },
      packageRow: { select: groupSelect }
    }
  });
  if (!chat) {
    throw new Error("NOT_FOUND");
  }
  return {
    chat: serializeChat({ ...chat, viewerId: userId }),
    messages: serializeMessages(messages.reverse())
  };
}

export async function openHubChat(
  userId: string,
  target: { kind: "GROUP"; packageRowId: string } | { kind: "DIRECT"; userId: string }
) {
  const viewer = await viewerFor(userId);

  if (target.kind === "GROUP") {
    const row = await loadGroupOrThrow(target.packageRowId);
    if (!canAccessGroupChat(row, viewer)) {
      throw new Error("NOT_FOUND");
    }
    const chat = await upsertGroupChat(row.id);
    await ensureMembers(chat.id, [...groupChatParticipantIds(row), userId]);
    await markRead(chat.id, userId);
    const thread = await loadThread(chat.id, userId);
    return { me: { id: userId, name: viewer.name }, ...thread };
  }

  if (target.userId === userId) {
    throw new Error("BAD_REQUEST");
  }
  const peer = await requireClassMember(target.userId);
  const existing = await prisma.hubChat.findUnique({
    where: { directKey: directChatKey(userId, peer.id) },
    select: { id: true }
  });
  if (!existing && !canStartDirectChat(viewer.platformRole)) {
    throw new Error("FORBIDDEN");
  }
  const chat = await upsertDirectChat(userId, peer.id);
  await ensureMembers(chat.id, [userId, peer.id]);
  await markRead(chat.id, userId);
  const thread = await loadThread(chat.id, userId);
  return { me: { id: userId, name: viewer.name }, ...thread };
}

export async function getHubChatThread(userId: string, chatId: string) {
  const { viewer, chat } = await requireChatAccess(userId, chatId);
  if (chat.kind === "GROUP" && chat.packageRow) {
    await ensureMembers(chat.id, [...groupChatParticipantIds(chat.packageRow), userId]);
  } else {
    await ensureMembers(chat.id, [userId]);
  }
  await markRead(chat.id, userId);
  const thread = await loadThread(chat.id, userId);
  return { me: { id: userId, name: viewer.name }, ...thread };
}

export async function sendHubChatMessage(userId: string, chatId: string, rawBody: unknown) {
  const body = sanitizeHubChatBody(rawBody);
  const { viewer, chat } = await requireChatAccess(userId, chatId);
  if (chat.kind === "GROUP" && chat.packageRow) {
    await ensureMembers(chat.id, [...groupChatParticipantIds(chat.packageRow), userId]);
  }
  const membership = await prisma.hubChatMember.findUnique({
    where: { chatId_userId: { chatId, userId } }
  });
  if (!membership) {
    throw new Error("FORBIDDEN");
  }
  const message = await prisma.hubChatMessage.create({
    data: { chatId, authorId: userId, body },
    select: {
      id: true,
      body: true,
      createdAt: true,
      authorId: true,
      author: { select: personSelect }
    }
  });
  await prisma.hubChat.update({
    where: { id: chatId },
    data: { updatedAt: new Date() }
  });
  await markRead(chatId, userId);
  return {
    me: { id: userId, name: viewer.name },
    message: serializeMessages([message])[0]
  };
}
