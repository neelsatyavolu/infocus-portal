import {
  PACKAGE_ADVISER_EMAIL,
  PLATFORM_SUPER_ADMIN_EMAIL,
  normalizeEmail
} from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const STARTING_EXTENSION_DAYS = 14;

type ExtensionUsageEntry = {
  extensionDaysApplied: number;
  extensionExempt: boolean;
  freeExtensionDays?: number | null;
};

export function toDateKey(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function parseDateInput(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (!DATE_KEY_PATTERN.test(value)) {
    throw new Error("BAD_REQUEST");
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || toDateKey(parsed) !== value) {
    throw new Error("BAD_REQUEST");
  }

  return parsed;
}

export function calculateExtensionDays(finalCutDate: Date | null, turnedInDate: Date | null) {
  if (!finalCutDate || !turnedInDate) {
    return 0;
  }

  const diff = Math.floor((turnedInDate.getTime() - finalCutDate.getTime()) / DAY_MS);
  return diff > 0 ? diff : 0;
}

export function sanitizeFreeExtensionDays(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value ?? 0));
}

export function effectiveAppliedDays(entry: ExtensionUsageEntry) {
  if (entry.extensionExempt) {
    return 0;
  }

  return Math.max(0, entry.extensionDaysApplied - sanitizeFreeExtensionDays(entry.freeExtensionDays));
}

export function calculateExtensionsRemaining(entries: ExtensionUsageEntry[]) {
  const used = entries.reduce((sum, entry) => sum + effectiveAppliedDays(entry), 0);
  return STARTING_EXTENSION_DAYS - used;
}

export async function getAdminEmailSet() {
  const assignments = await prisma.platformRoleAssignment.findMany({
    where: {
      role: {
        in: ["EXECUTIVE_PRODUCER", "SUPER_ADMIN", "ADVISER"]
      }
    },
    select: { email: true }
  });

  const adminEmails = new Set(
    assignments
      .map((entry) => normalizeEmail(entry.email))
      .filter(Boolean)
  );
  for (const email of [PLATFORM_SUPER_ADMIN_EMAIL, PACKAGE_ADVISER_EMAIL]) {
    if (email) adminEmails.add(email);
  }

  return adminEmails;
}

export function isAdminUserEmail(email: string | null | undefined, adminEmails: Set<string>) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }

  return adminEmails.has(normalized);
}
