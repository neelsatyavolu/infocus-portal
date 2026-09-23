import { mainAppOrigin } from "@/src/lib/hosts";

export const SLACK_HUB_BOT_NAME = "InFocus Portal";
export const SLACK_PROOF_OF_CONTACT_CHANNEL_DEFAULT = "C0BUG24GYP2";
export const SLACK_ANNOUNCEMENTS_CHANNEL_DEFAULT = "C0BEQV4DUCR";

export function slackBotToken() {
  return process.env.SLACK_BOT_TOKEN?.trim() || "";
}

export function slackHubIconUrl(origin = mainAppOrigin()) {
  return `${origin.replace(/\/+$/, "")}/favicon/infocus-hub-icon.png`;
}

export async function slackApi(method: string, token: string, payload: Record<string, string> = {}) {
  const body = new URLSearchParams(payload);
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
    },
    body
  });
  const data = (await response.json()) as { ok?: boolean; error?: string; [key: string]: unknown };
  return data;
}

export async function slackApiJson(method: string, token: string, payload: unknown) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(payload)
  });
  return (await response.json()) as { ok?: boolean; error?: string; [key: string]: unknown };
}
