import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import { assistantLookupNames, assistantWhoLine, type AssistantAudience } from "@/src/lib/assistant-access";
import type { AssistantPlacePreview } from "@/src/lib/assistant-places";
import {
  ASSISTANT_LOOKUP_TOOLS,
  ASSISTANT_MUTATION_TOOLS,
  proposeAssistantAction,
  type AssistantActionPreview
} from "@/src/server/assistant-actions";
import { ASSISTANT_DOC_TOOLS, runAssistantDocTool } from "@/src/server/assistant-docs";
import { ASSISTANT_SHOW_PLACE_TOOL, showAssistantPlace } from "@/src/server/assistant-places";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
export const ASSISTANT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_GROQ_MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"] as const;
const MAX_TOOL_ROUNDS = 6;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2_000;

type AssistantTool =
  | (typeof ASSISTANT_DOC_TOOLS)[number]
  | (typeof ASSISTANT_LOOKUP_TOOLS)[number]
  | (typeof ASSISTANT_MUTATION_TOOLS)[number]
  | typeof ASSISTANT_SHOW_PLACE_TOOL;

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type GroqChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content?: string | null; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type GroqToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type GroqChoiceMessage = {
  role?: string;
  content?: string | null;
  tool_calls?: GroqToolCall[];
};

const WRITING_RULES = `How to write:
- Short. Everyday words. A few short bullets if it helps.
- Use the names on screen: Groups, Package Cycle, Admin, Publishing Queue, The Cycle.
- Bold those names with **Groups** (one pair of asterisks, never nested, never ****). You may use simple - bullets.
- If they ask how to do something, give the taps: open Groups, click the package, use the stage tabs at the bottom.
- If they ask where a page, tab, or package is, call show_place. A Take me there card will appear. Say you can take them there. Do not put the path in the chat text.

Never put in the reply:
- URLs, routes like /groups, file names, or tool names (read_doc, list_packages)
- Status codes like DRAFT, ASSOCIATE_REVIEW, or arrows of internal stages
- Words like API, database, package row, or “call this tool”
- Say “stage 1 (assigned producer)”, “stage 2 (adviser)”, “stage 3 (two executive producers)” instead

If the docs do not say, say you do not know. Do not invent class rules or who can approve what. Never ask for API keys or passwords.`;

const MEMBER_PROMPT = `You help InFocus students use Portal. Talk like a classmate, not a programmer.

Look up Portal docs with your tools before answering how something works. For this student's own packages and cycle dates, use the lookup tools, then explain in plain language.

When they ask what packages they are on or assigned to, call list_groups. Those are packages they are a member of. When they ask about comments, notes, feedback, or what was uploaded on a package, call get_group.

You cannot look up other people's grades, the publishing queue, producer lists, Admin, Members notes, or packages they are not on. If they ask for that, say they do not have access and point them to their cycle tabs or Grades.

${WRITING_RULES}`;

const ASSOCIATE_PROMPT = `You help InFocus associate producers use Portal. Talk like a classmate, not a programmer.

Look up Portal docs with your tools before answering how something works. For live class data — assigned Groups, package status, people, or the publishing queue — use the lookup tools, then explain in plain language.

When they ask what packages they are assigned to, which groups they manage, or to check in on their groups, call list_my_groups. Those are packages they produce — not ones they are only a student member of. Summarize each: topic, members, current stage, and status. When they ask about comments, notes, feedback, uploads, or what a package has on a stage, call get_group — it includes stage notes, clip notes, approval notes, uploaded clips and cuts, and proof of contact. If they want to open one, call show_place.

You cannot look up anyone's grades. If they ask, say only executives, the adviser, and super admin can see grades.

${WRITING_RULES}`;

