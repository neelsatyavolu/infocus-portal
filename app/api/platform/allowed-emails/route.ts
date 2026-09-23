import { createHash } from "node:crypto";
import { z } from "zod";
import { parseAccountInviteInput, type ParsedAccountInvite } from "@/src/lib/account-invite";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { sendAccountInviteEmail } from "@/src/lib/email";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, normalizeEmail } from "@/src/lib/platform-admin";
import { provisionNasUsers, revokeNasUsers } from "@/src/lib/drive-user-sync";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { normalizeNickname, userDisplayName } from "@/src/lib/user-display";

/**
 * People / accounts API (legacy path `/api/platform/allowed-emails`).
 * Adding email + name creates a User account that may sign in with Google.
 */

const payloadSchema = z.object({
  email: z.string().min(1),
  name: z.string().max(120).optional(),
  sendInvite: z.boolean().optional()
});

const updatePayloadSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(120).nullable().optional()
});

function getAppBaseUrl(request: Request) {
  const configured = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  return configured || new URL(request.url).origin;
}

function invitedUserIdForEmail(email: string) {
  const digest = createHash("sha256").update(`invited:${email}`).digest("hex").slice(0, 24);
  return `user_${digest}`;
}

async function upsertAccount(entry: ParsedAccountInvite) {
  const existing = await prisma.user.findFirst({
    where: { email: entry.email },
    orderBy: { createdAt: "asc" }
  });
  const nickname = normalizeNickname(entry.name);

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name: entry.name ?? existing.name,
        ...(existing.nickname || !nickname ? {} : { nickname })
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  return prisma.user.create({
    data: {
      id: invitedUserIdForEmail(entry.email),
      email: entry.email,
      name: entry.name,
      nickname
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

function toAccountPayload(user: {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email ?? "",
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageAccounts) {
      throw new Error("FORBIDDEN");
    }

    const users = await prisma.user.findMany({
      where: { email: { not: null } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return ok(users.map(toAccountPayload));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageAccounts) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(getRequestKey(request, "platform:emails:write"), { max: 30, windowMs: 60_000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = payloadSchema.parse(await request.json());
    const emails = parseAccountInviteInput(payload.email, payload.name ?? null);
    const sendInvite = payload.sendInvite !== false;
    const signInUrl = `${getAppBaseUrl(request).replace(/\/$/, "")}/sign-in`;
    const inviterName = userDisplayName(user) || user.email || "An InFocus producer";

    const results = [];
    for (const entry of emails) {
      results.push(await upsertAccount(entry));
    }

    await provisionNasUsers(emails);

    let emailed = 0;
    if (sendInvite) {
      const mail = await sendAccountInviteEmail({
        recipients: emails.map((entry) => entry.email),
        signInUrl,
        recipientName: emails.length === 1 ? emails[0].name : null,
        inviterName
      });
      emailed = mail.sent;
    }

    if (emails.length === 1) {
      return ok(
        {
          ...toAccountPayload(results[0]),
          emailed
        },
        201
      );
    }

    return ok(
      {
        insertedCount: results.length,
        totalSubmitted: emails.length,
        emailed,
        accounts: results.map(toAccountPayload)
      },
      201
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageAccounts) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(getRequestKey(request, "platform:emails:write"), { max: 30, windowMs: 60_000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const { searchParams } = new URL(request.url);
    const email = normalizeEmail(searchParams.get("email"));
    const id = searchParams.get("id");

    if (!email && !id) {
      throw new Error("BAD_REQUEST");
    }

    // Soft-remove access: clear email so Google can no longer match this account.
    // Prefer id when provided.
    if (id) {
      const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
      if (!target) {
        throw new Error("NOT_FOUND");
      }
      // Keep row for FK integrity; blank email revokes sign-in match.
      await prisma.user.update({
        where: { id: target.id },
        data: {
          email: null
        }
      });
      if (target.email) {
        await revokeNasUsers([target.email]);
      }
      return ok({ deleted: true });
    }

    const target = await prisma.user.findFirst({
      where: { email },
      select: { id: true }
    });
    if (!target) {
      // Also clean legacy allowlist if present
      await prisma.allowedSignupEmail.deleteMany({ where: { email } });
      return ok({ deleted: true });
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { email: null }
    });
    await prisma.allowedSignupEmail.deleteMany({ where: { email } });
    await revokeNasUsers([email]);

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageAccounts) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(getRequestKey(request, "platform:emails:write"), { max: 30, windowMs: 60_000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = updatePayloadSchema.parse(await request.json());
    const nextName = payload.name?.trim() ?? "";

    const updated = await prisma.user.update({
      where: { id: payload.id },
      data: {
        name: nextName || null
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return ok(toAccountPayload(updated));
  } catch (error) {
    return handleRouteError(error);
  }
}

