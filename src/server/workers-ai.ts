/**
 * Cloudflare Workers AI, called over its OpenAI-compatible REST endpoint. The InFocus Drive scribe
 * uses the same account for meeting notes, so callers here must cap their own usage
 * (see IDEA_MAX_OUTPUT_TOKENS in src/lib/ideas.ts).
 */

export const WORKERS_AI_MODEL = "@cf/openai/gpt-oss-120b";
const TIMEOUT_MS = 120_000;

export type WorkersAiConfig = { accountId: string; token: string };

/** Null until the account and a token with the Workers AI permission are both set. */
export function workersAiConfig(): WorkersAiConfig | null {
  // R2 lives in the same Cloudflare account, so its ID works when CLOUDFLARE_ACCOUNT_ID is unset.
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || process.env.R2_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_WORKERS_AI_TOKEN?.trim();
  return accountId && token ? { accountId, token } : null;
}

type ChatResponse = {
  choices?: { finish_reason?: string; message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** One JSON-mode chat call. Throws unless the model finished a non-empty reply. */
export async function workersAiJsonChat(config: WorkersAiConfig, input: { system: string; user: string; maxTokens: number }) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/v1/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: WORKERS_AI_MODEL,
      max_tokens: input.maxTokens,
      temperature: 0.7,
      stream: false,
      // The model's reasoning is billed as output; "low" keeps it to about a third.
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }]
    })
  });
  if (!response.ok) throw new Error(`Workers AI returned HTTP ${response.status}`);
  const payload = (await response.json()) as ChatResponse;
  const choice = payload.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("Workers AI reply was cut off at the token cap.");
  const content = choice?.message?.content?.trim();
  if (!content) throw new Error("Workers AI returned an empty reply.");
  return {
    content,
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0
  };
}