const EXECUTIVE_PROMPT = `You help InFocus producers use Portal. Talk like a classmate, not a programmer.

Look up Portal docs with your tools before answering how something works. For live class data — Groups, package status, current stage, people, or grades — use the lookup tools, then explain in plain language.

When they ask what packages they are assigned to, which groups they manage, or to check in on their groups, call list_my_groups. Those are packages they produce, even though they can see every group in Groups. Summarize each: topic, members, current stage, and status. When they ask about comments, notes, feedback, uploads, or what a package has on a stage, call get_group — it includes stage notes, clip notes, approval notes, uploaded clips and cuts, and proof of contact. If they want to open one, call show_place.

${WRITING_RULES}`;

const SUPER_ADMIN_PROMPT = `This user is a super admin (or the adviser) and may ask you to change Portal.

Use your lookup tools, then a propose_* tool. Never claim you already saved the change. A card will appear for them to approve.

You can propose: add or remove a person, set a nickname, add/update/remove a package, assign or remove a producer role, send a package to the publishing queue (or take it off), change cycle dates, set how many cycles per semester, approve or deny access requests, set a package-cycle quality score (out of 50) or portfolio score (out of 100), clear a cycle grade to ungraded (a dash, never 0), and publish or unpublish a grade. Check-ins and participation docks are not set from chat. Null/ungraded is excluded from the average. 0 means they earned nothing.

Do not mention tools, ids, or tokens in the chat text. Never write extra asterisks. Just say they should approve the card.`;

export function systemPromptFor(
  audience: AssistantAudience,
  canMutate: boolean,
  actorName?: string | null
) {
  const who = assistantWhoLine(audience, actorName);
  if (audience === "member") {
    return `${who}\n\n${MEMBER_PROMPT}`;
  }
  if (audience === "associate") {
    return `${who}\n\n${ASSOCIATE_PROMPT}`;
  }
  if (canMutate) {
    return `${who}\n\n${EXECUTIVE_PROMPT}\n\n${SUPER_ADMIN_PROMPT}`;
  }
  return `${who}\n\n${EXECUTIVE_PROMPT}`;
}

export function assistantToolsFor(audience: AssistantAudience, canMutate: boolean) {
  const allowed = new Set(assistantLookupNames(audience));
  const lookups = ASSISTANT_LOOKUP_TOOLS.filter((tool) => allowed.has(tool.function.name));
  if (canMutate) {
    return [...ASSISTANT_DOC_TOOLS, ASSISTANT_SHOW_PLACE_TOOL, ...lookups, ...ASSISTANT_MUTATION_TOOLS];
  }
  return [...ASSISTANT_DOC_TOOLS, ASSISTANT_SHOW_PLACE_TOOL, ...lookups];
}

export function sanitizeAssistantMessages(input: unknown): AssistantChatMessage[] {
  if (!Array.isArray(input)) {
    throw new Error("BAD_REQUEST");
  }

  const messages: AssistantChatMessage[] = [];
  for (const entry of input.slice(-MAX_MESSAGES)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const role = (entry as { role?: unknown }).role;
    const content = (entry as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      continue;
    }
    const trimmed = content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!trimmed) {
      continue;
    }
    messages.push({ role, content: trimmed });
  }

  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
    throw new Error("BAD_REQUEST");
  }

  return messages;
}

function parseToolArguments(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

function groqModels(preferred?: string) {
  const unique = [...new Set([preferred?.trim(), ...DEFAULT_GROQ_MODELS].filter(Boolean) as string[])];
  return unique;
}

function httpStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) {
    return error.status;
  }
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { output: value as unknown };
}

export function toGeminiFunctionDeclarations(tools: AssistantTool[]) {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    parametersJsonSchema: tool.function.parameters
  }));
}

type ToolContext = {
  canMutate?: boolean;
  actorUserId?: string;
  audience: AssistantAudience;
  allowedLookups: Set<string>;
  sources: Set<string>;
  proposals: AssistantActionPreview[];
  places: AssistantPlacePreview[];
  onTool?: (name: string) => void;
};

function fallbackReply(ctx: ToolContext) {
  if (ctx.places.length > 0) {
    return "I can show where that is.";
  }
  if (ctx.proposals.length > 0) {
    return "Review the card and approve to make the change.";
  }
  return "";
}

