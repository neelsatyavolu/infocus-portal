import { mainAppOrigin } from "@/src/lib/hosts";

const INK = "#0A0A0A";
const CARD = "#141414";
const LINE = "#2C2C2C";
const PAPER = "#F7F7F8";
const MUTED = "#B5B5BB";
const FOOTER = "#6B6B70";
const GREEN = "#00C72C";

export const EMAIL_BRAND = {
  ink: INK,
  card: CARD,
  line: LINE,
  paper: PAPER,
  muted: MUTED,
  footer: FOOTER,
  green: GREEN
} as const;

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function settingsUrl() {
  return `${mainAppOrigin()}/settings`;
}

export function brandAssetUrl(path: string) {
  const origin = mainAppOrigin().replace(/\/+$/, "");
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function renderBrandedEmail(input: {
  heading: string;
  paragraphs?: string[];
  extraHtml?: string;
  ctaLabel: string;
  ctaUrl: string;
  preview?: string;
}): { html: string; text: string } {
  const heading = escapeHtml(input.heading);
  const paragraphs = (input.paragraphs ?? []).map((paragraph) => escapeHtml(paragraph));
  const preview = escapeHtml((input.preview ?? input.paragraphs?.[0] ?? input.heading).slice(0, 140));
  const ctaLabel = escapeHtml(input.ctaLabel);
  const ctaUrl = input.ctaUrl;
  const manageUrl = settingsUrl();
  const logoUrl = brandAssetUrl("/favicon/infocus-logo.png");
  const wordmarkUrl = brandAssetUrl("/favicon/infocus-wordmark.png");
  const extraHtml = input.extraHtml ?? "";

  const paragraphHtml = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${PAPER};">${paragraph}</p>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:${INK};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${INK};">${preview}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:${CARD};border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:18px 28px 14px;background:${INK};">
              <img src="${logoUrl}" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0;" />
              <img src="${wordmarkUrl}" height="22" alt="InFocus Portal" style="display:inline-block;vertical-align:middle;margin-left:10px;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="height:3px;line-height:3px;font-size:0;background:${GREEN};">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;color:${PAPER};">
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;font-weight:700;color:${PAPER};">${heading}</h1>
              ${paragraphHtml}
              ${extraHtml}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;">
                <tr>
                  <td style="background:${GREEN};border-radius:8px;">
                    <a href="${ctaUrl}" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:${INK};text-decoration:none;">${ctaLabel}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${FOOTER};">
              InFocus Portal · <a href="${manageUrl}" style="color:${GREEN};text-decoration:none;">Notification settings</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    input.heading,
    "",
    ...(input.paragraphs ?? []),
    "",
    `${input.ctaLabel}: ${ctaUrl}`,
    "",
    `Notification settings: ${manageUrl}`
  ];

  return { html, text: textParts.join("\n") };
}
