import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ rows: [] as { email: string }[], fail: false, ended: 0 }));
vi.mock("pg", () => ({
  Client: class {
    async connect() {
      if (db.fail) throw new Error("database unreachable");
    }
    async query() {
      return { rows: db.rows };
    }
    async end() {
      db.ended += 1;
    }
  }
}));

import worker, { FORWARDED_HEADER, recipientList, resendPayload, type Env } from "../src/index";

const env: Env = {
  HYPERDRIVE: { connectionString: "postgres://test" } as Hyperdrive,
  RESEND_API_KEY: "re_test",
  LIST_ADDRESS: "producers@portal.test",
  LIST_NAME: "InFocus Producers",
  PLATFORM_SUPER_ADMIN_EMAIL: "Sage@Example.edu",
  FALLBACK_DESTINATIONS: "abby@example.edu, otto@example.edu"
};

const RAW = [
  'From: "Parent Person" <parent@example.org>',
  "To: producers@portal.test",
  "Subject: Interview request",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="b"',
  "",
  "--b",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Could my student be interviewed?",
  "--b",
  'Content-Type: text/plain; name="notes.txt"',
  'Content-Disposition: attachment; filename="notes.txt"',
  "Content-Transfer-Encoding: base64",
  "",
  btoa("hello"),
  "--b--",
  ""
].join("\r\n");

function message(raw = RAW, headers: Record<string, string> = {}) {
  return {
    from: "bounce@example.org",
    to: "producers@portal.test",
    raw: new Response(raw).body!,
    rawSize: raw.length,
    headers: new Headers(headers),
    forward: vi.fn(async (_to: string) => ({})),
    setReject: vi.fn(),
    reply: vi.fn()
  };
}

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  db.rows = [{ email: "abby@example.edu" }, { email: "otto@example.edu" }];
  db.fail = false;
  db.ended = 0;
  fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("recipients", () => {
  it("are deduplicated, lowercased and never the list itself", () => {
    expect(recipientList(["Abby@example.edu", "abby@example.edu", " ", null, "nope", "producers@portal.test"], "producers@portal.test"))
      .toEqual(["abby@example.edu"]);
  });
});

describe("producers@", () => {
  it("goes to the executive producers and super admins, replying to the sender", async () => {
    const mail = message();
    await worker.email(mail as unknown as ForwardableEmailMessage, env);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(["abby@example.edu", "otto@example.edu", "sage@example.edu"]);
    expect(body.from).toBe("Parent Person via InFocus Producers <producers@portal.test>");
    expect(body.reply_to).toEqual(["parent@example.org"]);
    expect(body.subject).toBe("Interview request");
    expect(body.text).toContain("Could my student be interviewed?");
    expect(body.attachments).toEqual([expect.objectContaining({ filename: "notes.txt", content: btoa("hello") })]);
    expect(body.headers[FORWARDED_HEADER]).toBe("1");
    expect(mail.forward).not.toHaveBeenCalled();
    expect(db.ended).toBe(1);
  });

  it("drops its own copy coming back through the list", async () => {
    const mail = message(RAW, { [FORWARDED_HEADER]: "1" });
    await worker.email(mail as unknown as ForwardableEmailMessage, env);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mail.forward).not.toHaveBeenCalled();
  });

  it("forwards to the fallback list when the database is down", async () => {
    db.fail = true;
    const mail = message();
    await worker.email(mail as unknown as ForwardableEmailMessage, env);
    expect(mail.forward.mock.calls.map((call) => call[0])).toEqual(["abby@example.edu", "otto@example.edu"]);
    expect(mail.setReject).not.toHaveBeenCalled();
  });

  it("forwards to the fallback list when Resend refuses, and bounces only if that fails too", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 500 }));
    const mail = message();
    mail.forward.mockRejectedValue(new Error("not verified"));
    await worker.email(mail as unknown as ForwardableEmailMessage, env);
    expect(mail.forward).toHaveBeenCalledTimes(2);
    expect(mail.setReject).toHaveBeenCalledWith(expect.stringContaining("producers@portal.test"));
  });

  it("uses the envelope sender and a placeholder subject when the headers have none", () => {
    const payload = resendPayload({ headers: [], attachments: [], text: "hi" } as never, ["abby@example.edu"], env, "bounce@example.org");
    expect(payload.from).toBe("bounce@example.org via InFocus Producers <producers@portal.test>");
    expect(payload.reply_to).toEqual(["bounce@example.org"]);
    expect(payload.subject).toBe("(no subject)");
  });
});