async function executeAssistantToolCall(name: string, args: unknown, ctx: ToolContext) {
  ctx.onTool?.(name);
  if (name === "read_doc" && args && typeof args === "object" && "id" in args && typeof args.id === "string") {
    ctx.sources.add(args.id);
  }

  if (name === "show_place") {
    const outcome = await showAssistantPlace({
      audience: ctx.audience,
      actorUserId: ctx.actorUserId,
      args
    });
    if (outcome.preview && !ctx.places.some((place) => place.id === outcome.preview?.id)) {
      ctx.places.push(outcome.preview);
    }
    return outcome.error ? { error: outcome.error } : outcome.result;
  }

  const isLookupTool = ASSISTANT_LOOKUP_TOOLS.some((tool) => tool.function.name === name);
  const isMutationTool = ASSISTANT_MUTATION_TOOLS.some((tool) => tool.function.name === name);
  if (isLookupTool || isMutationTool) {
    if (isMutationTool && (!ctx.canMutate || !ctx.actorUserId)) {
      return { error: "You cannot make Portal changes from this assistant." };
    }
    if (isLookupTool && !ctx.allowedLookups.has(name)) {
      return { error: "You cannot look that up from this assistant." };
    }
    if (!ctx.actorUserId) {
      return { error: "You cannot look that up from this assistant." };
    }
    const outcome = await proposeAssistantAction(ctx.actorUserId, name, args);
    if (outcome.preview) {
      ctx.proposals.push(outcome.preview);
    }
    return outcome.error ? { error: outcome.error } : outcome.result;
  }

  const result = runAssistantDocTool(name, args, ctx.audience);
  if (name === "search_docs" && result && typeof result === "object" && "hits" in result) {
    const hits = (result as { hits: Array<{ id: string }> }).hits;
    for (const hit of hits.slice(0, 3)) {
      ctx.sources.add(hit.id);
    }
  }
  return result;
}

async function groqChat(params: {
  apiKey: string;
  model: string;
  messages: GroqChatMessage[];
  tools: unknown[];
}) {
  const response = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.2,
      max_tokens: 900,
      tools: params.tools,
      tool_choice: "auto",
      messages: params.messages
    })
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: string };
    choices?: Array<{ message?: GroqChoiceMessage }>;
  } | null;

  if (!response.ok) {
    const message = payload?.error?.message ?? `Groq request failed (${response.status})`;
    const error = new Error(message) as Error & { status: number };
    error.status = response.status;
    throw error;
  }

  const message = payload?.choices?.[0]?.message;
  if (!message) {
    throw new Error("Groq returned an empty response.");
  }

  return message;
}

