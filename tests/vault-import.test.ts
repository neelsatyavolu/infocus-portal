import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseCsvRows, parseOnePux, parseVaultCsv } from "@/src/lib/vault-import";

describe("1Password CSV import", () => {
  it("parses quoted fields, escaped quotes, commas, and newlines", () => {
    expect(parseCsvRows('a,"b,c","say ""hi""","line1\nline2"\r\nx,y,z,w\n')).toEqual([
      ["a", "b,c", 'say "hi"', "line1\nline2"],
      ["x", "y", "z", "w"]
    ]);
  });

  it("maps 1Password 8 CSV columns and skips archived rows", () => {
    const csv = [
      "Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes",
      'YouTube,https://youtube.com,news@example.com,"p,ass",otpauth://totp/x?secret=JBSWY3DPEHPK3PXP,false,false,,"Recovery: 1234"',
      "Old,https://old.example,old,pw,,false,true,,",
      "Empty,https://empty.example,,,,false,false,,just a note"
    ].join("\n");

    expect(parseVaultCsv(csv)).toEqual([
      {
        key: "csv-0",
        name: "YouTube",
        url: "https://youtube.com",
        username: "news@example.com",
        password: "p,ass",
        totp: "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP",
        notes: "Recovery: 1234",
        folder: null
      }
    ]);
  });

  it("rejects a CSV with no credential columns", () => {
    expect(() => parseVaultCsv("Title,Notes\nx,y")).toThrow(/no username or password/);
  });
});

describe("1Password .1pux import", () => {
  function onePux(data: unknown) {
    return zipSync({
      "export.attributes": strToU8("{}"),
      "export.data": strToU8(JSON.stringify(data))
    });
  }

  it("reads active logins with username, password, TOTP, notes, and vault name", () => {
    const file = onePux({
      accounts: [
        {
          vaults: [
            {
              attrs: { name: "InFocus" },
              items: [
                {
                  uuid: "a1",
                  state: "active",
                  categoryUuid: "001",
                  overview: { title: "Instagram", url: "https://instagram.com" },
                  details: {
                    loginFields: [
                      { designation: "username", value: "infocus" },
                      { designation: "password", value: "secret" }
                    ],
                    notesPlain: "shared",
                    sections: [{ fields: [{ value: { totp: "JBSWY3DPEHPK3PXP" } }] }]
                  }
                },
                { uuid: "a2", state: "archived", categoryUuid: "001", overview: { title: "Gone" }, details: { loginFields: [{ designation: "password", value: "x" }] } },
                { uuid: "a3", state: "active", categoryUuid: "003", overview: { title: "Note" }, details: { notesPlain: "n" } },
                { uuid: "a4", state: "active", categoryUuid: "005", overview: { title: "Wi-Fi" }, details: { password: "wifi-pw" } }
              ]
            }
          ]
        }
      ]
    });

    expect(parseOnePux(file)).toEqual([
      {
        key: "a1",
        name: "Instagram",
        url: "https://instagram.com",
        username: "infocus",
        password: "secret",
        totp: "JBSWY3DPEHPK3PXP",
        notes: "shared",
        folder: "InFocus"
      },
      { key: "a4", name: "Wi-Fi", url: "", username: "", password: "wifi-pw", totp: "", notes: "", folder: "InFocus" }
    ]);
  });

  it("fails clearly when export.data is missing", () => {
    expect(() => parseOnePux(zipSync({ "other.txt": strToU8("x") }))).toThrow(/export.data/);
  });
});
