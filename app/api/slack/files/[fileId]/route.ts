import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId } from "@/src/lib/auth";
import { fail } from "@/src/lib/http";
import { slackApi, slackBotToken } from "@/src/lib/slack-api";

const FILE_ID = /^F[A-Z0-9]+$/;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type SlackFileInfo = {
  ok?: boolean;
  error?: string;
  file?: {
    id?: string;
    name?: string;
    title?: string;
    mimetype?: string;
    size?: number;
    url_private_download?: string;
  };
};

export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  try {
    await requireUserId();
    const { fileId } = await context.params;
    if (!FILE_ID.test(fileId)) {
      return fail("Not found", 404);
    }

    const token = slackBotToken();
    if (!token) {
      return fail("Slack is not connected.", 503);
    }

    const info = (await slackApi("files.info", token, { file: fileId })) as SlackFileInfo;
    const file = info.file;
    const downloadUrl = file?.url_private_download?.trim();
    if (!info.ok || !file || !downloadUrl) {
      return fail(info.error === "file_not_found" ? "Not found" : "Could not open that file.", info.error === "file_not_found" ? 404 : 502);
    }
    if (typeof file.size === "number" && file.size > MAX_FILE_BYTES) {
      return fail("That file is too large to open here.", 413);
    }

    const upstream = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!upstream.ok || !upstream.body) {
      return fail("Could not open that file.", 502);
    }

    const filename = (file.name || file.title || "attachment").replace(/[\r\n"]/g, "");
    const headers = new Headers();
    headers.set("Content-Type", file.mimetype || upstream.headers.get("content-type") || "application/octet-stream");
    headers.set("Content-Disposition", `inline; filename="${filename}"`);
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    return handleRouteError(error);
  }
}
