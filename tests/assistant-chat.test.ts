import { afterEach, describe, expect, it, vi } from "vitest";
import { ASSISTANT_DOC_TOOLS } from "@/src/server/assistant-docs";
import {
  ASSISTANT_GEMINI_MODEL,
  runAssistantChat,
  sanitizeAssistantMessages,
  systemPromptFor,
  toGeminiFunctionDeclarations
} from "@/src/server/assistant-chat";

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn()
}));

vi.mock("@google/genai", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(options: { message: string; status: number }) {
      super(options.message);
      this.status = options.status;
    }
  },
  GoogleGenAI: class GoogleGenAI {
    models = { generateContent };
  }
}));

afterEach(() => {
  generateContent.mockReset();
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

describe("toGeminiFunctionDeclarations", () => {
  it("maps Groq-style tools to Gemini function declarations", () => {
    const declarations = toGeminiFunctionDeclarations(ASSISTANT_DOC_TOOLS);
    expect(declarations.map((declaration) => declaration.name)).toEqual([
      "list_docs",
      "search_docs",
      "read_doc"
    ]);
    expect(declarations[1]?.parametersJsonSchema).toMatchObject({ required: ["query"] });
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
  it("uses Gemini 3.1 Flash-Lite first", async () => {
    generateContent.mockResolvedValue({
      text: "Open **Groups** and send to queue.",
      functionCalls: undefined
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAssistantChat({
      geminiApiKey: "gemini-key",
      groqApiKey: "groq-key",
      messages: [{ role: "user", content: "How do I queue a package?" }]
    });

    expect(result.model).toBe(ASSISTANT_GEMINI_MODEL);
    expect(result.reply).toBe("Open **Groups** and send to queue.");
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0]?.[0]).toMatchObject({ model: ASSISTANT_GEMINI_MODEL });
    const declarations = generateContent.mock.calls[0]?.[0]?.config?.tools?.[0]?.functionDeclarations as Array<{
      name: string;
    }>;
    expect(declarations.map((declaration) => declaration.name)).not.toContain("get_grades");
    expect(declarations.map((declaration) => declaration.name)).not.toContain("list_queue");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives executives grade lookup but not mutations", async () => {
    generateContent.mockResolvedValue({
      text: "Ada is on track.",
      functionCalls: undefined
    });
    await runAssistantChat({
      geminiApiKey: "gemini-key",
      audience: "executive",
      messages: [{ role: "user", content: "What's Ada's grade?" }]
    });
    const declarations = generateContent.mock.calls[0]?.[0]?.config?.tools?.[0]?.functionDeclarations as Array<{
      name: string;
    }>;
    expect(declarations.map((declaration) => declaration.name)).toContain("get_grades");
    expect(declarations.map((declaration) => declaration.name)).not.toContain("propose_set_grade");
    expect(declarations.map((declaration) => declaration.name)).toContain("list_my_groups");
  });

  it("passes the signed-in name into Gemini", async () => {
    generateContent.mockResolvedValue({
      text: "You produce Solar buses.",
      functionCalls: undefined
    });
    await runAssistantChat({
      geminiApiKey: "gemini-key",
      audience: "associate",
      actorName: "Ada",
      messages: [{ role: "user", content: "What packages am I assigned to?" }]
    });
    expect(generateContent.mock.calls[0]?.[0]?.config?.systemInstruction).toContain("Ada");
  });

  it("falls back to Groq gpt-oss-120b when Gemini fails", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("quota"), { status: 429 }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Send to queue from Groups." } }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAssistantChat({
      geminiApiKey: "gemini-key",
      groqApiKey: "groq-key",
      messages: [{ role: "user", content: "How do I queue a package?" }]
    });

    expect(result.model).toBe("openai/gpt-oss-120b");
    expect(result.reply).toBe("Send to queue from Groups.");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).model).toBe("openai/gpt-oss-120b");
  });

  it("refuses grade lookup when the model calls it as a reporter", async () => {
    generateContent
      .mockResolvedValueOnce({
        text: undefined,
        functionCalls: [{ id: "1", name: "get_grades", args: { person: "Ada" } }]
      })
      .mockResolvedValueOnce({
        text: "I cannot look up grades.",
        functionCalls: undefined
      });
    const result = await runAssistantChat({
      geminiApiKey: "gemini-key",
      audience: "member",
      actorUserId: "student-1",
      messages: [{ role: "user", content: "What's Ada's grade?" }]
    });
    expect(result.reply).toBe("I cannot look up grades.");
    const followUp = generateContent.mock.calls[1]?.[0]?.contents as Array<{
      parts?: Array<{ functionResponse?: { response?: { error?: string } } }>;
    }>;
    expect(followUp?.at(-1)?.parts?.[0]?.functionResponse?.response?.error).toMatch(/cannot look that up/i);
  });

  it("reports tool names through onTool", async () => {
    generateContent
      .mockResolvedValueOnce({
        text: undefined,
        functionCalls: [{ id: "1", name: "list_docs", args: {} }],
        candidates: [{ content: { role: "model", parts: [{ functionCall: { id: "1", name: "list_docs", args: {} } }] } }]
      })
      .mockResolvedValueOnce({
        text: "Open **Groups**.",
        functionCalls: undefined
      });
    const onTool = vi.fn();
    await runAssistantChat({
      geminiApiKey: "gemini-key",
      messages: [{ role: "user", content: "How do I queue a package?" }],
      onTool
    });
    expect(onTool).toHaveBeenCalledWith("list_docs");
  });

  it("requires a Gemini chat key or Groq key", async () => {
    await expect(
      runAssistantChat({ messages: [{ role: "user", content: "How do I queue a package?" }] })
    ).rejects.toThrow("GEMINI_API_KEY_CHAT");
  });
});