async function runGeminiAssistant(params: {
  apiKey: string;
  messages: AssistantChatMessage[];
  tools: AssistantTool[];
  system: string;
  ctx: ToolContext;
}) {
  const client = new GoogleGenAI({ apiKey: params.apiKey });
  const contents: Content[] = params.messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await client.models.generateContent({
      model: ASSISTANT_GEMINI_MODEL,
      contents,
      config: {
        temperature: 0.2,
        maxOutputTokens: 900,
        systemInstruction: params.system,
        thinkingConfig: { thinkingBudget: 0 },
        tools: [{ functionDeclarations: toGeminiFunctionDeclarations(params.tools) }]
      }
    });

    const toolCalls = (response.functionCalls ?? []).filter((call) => call.name);
    if (toolCalls.length === 0) {
      const reply = (response.text ?? "").trim() || fallbackReply(params.ctx);
      if (!reply) {
        throw new Error("Assistant returned an empty reply.");
      }
      return {
        reply,
        sources: [...params.ctx.sources],
        model: ASSISTANT_GEMINI_MODEL,
        proposals: params.ctx.proposals,
        places: params.ctx.places
      };
    }

    const modelContent = response.candidates?.[0]?.content;
    contents.push(
      modelContent
        ? { role: modelContent.role ?? "model", parts: modelContent.parts ?? [] }
        : {
            role: "model",
            parts: toolCalls.map((call) => ({
              functionCall: { id: call.id, name: call.name, args: call.args }
            }))
          }
    );

    const responseParts = [];
    for (const call of toolCalls) {
      const name = call.name as string;
      const result = await executeAssistantToolCall(name, call.args ?? {}, params.ctx);
      responseParts.push({
        functionResponse: {
          id: call.id,
          name,
          response: asRecord(result)
        }
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  throw new Error("Assistant used too many doc lookups. Ask a more specific question.");
}

async function runGroqAssistant(params: {
  apiKey: string;
  model?: string;
  messages: AssistantChatMessage[];
  tools: AssistantTool[];
  system: string;
  ctx: ToolContext;
}) {
  const conversation: GroqChatMessage[] = [
    { role: "system", content: params.system },
    ...params.messages.map((message) => ({ role: message.role, content: message.content }))
  ];

  let lastError: Error | null = null;

  for (const model of groqModels(params.model)) {
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const message = await groqChat({
          apiKey: params.apiKey,
          model,
          messages: conversation,
          tools: params.tools
        });

        const toolCalls = message.tool_calls ?? [];
        if (toolCalls.length === 0) {
          const reply = (message.content ?? "").trim() || fallbackReply(params.ctx);
          if (!reply) {
            throw new Error("Assistant returned an empty reply.");
          }
          return {
            reply,
            sources: [...params.ctx.sources],
            model,
            proposals: params.ctx.proposals,
            places: params.ctx.places
          };
        }

        conversation.push({
          role: "assistant",
          content: message.content ?? "",
          tool_calls: toolCalls
        });

        for (const call of toolCalls) {
          const result = await executeAssistantToolCall(
            call.function.name,
            parseToolArguments(call.function.arguments),
            params.ctx
          );
          conversation.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result)
          });
        }
      }

      throw new Error("Assistant used too many doc lookups. Ask a more specific question.");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Assistant failed.");
      const status = httpStatus(error);
      if (status === 429) {
        throw new Error("TOO_MANY_REQUESTS");
      }
      if (status === 404 || status === 400) {
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("No Groq model is available.");
}

export async function runAssistantChat(params: {
  geminiApiKey?: string;
  groqApiKey?: string;
  groqModel?: string;
  messages: AssistantChatMessage[];
  canMutate?: boolean;
  actorUserId?: string;
  actorName?: string | null;
  audience?: AssistantAudience;
  onTool?: (name: string) => void;
}) {
  const audience = params.audience ?? "member";
  const tools: AssistantTool[] = assistantToolsFor(audience, Boolean(params.canMutate));
  const system = systemPromptFor(audience, Boolean(params.canMutate), params.actorName);
  const ctx: ToolContext = {
    canMutate: params.canMutate,
    actorUserId: params.actorUserId,
    audience,
    allowedLookups: new Set(assistantLookupNames(audience)),
    sources: new Set<string>(),
    proposals: [],
    places: [],
    onTool: params.onTool
  };

  let geminiError: Error | null = null;

  if (params.geminiApiKey) {
    try {
      return await runGeminiAssistant({
        apiKey: params.geminiApiKey,
        messages: params.messages,
        tools,
        system,
        ctx
      });
    } catch (error) {
      geminiError = error instanceof Error ? error : new Error("Gemini request failed.");
      const status = httpStatus(error);
      if (status) {
        (geminiError as Error & { status: number }).status = status;
      }
      ctx.sources.clear();
      ctx.proposals.length = 0;
      ctx.places.length = 0;
    }
  }

  if (params.groqApiKey) {
    return runGroqAssistant({
      apiKey: params.groqApiKey,
      model: params.groqModel,
      messages: params.messages,
      tools,
      system,
      ctx
    });
  }

  if (geminiError) {
    if (httpStatus(geminiError) === 429) {
      throw new Error("TOO_MANY_REQUESTS");
    }
    throw geminiError;
  }

  throw new Error("Assistant is not configured yet. Add GEMINI_API_KEY_CHAT or GROQ_API_KEY.");
}
