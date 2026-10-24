import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  batchGetSheetValues,
  buildServiceAccountAssertion,
  fetchSheetTitles
} from "@/src/lib/google-sheets";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = {
  email: "reader@example.iam.gserviceaccount.com",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
};

function decodePart(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

function stubGoogle(sheetsResponse: Response) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    if (String(url) === "https://oauth2.googleapis.com/token") {
      return Response.json({ access_token: "token-1", expires_in: 3599 });
    }
    return sheetsResponse;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildServiceAccountAssertion", () => {
  it("signs an RS256 JWT for the read-only Sheets scope", () => {
    const assertion = buildServiceAccountAssertion(account, 1_700_000_000_000);
    const [header, claims, signature] = assertion.split(".");

    expect(decodePart(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodePart(claims)).toEqual({
      iss: account.email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_700_000_000,
      exp: 1_700_003_600
    });
    expect(
      crypto.verify("sha256", Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, "base64url"))
    ).toBe(true);
  });
});

describe("batchGetSheetValues", () => {
  it("exchanges the assertion for a token and returns each range's rows in order", async () => {
    const fetchMock = stubGoogle(
      Response.json({ valueRanges: [{ values: [["a", "b"]] }, {}] })
    );

    const values = await batchGetSheetValues(account, "sheet-id", ["'Week of Oct 12'!A:E", "C2:M"]);

    expect(values).toEqual([[["a", "b"]], []]);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    const tokenBody = new URLSearchParams(String(tokenInit.body));
    expect(tokenBody.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(tokenBody.get("assertion")?.split(".")).toHaveLength(3);

    const [sheetsUrl, sheetsInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const url = new URL(sheetsUrl);
    expect(url.pathname).toBe("/v4/spreadsheets/sheet-id/values:batchGet");
    expect(url.searchParams.getAll("ranges")).toEqual(["'Week of Oct 12'!A:E", "C2:M"]);
    expect(new Headers(sheetsInit.headers).get("authorization")).toBe("Bearer token-1");
  });

  it("reports Google's status and message when a read fails", async () => {
    stubGoogle(
      Response.json({ error: { message: "The caller does not have permission" } }, { status: 403 })
    );

    await expect(batchGetSheetValues(account, "sheet-id", ["A:E"])).rejects.toThrow(
      "Google Sheets read failed (HTTP 403): The caller does not have permission"
    );
  });

  it("explains a key that cannot sign", async () => {
    stubGoogle(Response.json({}));

    await expect(
      batchGetSheetValues({ ...account, privateKey: "-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----" }, "sheet-id", ["A:E"])
    ).rejects.toThrow("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY could not sign");
  });
});

describe("fetchSheetTitles", () => {
  it("returns every tab title", async () => {
    const fetchMock = stubGoogle(
      Response.json({ sheets: [{ properties: { title: "Week of Oct 12" } }, { properties: { title: "Sample" } }] })
    );

    expect(await fetchSheetTitles(account, "sheet-id")).toEqual(["Week of Oct 12", "Sample"]);
    const url = new URL(String(fetchMock.mock.calls[1][0]));
    expect(url.pathname).toBe("/v4/spreadsheets/sheet-id");
    expect(url.searchParams.get("fields")).toBe("sheets.properties.title");
  });
});
