import { prisma } from "@/src/lib/prisma";
import { ShowEditError } from "@/src/server/show-editor-errors";
import {
  SHELL_COMMAND_PREFIX, SHOW_EDITOR_COMMAND_HISTORY, SHOW_EDITOR_COMMAND_OUTPUT_MAX, type ShowEditorCommandKind,
  type ShowEditorCommandView
} from "@/src/lib/show-editor";

/** Leaves out the super admin's remote commands (never shown or trimmed here). */
const NOT_SHELL = { NOT: { kind: { startsWith: SHELL_COMMAND_PREFIX } } };

/** A producer's remote command for one machine; it gets it with its next heartbeat. The last 20 per machine are kept. */
export async function queueEditorCommand(input: { userId: string; deviceId: string; kind: ShowEditorCommandKind }) {
  const device = await prisma.showEditorDevice.findFirst({ where: { id: input.deviceId, revokedAt: null }, select: { id: true } });
  if (!device) throw new ShowEditError("That machine isn't linked any more.", 404);
  const command = await prisma.showEditorCommand.create({ data: { deviceId: device.id, kind: input.kind, requestedById: input.userId } });
  const older = await prisma.showEditorCommand.findMany({
    where: { deviceId: device.id, ...NOT_SHELL }, orderBy: { createdAt: "desc" }, skip: SHOW_EDITOR_COMMAND_HISTORY, select: { id: true }
  });
  if (older.length > 0) await prisma.showEditorCommand.deleteMany({ where: { id: { in: older.map((row) => row.id) } } });
  return commandView(command);
}

/** A command handed over this long ago with no answer is given up on (the Mac restarted or crashed mid-way). */
export const COMMAND_ANSWER_TIMEOUT_MS = 60 * 60_000;
export const COMMAND_NO_ANSWER = "No answer from the machine (it probably restarted). Send it again if it's still needed.";

/** Heartbeat: this machine's commands not yet handed over, oldest first. Ones it never answered are closed first. */
export async function takePendingCommands(deviceId: string, now = new Date()) {
  await prisma.showEditorCommand.updateMany({
    where: { deviceId, status: "SENT", sentAt: { lt: new Date(now.getTime() - COMMAND_ANSWER_TIMEOUT_MS) } },
    data: { status: "FAILED", ok: false, output: COMMAND_NO_ANSWER, finishedAt: now }
  });
  const pending = await prisma.showEditorCommand.findMany({
    where: { deviceId, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 10, select: { id: true, kind: true }
  });
  if (pending.length > 0) {
    await prisma.showEditorCommand.updateMany({
      where: { id: { in: pending.map((row) => row.id) }, status: "PENDING" }, data: { status: "SENT", sentAt: now }
    });
  }
  return pending.map((row) => ({ id: row.id, kind: row.kind as ShowEditorCommandKind }));
}

export async function applyCommandAcks(acks: { id: string; ok: boolean; output?: string }[], deviceId: string, now = new Date()) {
  for (const ack of acks) {
    await prisma.showEditorCommand.updateMany({
      where: { id: ack.id, deviceId },
      data: {
        status: ack.ok ? "DONE" : "FAILED", ok: ack.ok, finishedAt: now,
        output: ack.output ? ack.output.slice(0, SHOW_EDITOR_COMMAND_OUTPUT_MAX) : null
      }
    });
  }
}

function commandView(row: {
  id: string; deviceId: string; kind: string; status: string; output: string | null; createdAt: Date; finishedAt: Date | null;
}): ShowEditorCommandView {
  return {
    id: row.id,
    deviceId: row.deviceId,
    kind: row.kind as ShowEditorCommandKind,
    status: row.status as ShowEditorCommandView["status"],
    output: row.output,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null
  };
}

/** A finished command's result leaves the Machines panel this long after it finished. */
export const COMMAND_RESULT_SHOWN_MS = 6 * 3600_000;

/** Newest first, for the panel's results: waiting, running, or finished in the last 6 hours (of the last 20 per machine). */
export async function recentEditorCommands(deviceIds: string[], now = new Date()): Promise<ShowEditorCommandView[]> {
  if (deviceIds.length === 0) return [];
  const rows = await prisma.showEditorCommand.findMany({
    where: {
      deviceId: { in: deviceIds }, ...NOT_SHELL,
      OR: [{ finishedAt: null }, { finishedAt: { gte: new Date(now.getTime() - COMMAND_RESULT_SHOWN_MS) } }]
    },
    orderBy: { createdAt: "desc" },
    take: SHOW_EDITOR_COMMAND_HISTORY * deviceIds.length
  });
  return rows.map(commandView);
}
