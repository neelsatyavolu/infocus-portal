import type { AnchorSlotRequest, AnchorSlotRequestKind } from "@prisma/client";
import { extractCalendarAnchors, setCalendarAnchors } from "@/src/lib/calendar-show-content";
import { buildCastNameDirectory, castNameMatchesUser, type CastNameDirectory } from "@/src/lib/cast-name-directory";
import { sendBrandedEmails } from "@/src/lib/email";
import { mainAppOrigin } from "@/src/lib/hosts";
import { pacificDateKey, pacificWallTimeToUtc } from "@/src/lib/meetings/schedule";
import { PACKAGE_ADVISER_EMAIL } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { formatShowDateLabel } from "@/src/lib/show-assignment";
import { markMasterCalendarEdited } from "@/src/server/master-calendar-sync";
import { sendPushToUserIds } from "@/src/server/push-notify";
import { findShowManagerEmail, resolveShowManagers } from "@/src/server/show-manager";
import { hasSufficientAnchorNotice } from "@/src/show-roles/lib/anchors";

/**
 * Anchor drop / swap requests (class rule: dropping a slot needs 48 hours' notice). An assigned
 * anchor asks; a producer (anyone who can edit show roles) approves or denies. Approving writes
 * that one show's anchors, on the Master Calendar entry and the generator's ShowRolesShow row.
 */

export class AnchorRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Notice is measured to the start of the show day (12:00 AM Pacific). */
export function showNoticeDeadline(showDate: string) {
  return pacificWallTimeToUtc(showDate, 0, 0);
}

export function isLateAnchorNotice(showDate: string, now: Date) {
  return !hasSufficientAnchorNotice(showNoticeDeadline(showDate), now);
}

/** The pair after a decision: a swap puts the classmate in the requester's slot, a drop empties it. */
export function anchorsAfterRequest(
  current: string[],
  requesterSlot: number,
  kind: AnchorSlotRequestKind,
  swapName: string | null
) {
  if (kind === "SWAP") {
    if (!swapName) throw new AnchorRequestError("Pick the classmate to swap with.", 400);
    return current.map((name, index) => (index === requesterSlot ? swapName : name));
  }
  return current.filter((_, index) => index !== requesterSlot);
}

async function loadDirectory() {
  const users = await prisma.user.findMany({ select: { id: true, name: true, nickname: true, email: true } });
  return buildCastNameDirectory(users);
}

function anchorsFrom(calendarContent: string | null | undefined, stored: unknown) {
  const calendar = calendarContent ? extractCalendarAnchors(calendarContent) : [];
  if (calendar.length > 0) return calendar;
  return Array.isArray(stored) ? stored.filter((name): name is string => typeof name === "string" && name.trim().length > 0) : [];
}

async function loadShowAnchors(showDate: string) {
  const [entry, show] = await Promise.all([
    prisma.masterCalendarEntry.findUnique({ where: { date: showDate }, select: { content: true } }),
    prisma.showRolesShow.findUnique({ where: { date: showDate }, select: { anchors: true } })
  ]);
  return anchorsFrom(entry?.content, show?.anchors);
}

function slotOf(anchors: string[], directory: CastNameDirectory, userId: string) {
  return anchors.findIndex((name) => castNameMatchesUser(directory, userId, name));
}

// ---------- Notifications ----------

function showRolesLink() {
  return `${mainAppOrigin()}/show-roles?generator=1`;
}

async function contactsFor(userIds: string[]) {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, notificationPreference: { select: { notificationEmail: true } } }
  });
  return users.map((user) => ({ id: user.id, email: (user.notificationPreference?.notificationEmail ?? user.email ?? "").trim() }));
}

async function deliver(recipients: { emails: string[]; userIds: string[] }, subject: string, lines: string[], key: string) {
  const url = showRolesLink();
  await Promise.all([
    recipients.emails.length > 0
      ? sendBrandedEmails({
          recipients: recipients.emails,
          subject,
          heading: subject,
          paragraphs: lines,
          ctaLabel: "Open Show Roles",
          ctaUrl: url,
          idempotencyKey: key
        })
      : null,
    sendPushToUserIds(recipients.userIds, { title: subject, body: lines[0] ?? subject, url })
  ]);
}

