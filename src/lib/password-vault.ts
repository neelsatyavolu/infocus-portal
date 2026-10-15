import type { z } from "zod";
import type { vaultEntryInputSchema, vaultEntryUpdateSchema } from "@/src/lib/password-vault-schema";

export const VAULT_NAME_MAX = 120;
export const VAULT_URL_MAX = 500;
export const VAULT_USERNAME_MAX = 320;
export const VAULT_PASSWORD_MAX = 1000;
export const VAULT_TOTP_MAX = 1000;
export const VAULT_NOTES_MAX = 5000;

export const VAULT_REVEAL_FIELDS = ["password", "notes", "totp"] as const;
export type VaultRevealField = (typeof VAULT_REVEAL_FIELDS)[number];

export type VaultAction =
  | "CREATE"
  | "IMPORT"
  | "UPDATE"
  | "DELETE"
  | "REVEAL_PASSWORD"
  | "REVEAL_NOTES"
  | "VIEW_2FA_CODE"
  | "SHARE";

export const VAULT_ACTION_LABELS: Record<VaultAction, string> = {
  CREATE: "Added",
  IMPORT: "Imported",
  UPDATE: "Edited",
  DELETE: "Deleted",
  REVEAL_PASSWORD: "Viewed password",
  REVEAL_NOTES: "Viewed notes",
  VIEW_2FA_CODE: "Viewed 2FA code",
  SHARE: "Changed sharing"
};

/**
 * "full": associate producers and up see and manage every login.
 * "shared": anyone else sees only the logins an exec shared with them,
 * and can use them (username, password, 2FA code) but not see notes or edit.
 */
export type VaultAccess = "full" | "shared";

/** Only http(s) links are stored, so the list can never render a javascript: href. */
export function normalizeVaultUrl(raw: string | null | undefined) {
  const value = raw?.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export const VAULT_IMPORT_MAX = 500;

export const VAULT_SHARE_MAX = 200;

export type VaultEntryInput = z.infer<typeof vaultEntryInputSchema>;
export type VaultEntryUpdate = z.infer<typeof vaultEntryUpdateSchema>;

export type VaultEntrySummary = {
  id: string;
  name: string;
  url: string | null;
  username: string | null;
  hasPassword: boolean;
  hasTotp: boolean;
  hasNotes: boolean;
  updatedAt: string;
  updatedBy: string | null;
  canDelete: boolean;
  canEdit: boolean;
  canShare: boolean;
  /** How many people outside the vault this login is shared with (0 for shared viewers). */
  sharedWith: number;
};

export type VaultPerson = { id: string; name: string };

export type VaultImportResult = {
  imported: number;
  warnings: string[];
};

export type VaultActivityRow = {
  id: string;
  action: VaultAction;
  actor: string;
  createdAt: string;
};
