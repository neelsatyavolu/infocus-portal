import { describe, expect, it } from "vitest";
import type { VaultEntrySummary } from "@/src/lib/password-vault";
import {
  countVaultEntries,
  filterVaultEntries,
  formatTotpCode,
  isVaultFilter,
  layoutFor
} from "@/app/(app)/passwords/vault-logic";

function entry(overrides: Partial<VaultEntrySummary> & { id: string; name: string }): VaultEntrySummary {
  return {
    url: null,
    username: null,
    hasPassword: true,
    hasTotp: false,
    hasNotes: false,
    updatedAt: "2026-10-01T12:00:00.000Z",
    updatedBy: "Abby",
    canDelete: true,
    canEdit: true,
    canShare: true,
    sharedWith: 0,
    ...overrides
  };
}

const ENTRIES: VaultEntrySummary[] = [
  entry({ id: "yt", name: "InFocus YouTube", url: "https://www.youtube.com", username: "infocus@example.edu", hasTotp: true }),
  entry({ id: "ig", name: "Instagram", url: "https://instagram.com", username: "handle.example", sharedWith: 2 }),
  entry({ id: "wifi", name: "Studio WiFi", hasTotp: true, sharedWith: 1 }),
  entry({ id: "drive", name: "Drive", username: "otto@example.edu" })
];

describe("filterVaultEntries", () => {
  it("returns every login with no query and the All chip", () => {
    expect(filterVaultEntries(ENTRIES, "", "all").map((e) => e.id)).toEqual(["yt", "ig", "wifi", "drive"]);
  });

  it("matches name, website and username, trimmed and case-insensitive", () => {
    expect(filterVaultEntries(ENTRIES, "  YOUTUBE ", "all").map((e) => e.id)).toEqual(["yt"]);
    expect(filterVaultEntries(ENTRIES, "instagram.com", "all").map((e) => e.id)).toEqual(["ig"]);
    expect(filterVaultEntries(ENTRIES, "otto@", "all").map((e) => e.id)).toEqual(["drive"]);
  });

  it("keeps only shared logins under the Shared chip, combined with the search", () => {
    expect(filterVaultEntries(ENTRIES, "", "shared").map((e) => e.id)).toEqual(["ig", "wifi"]);
    expect(filterVaultEntries(ENTRIES, "wifi", "shared").map((e) => e.id)).toEqual(["wifi"]);
    expect(filterVaultEntries(ENTRIES, "youtube", "shared")).toEqual([]);
  });

  it("does not mutate the input list", () => {
    const copy = [...ENTRIES];
    filterVaultEntries(ENTRIES, "drive", "shared");
    expect(ENTRIES).toEqual(copy);
  });
});

describe("countVaultEntries", () => {
  it("counts all, shared and 2FA logins", () => {
    expect(countVaultEntries(ENTRIES)).toEqual({ all: 4, shared: 2, withTotp: 2 });
    expect(countVaultEntries([])).toEqual({ all: 0, shared: 0, withTotp: 0 });
  });
});

describe("isVaultFilter", () => {
  it("accepts only the two chip values (a remembered value can be anything)", () => {
    expect(isVaultFilter("all")).toBe(true);
    expect(isVaultFilter("shared")).toBe(true);
    expect(isVaultFilter("2fa")).toBe(false);
    expect(isVaultFilter(null)).toBe(false);
  });
});

describe("layoutFor", () => {
  it("uses expanding rows until the card is measured and on narrow cards", () => {
    expect(layoutFor(0)).toBe("accordion");
    expect(layoutFor(895)).toBe("accordion");
  });

  it("splits list and detail from 896px and adds the activity rail from 1120px", () => {
    expect(layoutFor(896)).toBe("split");
    expect(layoutFor(1119)).toBe("split");
    expect(layoutFor(1120)).toBe("split-rail");
  });
});

describe("formatTotpCode", () => {
  it("groups a six-digit code as 3 + 3 and leaves other shapes alone", () => {
    expect(formatTotpCode("123456")).toBe("123 456");
    expect(formatTotpCode("12345678")).toBe("123 45678");
    expect(formatTotpCode("12a456")).toBe("12a456");
  });
});
