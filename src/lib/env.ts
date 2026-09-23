import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  APP_AUTH_SECRET: z.string().min(1).optional(),
  BUNNY_STREAM_LIBRARY_ID: z.string().min(1).optional(),
  BUNNY_STREAM_API_KEY: z.string().min(1).optional(),
  BUNNY_STREAM_PULL_ZONE: z.string().min(1).optional(),
  BUNNY_STREAM_SIGNING_KEY: z.string().min(1).optional(),
  BUNNY_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** BUNNY (default) or NAS — store package media on InFocus Drive / Package Cycles */
  MEDIA_STORAGE_PROVIDER: z.enum(["BUNNY", "NAS", "DRIVE"]).optional(),
  DRIVE_BASE_URL: z.string().url().optional(),
  DRIVE_SERVICE_TOKEN: z.string().min(1).optional(),
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  WEB_PUSH_PUBLIC_KEY: z.string().min(1).optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().min(1).optional(),
  WEB_PUSH_SUBJECT: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  APP_BASE_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  PASSWORD_VAULT_KEY: z.string().min(1).optional(),
  /** Gemini key for the Portal assistant. Separate from teleprompter `GEMINI_API_KEY`. */
  GEMINI_API_KEY_CHAT: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().min(1).optional(),
  GOOGLE_DOCS_MASTER_CALENDAR_DOC_ID: z.string().min(1).optional(),
  GOOGLE_SHEETS_SUBMITTED_ANNOUNCEMENTS_SPREADSHEET_ID: z.string().min(1).optional(),
  GOOGLE_SHEETS_SUBMITTED_ANNOUNCEMENTS_RANGE: z.string().min(1).optional(),
  GOOGLE_SHEETS_COLLEGE_VISITS_SPREADSHEET_ID: z.string().min(1).optional(),
  /** Incoming webhook for #proof-of-contact (preferred). */
  SLACK_PROOF_OF_CONTACT_WEBHOOK_URL: z.string().url().optional(),
  /** Bot token for InFocus Portal (`chat.postMessage` and announcements history). */
  SLACK_BOT_TOKEN: z.string().min(1).optional(),
  /** Channel name or ID; default C0BUG24GYP2 (#proof-of-contact). */
  SLACK_PROOF_OF_CONTACT_CHANNEL: z.string().min(1).optional(),
  /** Channel name or ID; default C0BEQV4DUCR (#announcements). */
  SLACK_ANNOUNCEMENTS_CHANNEL: z.string().min(1).optional(),
  /** Shared secret so the studio Mac can open teleprompter without Google login. */
  TELEPROMPTER_KIOSK_TOKEN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(16).optional()
  ),
  /** Label only (About This Mac serial). Not used for auth. */
  TELEPROMPTER_KIOSK_SERIAL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  /** Groq Cloud key for Portal assistant fallback after Gemini. */
  GROQ_API_KEY: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  /** Override Groq model id. Default is openai/gpt-oss-120b with Llama fallbacks. */
  GROQ_MODEL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  R2_ACCOUNT_ID: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  R2_ACCESS_KEY_ID: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  R2_SECRET_ACCESS_KEY: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  R2_BUCKET: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).optional()
  )
});

export const env = envSchema.parse(process.env);
