import type { Prisma, ShowEditorSettings } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { SHOW_EDIT_BACKENDS, SHOW_EDIT_DEFAULT_AGENT_ORDER, type ShowEditBackend, type ShowEditorSettingsView } from "@/src/lib/show-editor";

const SETTINGS_ID = "editor";

export type ShowEditorSettingsInput = {
  autoStart?: boolean | null;
  autoPublish?: boolean | null;
  targetVersion?: string | null;
  agentOrder?: ShowEditBackend[];
  houseRules?: string | null;
};

function agentOrderOf(value: Prisma.JsonValue | null | undefined): ShowEditBackend[] {
  if (!Array.isArray(value)) return [...SHOW_EDIT_DEFAULT_AGENT_ORDER];
  const order = value.filter((name): name is ShowEditBackend => SHOW_EDIT_BACKENDS.includes(name as ShowEditBackend));
  return order.length > 0 ? [...new Set(order)] : [...SHOW_EDIT_DEFAULT_AGENT_ORDER];
}

/** A saved setting wins; null (or no row) falls back to the old SHOW_EDITOR_* env vars. */
export function effectiveEditorSettings(row: ShowEditorSettings | null): ShowEditorSettingsView {
  return {
    autoStart: row?.autoStart ?? process.env.SHOW_EDITOR_AUTO_START === "1",
    autoPublish: row?.autoPublish ?? process.env.SHOW_EDITOR_AUTO_PUBLISH === "1",
    targetVersion: row?.targetVersion ?? (process.env.SHOW_EDITOR_TARGET_VERSION?.trim() || null),
    agentOrder: agentOrderOf(row?.agentOrder),
    houseRules: row?.houseRules ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null
  };
}

export async function loadEditorSettings(): Promise<ShowEditorSettingsView> {
  return effectiveEditorSettings(await prisma.showEditorSettings.findUnique({ where: { id: SETTINGS_ID } }));
}

/** Only the fields given change; the route has already validated them. */
export async function saveEditorSettings(input: ShowEditorSettingsInput, userId: string | null) {
  const data: Prisma.ShowEditorSettingsUncheckedUpdateInput = { updatedById: userId };
  if (input.autoStart !== undefined) data.autoStart = input.autoStart;
  if (input.autoPublish !== undefined) data.autoPublish = input.autoPublish;
  if (input.targetVersion !== undefined) data.targetVersion = input.targetVersion;
  if (input.agentOrder !== undefined) data.agentOrder = input.agentOrder;
  if (input.houseRules !== undefined) data.houseRules = input.houseRules;
  const row = await prisma.showEditorSettings.upsert({
    where: { id: SETTINGS_ID },
    update: data,
    create: { id: SETTINGS_ID, ...(data as Prisma.ShowEditorSettingsUncheckedCreateInput) }
  });
  return effectiveEditorSettings(row);
}
