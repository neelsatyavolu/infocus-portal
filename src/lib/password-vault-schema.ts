import { z } from "zod";
import {
  VAULT_IMPORT_MAX,
  VAULT_NAME_MAX,
  VAULT_NOTES_MAX,
  VAULT_PASSWORD_MAX,
  VAULT_SHARE_MAX,
  VAULT_TOTP_MAX,
  VAULT_URL_MAX,
  VAULT_USERNAME_MAX
} from "@/src/lib/password-vault";

// Zod schemas live apart from password-vault so the vault UI doesn't bundle zod.

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

export const vaultImportSchema = z.object({
  entries: z.array(vaultEntryInputSchema).min(1).max(VAULT_IMPORT_MAX)
});

export const vaultShareSchema = z.object({
  userIds: z.array(z.string().min(1).max(64)).max(VAULT_SHARE_MAX)
});
