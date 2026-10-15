import { describe, expect, it } from "vitest";
import { isSafePlaceHref, readAssistantStream, startersFor } from "@/components/assistant/assistant-stream";

function ndjson(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
}

describe("isSafePlaceHref", () => {
  it("allows Portal paths", () => {
    expect(isSafePlaceHref("/groups")).toBe(true);
    expect(isSafePlaceHref("/groups/row-1/a-roll?tab=notes")).toBe(true);
  });

  it("allows https on the InFocus app hosts only", () => {
    expect(isSafePlaceHref("https://drive.infocuspaly.com/folder")).toBe(true);
    expect(isSafePlaceHref("https://equipment.infocuspaly.com")).toBe(true);
    expect(isSafePlaceHref("http://drive.infocuspaly.com")).toBe(false);
    expect(isSafePlaceHref("https://example.com")).toBe(false);
    expect(isSafePlaceHref("https://drive.infocuspaly.com.example.com")).toBe(false);
  });

  it("refuses protocol-relative, backslash and script links", () => {
    expect(isSafePlaceHref("//example.com")).toBe(false);
    expect(isSafePlaceHref("/\\example.com")).toBe(false);
    expect(isSafePlaceHref("javascript:alert(1)")).toBe(false);
    expect(isSafePlaceHref("")).toBe(false);
  });
});

describe("readAssistantStream", () => {
  it("reports tool steps and returns the done payload, across split chunks", async () => {
    const steps: string[] = [];
    const data = await readAssistantStream(
      ndjson([
        '{"type":"tool","label":"Reading a doc"}\n{"type":"to',
        'ol","label":"Reading grades"}\n',
        '{"type":"done","data":{"reply":"Here you go","sources":["doc-1"]}}'
      ]),
      (label) => steps.push(label)
    );
    expect(steps).toEqual(["Reading a doc", "Reading grades"]);
    expect(data).toEqual({ reply: "Here you go", sources: ["doc-1"] });
  });

  it("throws the stream's error message", async () => {
    await expect(
      readAssistantStream(ndjson(['{"type":"error","message":"You\'ve asked enough for now."}\n']), () => {})
    ).rejects.toThrow("You've asked enough for now.");
  });

  it("falls back to a plain JSON body", async () => {
    const response = new Response(JSON.stringify({ data: { reply: "Hi" } }), {
      headers: { "content-type": "application/json" }
    });
    await expect(readAssistantStream(response, () => {})).resolves.toEqual({ reply: "Hi" });
  });

  it("throws a plain JSON error", async () => {
    const response = new Response(JSON.stringify({ error: { message: "Assistant is not configured." } }), {
      headers: { "content-type": "application/json" }
    });
    await expect(readAssistantStream(response, () => {})).rejects.toThrow("Assistant is not configured.");
  });
});

describe("startersFor", () => {
  it("gives admins the change starters whatever the audience", () => {
    expect(startersFor("member", true)).toBe(startersFor("admin", true));
  });

  it("gives each audience its own list", () => {
    const lists = new Set([startersFor("member", false), startersFor("associate", false), startersFor("executive", false)]);
    expect(lists.size).toBe(3);
    expect(startersFor("executive", false)).toBe(startersFor("admin", false));
  });
});
