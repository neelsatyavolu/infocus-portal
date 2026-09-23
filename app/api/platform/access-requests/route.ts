import crypto from "node:crypto";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { sendAccessRequestDecisionEmail } from "@/src/lib/email";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, isEmailAllowedToUsePlatform, normalizeEmail } from "@/src/lib/platform-admin";
import { provisionNasUsers } from "@/src/lib/drive-user-sync";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { userDisplayName } from "@/src/lib/user-display";

const createPayloadSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().max(120).nullable().optional()
});

const decisionPayloadSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(["APPROVED", "DENIED"])
});

const bulkDecisionPayloadSchema = z.object({
  action: z.literal("APPROVE_ALL_PENDING")
});

const patchPayloadSchema = z.union([decisionPayloadSchema, bulkDecisionPayloadSchema]);

function getAppBaseUrl(request: Request) {
  const configured = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  return configured || new URL(request.url).origin;
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageAllowedEmails) {
      throw new Error("FORBIDDEN");
    }

    const requests = await prisma.platformAccessRequest.findMany({
      orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }]
    });

    const statusWeight: Record<string, number> = {
      PENDING: 0,
      APPROVED: 1,
      DENIED: 2
    };

    requests.sort((a, b) => {
      const byStatus = (statusWeight[a.status] ?? 10) - (statusWeight[b.status] ?? 10);
      if (byStatus !== 0) {
        return byStatus;
      }

      return b.requestedAt.getTime() - a.requestedAt.getTime();
    });

    return ok(requests);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "platform:access-requests:create"), { max: 10, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = createPayloadSchema.parse(await request.json());
    const email = normalizeEmail(payload.email);
    const name = payload.name?.trim() || null;

    if (!email) {
      throw new Error("BAD_REQUEST");
    }

    const alreadyAllowed = await isEmailAllowedToUsePlatform(email);

    if (alreadyAllowed) {
      const existingApprovedRequest = await prisma.platformAccessRequest.upsert({
        where: { email },
        update: {
          name,
          status: "APPROVED",
          decidedAt: new Date(),
          decidedByEmail: "system:auto-allowlisted"
        },
        create: {
          email,
          name,
          status: "APPROVED",
          requestedAt: new Date(),
          decidedAt: new Date(),
          decidedByEmail: "system:auto-allowlisted"
        }
      });

      return ok({
        request: existingApprovedRequest,
        alreadyAllowed: true
      });
    }

    const accessRequest = await prisma.platformAccessRequest.upsert({
      where: { email },
      update: {
        name,
        status: "PENDING",
        requestedAt: new Date(),
        decidedAt: null,
        decidedByEmail: null
      },
      create: {
        email,
        name,
        status: "PENDING",
        requestedAt: new Date()
      }
    });

    return ok(accessRequest, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageAllowedEmails) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(getRequestKey(request, "platform:access-requests:decide"), { max: 60, windowMs: 60_000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = patchPayloadSchema.parse(await request.json());
    const decidedByEmail = normalizeEmail(user.email) || null;
    const decidedByName = userDisplayName(user) || user.email || "an admin";
    const baseUrl = getAppBaseUrl(request).replace(/\/+$/, "");
    const signInUrl = `${baseUrl}/sign-in`;

    if ("action" in payload) {
      const now = new Date();
      const pending = await prisma.platformAccessRequest.findMany({
        where: { status: "PENDING" },
        orderBy: { requestedAt: "asc" }
      });

      if (pending.length === 0) {
        return ok({
          approvedCount: 0
        });
      }

      await prisma.platformAccessRequest.updateMany({
        where: {
          id: { in: pending.map((entry) => entry.id) },
          status: "PENDING"
        },
        data: {
          status: "APPROVED",
          decidedAt: now,
          decidedByEmail
        }
      });

      for (const entry of pending) {
        await prisma.allowedSignupEmail.upsert({
          where: { email: entry.email },
          update: {
            name: entry.name
          },
          create: {
            email: entry.email,
            name: entry.name
          }
        });

        const existingUser = await prisma.user.findFirst({
          where: { email: entry.email },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true }
        });

        if (existingUser) {
          if (!existingUser.name && entry.name) {
            await prisma.user.update({
              where: { id: existingUser.id },
              data: { name: entry.name }
            });
          }
        } else {
          await prisma.user.create({
            data: {
              id: `pending_${crypto.randomUUID()}`,
              email: entry.email,
              name: entry.name,
              imageUrl: null
            }
          });
        }
      }

      await provisionNasUsers(pending);

      await Promise.all(
        pending.map((entry) =>
          sendAccessRequestDecisionEmail({
            recipients: [entry.email],
            status: "APPROVED",
            signInUrl,
            recipientName: entry.name,
            decidedByName
          })
        )
      );

      return ok({
        approvedCount: pending.length
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.platformAccessRequest.findUnique({
        where: { id: payload.id }
      });

      if (!existing) {
        throw new Error("NOT_FOUND");
      }

      const next = await tx.platformAccessRequest.update({
        where: { id: payload.id },
        data: {
          status: payload.status,
          decidedAt: new Date(),
          decidedByEmail
        }
      });

      if (payload.status === "APPROVED") {
        await tx.allowedSignupEmail.upsert({
          where: { email: next.email },
          update: {
            name: next.name
          },
          create: {
            email: next.email,
            name: next.name
          }
        });

        const existingUser = await tx.user.findFirst({
          where: { email: next.email },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true }
        });

        if (existingUser) {
          if (!existingUser.name && next.name) {
            await tx.user.update({
              where: { id: existingUser.id },
              data: { name: next.name }
            });
          }
        } else {
          await tx.user.create({
            data: {
              id: `pending_${crypto.randomUUID()}`,
              email: next.email,
              name: next.name,
              imageUrl: null
            }
          });
        }
      }

      return next;
    });

    await sendAccessRequestDecisionEmail({
      recipients: [updated.email],
      status: payload.status,
      signInUrl,
      recipientName: updated.name,
      decidedByName
    });

    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
