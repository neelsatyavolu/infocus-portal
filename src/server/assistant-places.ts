import type { AssistantAudience } from "@/src/lib/assistant-access";
import {
  assistantCycleSwitch,
  assistantPlacePreview,
  findGatedAssistantPlace,
  isMyPackageQuery,
  matchAssistantPlace,
  type AssistantPlacePreview
} from "@/src/lib/assistant-places";
import { pendingGroupNavSlug, workspaceSlugFromNav, type GroupNavSlug } from "@/src/lib/package-stages";
import { findAssistantGroupRow, listAssistantGroups } from "@/src/server/assistant-lookups";
import { resolveStudentCycleChoice } from "@/src/server/package-cycle-stage";

type GroupRow = Awaited<ReturnType<typeof findAssistantGroupRow>>;

function studentCycleHref(slug: GroupNavSlug) {
  switch (slug) {
    case "pitching":
      return "/information";
    case "brainstorming":
      return "/brainstorming";
    case "a-roll":
      return "/a-roll";
    case "initial-stage-1":
    case "initial-stage-2":
    case "initial-stage-3":
      return "/initial-cut";
    case "final-cut":
      return "/final-cut";
  }
}

function navSlugForRow(row: GroupRow) {
  return pendingGroupNavSlug({
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    aRollBRoll: row.aRollBRoll,
    finalCut: row.finalCut,
    approvalStage: row.approval?.stage
  });
}

function previewForGroup(row: GroupRow, audience: AssistantAudience): AssistantPlacePreview {
  const topic = row.groupTopic.trim() || "Untitled package";
  const slug = navSlugForRow(row);
  if (audience === "member") {
    return assistantPlacePreview({
      id: `group:${row.id}`,
      title: topic,
      href: studentCycleHref(slug),
      hint: `The Cycle → ${topic}`
    });
  }
  return assistantPlacePreview({
    id: `group:${row.id}`,
    title: topic,
    href: `/groups/${row.id}/${workspaceSlugFromNav(slug)}`,
    hint: `Groups → ${topic}`
  });
}

async function resolvePackagePlace(params: {
  query: string;
  audience: AssistantAudience;
  actorUserId: string;
}): Promise<{ preview?: AssistantPlacePreview; error?: string; result?: unknown }> {
  if (isMyPackageQuery(params.query)) {
    const groups = await listAssistantGroups({ actorUserId: params.actorUserId });
    if (groups.length === 0) {
      return { error: "You are not on a package." };
    }
    if (groups.length > 1) {
      return {
        error: "You are on more than one package. Name the topic.",
        result: { topics: groups.map((group) => group.topic) }
      };
    }
    const row = await findAssistantGroupRow({
      topic: groups[0]?.topic ?? "",
      actorUserId: params.actorUserId
    });
    const preview = previewForGroup(row, params.audience);
    return { preview, result: { found: true, name: preview.title } };
  }

  try {
    const row = await findAssistantGroupRow({
      topic: params.query,
      actorUserId: params.actorUserId
    });
    const preview = previewForGroup(row, params.audience);
    return { preview, result: { found: true, name: preview.title } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No Portal page matched that.";
    return { error: message };
  }
}

export async function showAssistantPlace(params: {
  audience: AssistantAudience;
  actorUserId?: string;
  args: unknown;
}): Promise<{ preview?: AssistantPlacePreview; error?: string; result?: unknown }> {
  const args = params.args && typeof params.args === "object" ? (params.args as Record<string, unknown>) : {};
  const query = String(args.place ?? args.name ?? args.query ?? "").trim();
  if (!query) {
    return { error: "Name the page or package." };
  }

  const allowed = matchAssistantPlace(query, params.audience);
  if (allowed) {
    return { preview: allowed, result: { found: true, name: allowed.title } };
  }

  if (params.actorUserId && isMyPackageQuery(query)) {
    return resolvePackagePlace({
      query,
      audience: params.audience,
      actorUserId: params.actorUserId
    });
  }

  const gated = findGatedAssistantPlace(query, params.audience);
  if (gated) {
    return { error: `${gated.title} is not in your sidebar.` };
  }

  if (!params.actorUserId) {
    return { error: "No Portal page matched that." };
  }

  return resolvePackagePlace({
    query,
    audience: params.audience,
    actorUserId: params.actorUserId
  });
}

export const ASSISTANT_SHOW_PLACE_TOOL = {
  type: "function" as const,
  function: {
    name: "show_place",
    description:
      "When the user asks where a Portal page, tab, or package is, call this so a Take me there card can appear. Pass the name they used (Groups, Publishing Queue, Grade Editor, a package topic). Do not put routes in the chat text.",
    parameters: {
      type: "object",
      properties: {
        place: { type: "string", description: "Page, tab, or package name" }
      },
      required: ["place"],
      additionalProperties: false
    }
  }
};

/** "Switch me to Cycle 3": a card that flips the sidebar's cycle switch, only when the student has it. */
export async function switchAssistantCycle(params: {
  actorUserId?: string;
  args: unknown;
}): Promise<{ preview?: AssistantPlacePreview; error?: string; result?: unknown }> {
  const args = params.args && typeof params.args === "object" ? (params.args as Record<string, unknown>) : {};
  const requested = Number(args.cycleNumber);
  if (!Number.isInteger(requested) || requested < 1) {
    return { error: "Name the cycle number to switch to." };
  }
  if (!params.actorUserId) {
    return { error: "You cannot switch cycles from this assistant." };
  }
  return assistantCycleSwitch(await resolveStudentCycleChoice(params.actorUserId), requested);
}

export const ASSISTANT_SWITCH_CYCLE_TOOL = {
  type: "function" as const,
  function: {
    name: "switch_cycle",
    description:
      "When a student asks to switch, view, or work on another cycle (for example go back to Cycle 2 to turn in its Final Cut, or open Cycle 3), call this so a Switch card can appear. It only works for a student still owing the previous cycle's Final Cut who is also on the new cycle; otherwise it says why.",
    parameters: {
      type: "object",
      properties: {
        cycleNumber: { type: "integer", description: "Cycle to switch to, e.g. 3" }
      },
      required: ["cycleNumber"],
      additionalProperties: false
    }
  }
};
