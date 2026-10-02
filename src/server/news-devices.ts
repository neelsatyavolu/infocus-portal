import { z } from "zod";
import { prisma } from "@/src/lib/prisma";

/** iPhones with the public InFocus app that asked for alerts. Anonymous: a token and its choices. */

const deviceToken = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{64,200}$/, "Invalid device token.")
  .transform((token) => token.toLowerCase());

export const newsDeviceSchema = z.object({
  token: deviceToken,
  environment: z.enum(["production", "development"]),
  appVersion: z.string().trim().max(40).optional(),
  shows: z.boolean(),
  stories: z.boolean(),
  live: z.boolean()
});

export const newsDeviceDeleteSchema = z.object({ token: deviceToken });

export type NewsDeviceInput = z.infer<typeof newsDeviceSchema>;

export async function registerNewsDevice(input: NewsDeviceInput) {
  const choices = { environment: input.environment, appVersion: input.appVersion ?? null, shows: input.shows, stories: input.stories, live: input.live };
  await prisma.newsPushDevice.upsert({
    where: { token: input.token },
    update: choices,
    create: { token: input.token, ...choices }
  });
}

export async function removeNewsDevice(token: string) {
  const { count } = await prisma.newsPushDevice.deleteMany({ where: { token } });
  return count;
}
