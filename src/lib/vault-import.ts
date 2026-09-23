import { strFromU8, unzipSync } from "fflate";
import {
  VAULT_NAME_MAX,
  VAULT_NOTES_MAX,
  VAULT_PASSWORD_MAX,
  VAULT_TOTP_MAX,
  VAULT_URL_MAX,
  VAULT_USERNAME_MAX
} from "@/src/lib/password-vault";

/**
 * Parses 1Password exports (.1pux or CSV) in the browser so the full export
 * never leaves the device; only the items a producer selects are uploaded.
 */
export type ImportCandidate = {
  key: string;
  name: string;
  url: string;
  username: string;
  password: string;
  totp: string;
  notes: string;
  folder: string | null;
};

const LOGIN_CATEGORY = "001";
const PASSWORD_CATEGORY = "005";

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function candidate(key: string, raw: Omit<ImportCandidate, "key">): ImportCandidate | null {
  const item: ImportCandidate = {
    key,
    name: clip(raw.name, VAULT_NAME_MAX) || clip(raw.url, VAULT_NAME_MAX) || "Untitled",
    url: clip(raw.url, VAULT_URL_MAX),
    username: clip(raw.username, VAULT_USERNAME_MAX),
    password: typeof raw.password === "string" ? raw.password.slice(0, VAULT_PASSWORD_MAX) : "",
    totp: clip(raw.totp, VAULT_TOTP_MAX),
    notes: clip(raw.notes, VAULT_NOTES_MAX),
    folder: raw.folder
  };
  return item.username || item.password || item.totp ? item : null;
}

/* ---------------------------------- 1PUX --------------------------------- */

type OnePuxField = { designation?: string; value?: string };
type OnePuxSectionField = { value?: Record<string, unknown> };
type OnePuxItem = {
  uuid?: string;
  state?: string;
  categoryUuid?: string;
  overview?: { title?: string; url?: string; urls?: { url?: string }[] };
  details?: {
    loginFields?: OnePuxField[];
    password?: string;
    notesPlain?: string;
    sections?: { fields?: OnePuxSectionField[] }[];
  };
};
type OnePuxExport = {
  accounts?: { vaults?: { attrs?: { name?: string }; items?: OnePuxItem[] }[] }[];
};

function firstTotp(item: OnePuxItem) {
  for (const section of item.details?.sections ?? []) {
    for (const field of section.fields ?? []) {
      const totp = field.value?.totp;
      if (typeof totp === "string" && totp.trim()) return totp;
    }
  }
  return "";
}

export function parseOnePux(data: Uint8Array): ImportCandidate[] {
  const files = unzipSync(data, { filter: (file) => file.name === "export.data" });
  const raw = files["export.data"];
  if (!raw) throw new Error("This .1pux file has no export.data.");
  const parsed = JSON.parse(strFromU8(raw)) as OnePuxExport;

  const items: ImportCandidate[] = [];
  for (const account of parsed.accounts ?? []) {
    for (const vault of account.vaults ?? []) {
      for (const item of vault.items ?? []) {
        if (item.state && item.state !== "active") continue;
        if (item.categoryUuid !== LOGIN_CATEGORY && item.categoryUuid !== PASSWORD_CATEGORY) continue;
        const loginFields = item.details?.loginFields ?? [];
        const fieldValue = (designation: string) =>
          loginFields.find((field) => field.designation === designation)?.value ?? "";
        const next = candidate(item.uuid ?? `1pux-${items.length}`, {
          name: item.overview?.title ?? "",
          url: item.overview?.url || item.overview?.urls?.[0]?.url || "",
          username: fieldValue("username"),
          password: fieldValue("password") || item.details?.password || "",
          totp: firstTotp(item),
          notes: item.details?.notesPlain ?? "",
          folder: vault.attrs?.name ?? null
        });
        if (next) items.push(next);
      }
    }
  }
  return items;
}

/* ----------------------------------- CSV ---------------------------------- */

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row = [...row, field];
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      rows.push([...row, field]);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

const CSV_COLUMNS: Record<keyof Omit<ImportCandidate, "key" | "folder">, string[]> = {
  name: ["title", "name"],
  url: ["url", "website", "login_uri", "login url"],
  username: ["username", "login_username", "login username", "email"],
  password: ["password", "login_password", "login password"],
  totp: ["otpauth", "one-time password", "totp", "login_totp"],
  notes: ["notes", "notesplain", "note"]
};

export function parseVaultCsv(text: string): ImportCandidate[] {
  const [header, ...rows] = parseCsvRows(text);
  if (!header) return [];
  const normalized = header.map((cell) => cell.trim().toLowerCase());
  const column = (names: string[]) => normalized.findIndex((cell) => names.includes(cell));
  const indexes = Object.fromEntries(
    Object.entries(CSV_COLUMNS).map(([key, names]) => [key, column(names)])
  ) as Record<keyof typeof CSV_COLUMNS, number>;
  if (indexes.password < 0 && indexes.username < 0) {
    throw new Error("This CSV has no username or password column.");
  }
  const archived = normalized.indexOf("archived");
  const cell = (cells: string[], index: number) => (index >= 0 ? (cells[index] ?? "") : "");

  return rows.flatMap((cells, rowIndex) => {
    if (archived >= 0 && cell(cells, archived).trim().toLowerCase() === "true") return [];
    const next = candidate(`csv-${rowIndex}`, {
      name: cell(cells, indexes.name),
      url: cell(cells, indexes.url),
      username: cell(cells, indexes.username),
      password: cell(cells, indexes.password),
      totp: cell(cells, indexes.totp),
      notes: cell(cells, indexes.notes),
      folder: null
    });
    return next ? [next] : [];
  });
}

export async function parseVaultImportFile(file: File): Promise<ImportCandidate[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".1pux")) return parseOnePux(new Uint8Array(await file.arrayBuffer()));
  if (lower.endsWith(".csv")) return parseVaultCsv(await file.text());
  throw new Error("Choose a 1Password .1pux or .csv export.");
}
