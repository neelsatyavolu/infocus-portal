import { z } from "zod";

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
  | "VIEW_2FA_CODE";

export const VAULT_ACTION_LABELS: Record<VaultAction, string> = {
  CREATE: "Added",
  IMPORT: "Imported",
  UPDATE: "Edited",
  DELETE: "Deleted",
  REVEAL_PASSWORD: "Viewed password",
  REVEAL_NOTES: "Viewed notes",
  VIEW_2FA_CODE: "Viewed 2FA code"
};

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

/**
 * On create every field is optional except name. On update an omitted field
 * is left alone and an empty string clears it.
 */
export const vaultEntryInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(VAULT_NAME_MAX),
  url: z.string().max(VAULT_URL_MAX).optional(),
  username: z.string().max(VAULT_USERNAME_MAX).optional(),
  password: z.string().max(VAULT_PASSWORD_MAX).optional(),
  totp: z.string().max(VAULT_TOTP_MAX).optional(),
  notes: z.string().max(VAULT_NOTES_MAX).optional()
});

export const vaultEntryUpdateSchema = vaultEntryInputSchema.partial();

export const VAULT_IMPORT_MAX = 500;

export const vaultImportSchema = z.object({
  entries: z.array(vaultEntryInputSchema).min(1).max(VAULT_IMPORT_MAX)
});

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
};

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