/** That show's manager (Master Calendar override or rotation); the adviser when nobody resolves. */
async function showManagerRecipients(showDate: string) {
  const { managers } = await resolveShowManagers([showDate]);
  const name = managers[showDate]?.name ?? "";
  const email = (name ? await findShowManagerEmail(name) : "") || PACKAGE_ADVISER_EMAIL || "";
  if (!email) return { emails: [], userIds: [] };
  const users = await prisma.user.findMany({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  return { emails: [email], userIds: users.map((user) => user.id) };
}

function describe(request: Pick<AnchorSlotRequest, "kind">, swapName: string | null) {
  return request.kind === "SWAP" ? `swap with ${swapName ?? "a classmate"}` : "drop their anchor slot";
}

async function notifyManagersOfRequest(request: AnchorSlotRequest, requesterName: string, swapName: string | null) {
  const label = formatShowDateLabel(request.showDate);
  const lines = [
    `${requesterName} asked to ${describe(request, swapName)} for the ${label} show.`,
    request.lateNotice ? "This is late notice: less than 48 hours before the show." : "Notice was given at least 48 hours ahead.",
    ...(request.reason ? [`Reason: ${request.reason}`] : []),
    "Approve or deny it in Show Roles."
  ];
  await deliver(await showManagerRecipients(request.showDate), `Anchor ${request.kind === "SWAP" ? "swap" : "drop"} request for ${label}`, lines, `anchor-request-${request.id}`);
}

async function notifyDecision(request: AnchorSlotRequest, swapName: string | null) {
  const label = formatShowDateLabel(request.showDate);
  const approved = request.status === "APPROVED";
  const requester = await contactsFor([request.userId]);
  const subject = `Your anchor ${request.kind === "SWAP" ? "swap" : "drop"} for ${label} was ${approved ? "approved" : "denied"}`;
  const lines = approved
    ? [
        request.kind === "SWAP"
          ? `${swapName ?? "Your classmate"} now anchors the ${label} show in your place.`
          : `You're off the ${label} show. The show manager will fill the slot.`
      ]
    : [`You're still anchoring the ${label} show. Talk to the show manager if you can't make it.`];
  await deliver(
    { emails: requester.map((user) => user.email).filter(Boolean), userIds: requester.map((user) => user.id) },
    subject,
    lines,
    `anchor-request-${request.id}-${request.status}`
  );
  if (approved && request.kind === "SWAP" && request.swapWithUserId) {
    const classmate = await contactsFor([request.swapWithUserId]);
    await deliver(
      { emails: classmate.map((user) => user.email).filter(Boolean), userIds: classmate.map((user) => user.id) },
      `You're anchoring the ${label} show`,
      [`You swapped in as an anchor for the ${label} show.`],
      `anchor-request-${request.id}-swap-in`
    );
  }
}

function logNotifyFailure(error: unknown) {
  console.error("anchor requests: notification failed", error);
}

// ---------- Requests ----------

export async function createAnchorSlotRequest(input: {
  userId: string;
  showDate: string;
  kind: AnchorSlotRequestKind;
  swapWithUserId?: string | null;
  reason: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.showDate < pacificDateKey(now)) {
    throw new AnchorRequestError("That show already aired.", 400);
  }
  const [anchors, directory] = await Promise.all([loadShowAnchors(input.showDate), loadDirectory()]);
  if (slotOf(anchors, directory, input.userId) === -1) {
    throw new AnchorRequestError("You're not anchoring that show.", 403);
  }

  let swapWithUserId: string | null = null;
  if (input.kind === "SWAP") {
    swapWithUserId = input.swapWithUserId ?? null;
    if (!swapWithUserId || swapWithUserId === input.userId || !directory.nameOf.has(swapWithUserId)) {
      throw new AnchorRequestError("Pick a classmate to swap with.", 400);
    }
    if (slotOf(anchors, directory, swapWithUserId) !== -1) {
      throw new AnchorRequestError("That classmate is already anchoring this show.", 400);
    }
  }

  const existing = await prisma.anchorSlotRequest.findFirst({
    where: { userId: input.userId, showDate: input.showDate, status: "PENDING" },
    select: { id: true }
  });
  if (existing) {
    throw new AnchorRequestError("You already have a pending request for this show.", 409);
  }

  const request = await prisma.anchorSlotRequest.create({
    data: {
      showDate: input.showDate,
      userId: input.userId,
      kind: input.kind,
      swapWithUserId,
      reason: input.reason,
      lateNotice: isLateAnchorNotice(input.showDate, now),
      requestedAt: now
    }
  });

  await notifyManagersOfRequest(
    request,
    directory.nameOf.get(input.userId) ?? "An anchor",
    swapWithUserId ? directory.nameOf.get(swapWithUserId) ?? null : null
  ).catch(logNotifyFailure);
  return request;
}

/**
 * Producers see every pending request for shows from today on, plus the last few decided ones;
 * everyone else sees only their own. `mine` says whether the viewer anchors `showDate`.
 */
export async function listAnchorSlotRequests(input: { viewerId: string; canDecide: boolean; showDate?: string; now?: Date }) {
  const today = pacificDateKey(input.now ?? new Date());
  const [requests, directory, anchors] = await Promise.all([
    prisma.anchorSlotRequest.findMany({
      where: input.canDecide
        ? { OR: [{ status: "PENDING", showDate: { gte: today } }, { userId: input.viewerId, showDate: { gte: today } }] }
        : { userId: input.viewerId, showDate: { gte: today } },
      orderBy: [{ showDate: "asc" }, { requestedAt: "asc" }],
      take: 100
    }),
    loadDirectory(),
    input.showDate ? loadShowAnchors(input.showDate) : Promise.resolve([] as string[])
  ]);

  const anchoring = input.showDate ? slotOf(anchors, directory, input.viewerId) !== -1 : false;
  const classmates = [...directory.nameOf.entries()]
    .filter(([id, name]) => id !== input.viewerId && !anchors.includes(name))
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return {
    canDecide: input.canDecide,
    viewerId: input.viewerId,
    mine: input.showDate
      ? {
          showDate: input.showDate,
          anchoring,
          lateNotice: isLateAnchorNotice(input.showDate, input.now ?? new Date()),
          upcoming: input.showDate >= today
        }
      : null,
    classmates: anchoring ? classmates : [],
    requests: requests.map((request) => ({
      id: request.id,
      showDate: request.showDate,
      kind: request.kind,
      status: request.status,
      reason: request.reason,
      lateNotice: request.lateNotice,
      requestedAt: request.requestedAt.toISOString(),
      decidedAt: request.decidedAt?.toISOString() ?? null,
      userId: request.userId,
      requesterName: directory.nameOf.get(request.userId) ?? "Someone",
      swapWithName: request.swapWithUserId ? directory.nameOf.get(request.swapWithUserId) ?? "Someone" : null
    }))
  };
}

export async function cancelAnchorSlotRequest(id: string, userId: string) {
  const result = await prisma.anchorSlotRequest.updateMany({
    where: { id, userId, status: "PENDING" },
    data: { status: "CANCELLED", decidedAt: new Date(), decidedById: userId }
  });
  if (result.count === 0) {
    throw new AnchorRequestError("That request isn't pending anymore.", 409);
  }
}

/**
 * Approve or deny. Approving re-reads the show's anchors inside one transaction, locking that
 * show's ShowRolesShow row, so a save from The Show or the generator can't interleave with it.
 */
export async function decideAnchorSlotRequest(input: { id: string; deciderId: string; approve: boolean; now?: Date }) {
  const now = input.now ?? new Date();
  const directory = await loadDirectory();

  const decided = await prisma.$transaction(async (tx) => {
    const request = await tx.anchorSlotRequest.findUnique({ where: { id: input.id } });
    if (!request) throw new AnchorRequestError("Request not found.", 404);
    if (request.status !== "PENDING") throw new AnchorRequestError("That request was already decided.", 409);
    if (request.userId === input.deciderId) {
      throw new AnchorRequestError("Someone else has to decide your own request.", 403);
    }

    if (input.approve) {
      await tx.$queryRaw`SELECT "id" FROM "ShowRolesShow" WHERE "date" = ${request.showDate} FOR UPDATE`;
      const [entry, show] = await Promise.all([
        tx.masterCalendarEntry.findUnique({ where: { date: request.showDate }, select: { content: true } }),
        tx.showRolesShow.findUnique({ where: { date: request.showDate }, select: { anchors: true } })
      ]);
      const current = anchorsFrom(entry?.content, show?.anchors);
      const slot = slotOf(current, directory, request.userId);
      if (slot === -1) {
        throw new AnchorRequestError("They're no longer anchoring that show. Deny the request instead.", 409);
      }
      const swapName = request.swapWithUserId ? directory.nameOf.get(request.swapWithUserId) ?? null : null;
      if (request.kind === "SWAP" && (!swapName || current.includes(swapName))) {
        throw new AnchorRequestError("That classmate can't take the slot anymore. Deny the request instead.", 409);
      }
      const next = anchorsAfterRequest(current, slot, request.kind, swapName);
      await tx.showRolesShow.upsert({
        where: { date: request.showDate },
        create: { date: request.showDate, assignments: {}, anchors: next, confirmed: {} },
        update: { anchors: next }
      });
      // The Master Calendar entry is what The Show and the calendar read first; keep it in step.
      if (entry) {
        await tx.masterCalendarEntry.update({
          where: { date: request.showDate },
          data: { content: setCalendarAnchors(entry.content, next) }
        });
      }
    }

    return tx.anchorSlotRequest.update({
      where: { id: request.id },
      data: { status: input.approve ? "APPROVED" : "DENIED", decidedAt: now, decidedById: input.deciderId }
    });
  });

  if (input.approve) {
    await markMasterCalendarEdited(decided.showDate);
  }
  const swapName = decided.swapWithUserId ? directory.nameOf.get(decided.swapWithUserId) ?? null : null;
  await notifyDecision(decided, swapName).catch(logNotifyFailure);
  return decided;
}
