import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORKERS_AI_MODEL, workersAiConfig, workersAiJsonChat } from "@/src/server/workers-ai";

const config = { accountId: "account123", token: "test-token" };
const request = { system: "Rules", user: "Headlines", maxTokens: 4096 };

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("workersAiConfig", () => {
  it("is off until both the account and the token are set", () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    vi.stubEnv("R2_ACCOUNT_ID", "");
    vi.stubEnv("CLOUDFLARE_WORKERS_AI_TOKEN", "test-token");
    expect(workersAiConfig()).toBeNull();
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account123");
    vi.stubEnv("CLOUDFLARE_WORKERS_AI_TOKEN", " ");
    expect(workersAiConfig()).toBeNull();
    vi.stubEnv("CLOUDFLARE_WORKERS_AI_TOKEN", " test-token ");
    expect(workersAiConfig()).toEqual(config);
  });

  it("falls back to the R2 account ID, which is the same Cloudflare account", () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    vi.stubEnv("R2_ACCOUNT_ID", "account123");
    vi.stubEnv("CLOUDFLARE_WORKERS_AI_TOKEN", "test-token");
    expect(workersAiConfig()).toEqual(config);
  });
});

describe("workersAiJsonChat", () => {
  it("sends one capped, low-effort JSON request and returns the text with its token counts", async () => {
    fetchMock.mockResolvedValue(reply({
      choices: [{ finish_reason: "stop", message: { content: "{\"ideas\":[]}" } }],
      usage: { prompt_tokens: 9000, completion_tokens: 1500 }
    }));

    await expect(workersAiJsonChat(config, request)).resolves.toEqual({
      content: "{\"ideas\":[]}",
      inputTokens: 9000,
      outputTokens: 1500
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/account123/ai/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body)).toMatchObject({
      model: WORKERS_AI_MODEL,
      max_tokens: 4096,
      stream: false,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: "Rules" }, { role: "user", content: "Headlines" }]
    });
  });

  it("fails without leaking the response when Cloudflare refuses the call", async () => {
    fetchMock.mockResolvedValue(reply({ errors: [{ message: "secret detail" }] }, 429));
    await expect(workersAiJsonChat(config, request)).rejects.toThrow("Workers AI returned HTTP 429");
  });

  it("fails when the reply was cut off or empty", async () => {
    fetchMock.mockResolvedValue(reply({ choices: [{ finish_reason: "length", message: { content: "{\"ideas\":[" } }] }));
    await expect(workersAiJsonChat(config, request)).rejects.toThrow(/cut off/);
    fetchMock.mockResolvedValue(reply({ choices: [{ finish_reason: "stop", message: { content: "" } }] }));
    await expect(workersAiJsonChat(config, request)).rejects.toThrow(/empty/);
  });
});
