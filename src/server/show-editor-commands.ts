import { prisma } from "@/src/lib/prisma";
import { ShowEditError } from "@/src/server/show-editor-errors";
import {
  SHOW_EDITOR_COMMAND_HISTORY, SHOW_EDITOR_COMMAND_OUTPUT_MAX, type ShowEditorCommandKind, type ShowEditorCommandView
} from "@/src/lib/show-editor";

/** A producer's remote command for one machine; it gets it with its next heartbeat. The last 20 per machine are kept. */
export async function queueEditorCommand(input: { userId: string; deviceId: string; kind: ShowEditorCommandKind }) {
  const device = await prisma.showEditorDevice.findFirst({ where: { id: input.deviceId, revokedAt: null }, select: { id: true } });
  if (!device) throw new ShowEditError("That machine isn't linked any more.", 404);
  const command = await prisma.showEditorCommand.create({ data: { deviceId: device.id, kind: input.kind, requestedById: input.userId } });
  const older = await prisma.showEditorCommand.findMany({
    where: { deviceId: device.id }, orderBy: { createdAt: "desc" }, skip: SHOW_EDITOR_COMMAND_HISTORY, select: { id: true }
  });
  if (older.length > 0) await prisma.showEditorCommand.deleteMany({ where: { id: { in: older.map((row) => row.id) } } });
  return commandView(command);
}

/** Heartbeat: this machine's commands not yet handed over, oldest first. */
export async function takePendingCommands(deviceId: string, now = new Date()) {
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

/** Newest first, for the panel's results and history (the last 20 per machine). */
export async function recentEditorCommands(deviceIds: string[]): Promise<ShowEditorCommandView[]> {
  if (deviceIds.length === 0) return [];
  const rows = await prisma.showEditorCommand.findMany({
    where: { deviceId: { in: deviceIds } }, orderBy: { createdAt: "desc" }, take: SHOW_EDITOR_COMMAND_HISTORY * deviceIds.length
  });
  return rows.map(commandView);
}
