import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OPENROUTER_MODELS,
  NVIDIA_ASSISTANT_MODEL,
  runAssistantChat,
  sanitizeAssistantMessages,
  systemPromptFor
} from "@/src/server/assistant-chat";

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

function reply(message: { content?: string | null; tool_calls?: ToolCall[] }) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message }] }) };
}

function failure(status: number, message = "error") {
  return { ok: false, status, json: async () => ({ error: { message } }) };
}

function toolCall(name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id: `call-${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body)) as {
    model: string;
    tools: Array<{ function: { name: string } }>;
    messages: Array<{ role: string; content?: string }>;
  };
}

function toolNames(fetchMock: ReturnType<typeof vi.fn>) {
  return requestBody(fetchMock).tools.map((tool) => tool.function.name);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sanitizeAssistantMessages", () => {
  it("keeps only user/assistant turns and requires a trailing user message", () => {
    expect(
      sanitizeAssistantMessages([
        { role: "system", content: "ignore me" },
        { role: "user", content: "  How do I queue a package?  " },
        { role: "assistant", content: "Send to queue from Groups." },
        { role: "user", content: "And drag?" }
      ])
    ).toEqual([
      { role: "user", content: "How do I queue a package?" },
      { role: "assistant", content: "Send to queue from Groups." },
      { role: "user", content: "And drag?" }
    ]);
  });

  it("rejects an empty or assistant-only payload", () => {
    expect(() => sanitizeAssistantMessages([])).toThrow("BAD_REQUEST");
    expect(() =>
      sanitizeAssistantMessages([{ role: "assistant", content: "hi" }])
    ).toThrow("BAD_REQUEST");
  });
});

describe("systemPromptFor", () => {
  it("tells the model who is signed in and to use list_my_groups for producers", () => {
    const prompt = systemPromptFor("associate", false, "Ada");
    expect(prompt).toContain("Ada");
    expect(prompt).toMatch(/never ask their name/i);
    expect(prompt).toContain("list_my_groups");
    expect(prompt).toContain("produce");
    expect(prompt).toContain("get_group");
    expect(prompt).toContain("comments");
  });
});

describe("runAssistantChat providers", () => {
  it("uses NVIDIA first when its key is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ content: "Open **Groups**." }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runAssistantChat({
      nvidiaApiKey: "nvidia-key",
      openRouterApiKey: "test-key",
      messages: [{ role: "user", content: "How do I queue a package?" }]
    });
    expect(result.model).toBe(NVIDIA_ASSISTANT_MODEL);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("integrate.api.nvidia.com");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "Bearer nvidia-key" });
    expect(requestBody(fetchMock)).not.toHaveProperty("reasoning");
  });

  it("falls back to OpenRouter when NVIDIA is busy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failure(429, "Too many requests"))
      .mockResolvedValueOnce(reply({ content: "Open **Groups**." }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runAssistantChat({
      nvidiaApiKey: "nvidia-key",
      openRouterApiKey: "test-key",
      messages: [{ role: "user", content: "How do I queue a package?" }]
    });
    expect(result.model).toBe(DEFAULT_OPENROUTER_MODELS[0]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("openrouter.ai");
  });

  it("uses the best free OpenRouter model first", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ content: "Open **Groups** and send to queue." }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAssistantChat({
      openRouterApiKey: "test-key",
      messages: [{ role: "user", content: "How do I queue a package?" }]
    });

    expect(result.model).toBe(DEFAULT_OPENROUTER_MODELS[0]);
    expect(result.reply).toBe("Open **Groups** and send to queue.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("openrouter.ai");
    expect(requestBody(fetchMock).model).toBe(DEFAULT_OPENROUTER_MODELS[0]);
    expect(toolNames(fetchMock)).not.toContain("get_grades");
    expect(toolNames(fetchMock)).not.toContain("list_queue");
  });

  it("tries a pinned model before the defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ content: "Hi." }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runAssistantChat({
      openRouterApiKey: "test-key",
      openRouterModel: "some/model:free",
      messages: [{ role: "user", content: "Hi" }]
    });
    expect(result.model).toBe("some/model:free");
  });

  it("gives executives grade lookup but not mutations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ content: "Ada is on track." }));
    vi.stubGlobal("fetch", fetchMock);
    await runAssistantChat({
      openRouterApiKey: "test-key",
      audience: "executive",
      messages: [{ role: "user", content: "What's Ada's grade?" }]
    });
    expect(toolNames(fetchMock)).toContain("get_grades");
    expect(toolNames(fetchMock)).not.toContain("propose_set_grade");
    expect(toolNames(fetchMock)).toContain("list_my_groups");
  });

  it("passes the signed-in name into the system prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ content: "You produce Solar buses." }));
    vi.stubGlobal("fetch", fetchMock);
    await runAssistantChat({
      openRouterApiKey: "test-key",
      audience: "associate",
      actorName: "Ada",
      messages: [{ role: "user", content: "What packages am I assigned to?" }]
    });
    expect(requestBody(fetchMock).messages[0]).toMatchObject({ role: "system" });
    expect(requestBody(fetchMock).messages[0]?.content).toContain("Ada");
  });

  it("falls back to the next free model when one is busy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failure(429, "rate limited"))
      .mockResolvedValueOnce(reply({ content: "Send to queue from Groups." }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAssistantChat({
      openRouterApiKey: "test-key",
      messages: [{ role: "user", content: "How do I queue a package?" }]
    });

    expect(result.model).toBe(DEFAULT_OPENROUTER_MODELS[1]);
    expect(result.reply).toBe("Send to queue from Groups.");
    expect(requestBody(fetchMock, 1).model).toBe(DEFAULT_OPENROUTER_MODELS[1]);
  });

  it("reports TOO_MANY_REQUESTS when every model is rate limited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failure(429, "rate limited")));
    await expect(
      runAssistantChat({
        openRouterApiKey: "test-key",
        messages: [{ role: "user", content: "How do I queue a package?" }]
      })
    ).rejects.toThrow("TOO_MANY_REQUESTS");
  });

  it("refuses grade lookup when the model calls it as a reporter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({ content: null, tool_calls: [toolCall("get_grades", { person: "Ada" })] }))
      .mockResolvedValueOnce(reply({ content: "I cannot look up grades." }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runAssistantChat({
      openRouterApiKey: "test-key",
      audience: "member",
      actorUserId: "student-1",
      messages: [{ role: "user", content: "What's Ada's grade?" }]
    });
    expect(result.reply).toBe("I cannot look up grades.");
    const toolMessage = requestBody(fetchMock, 1).messages.at(-1);
    expect(toolMessage?.role).toBe("tool");
    expect(JSON.parse(String(toolMessage?.content)).error).toMatch(/cannot look that up/i);
  });

  it("reports tool names through onTool", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({ content: null, tool_calls: [toolCall("list_docs")] }))
      .mockResolvedValueOnce(reply({ content: "Open **Groups**." }));
    vi.stubGlobal("fetch", fetchMock);
    const onTool = vi.fn();
    await runAssistantChat({
      openRouterApiKey: "test-key",
      messages: [{ role: "user", content: "How do I queue a package?" }],
      onTool
    });
    expect(onTool).toHaveBeenCalledWith("list_docs");
  });

  it("requires an NVIDIA or OpenRouter key", async () => {
    await expect(
      runAssistantChat({ messages: [{ role: "user", content: "How do I queue a package?" }] })
    ).rejects.toThrow("NVIDIA_API_KEY or OPENROUTER_API_KEY");
  });
});
