import { sendBrandedEmails } from "@/src/lib/email";
import { formatPacificWindowTime } from "@/src/lib/equipment-request-window";
import { equipmentAppOrigin } from "@/src/lib/hosts";
import {
  PACKAGE_ADVISER_EMAIL,
  PLATFORM_SUPER_ADMIN_EMAIL,
  normalizeEmail
} from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

export async function listEquipmentManagerEmails() {
  const [assignments, managers] = await Promise.all([
    prisma.platformRoleAssignment.findMany({
      where: {
        role: { in: ["ASSOCIATE_PRODUCER", "EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"] }
      },
      select: { email: true }
    }),
    prisma.equipmentManager.findMany({
      include: { user: { select: { email: true } } }
    })
  ]);

  const unique = new Set<string>();
  const emails = [
    ...assignments.map((row) => row.email),
    PLATFORM_SUPER_ADMIN_EMAIL,
    PACKAGE_ADVISER_EMAIL,
    ...managers.map((row) => row.user.email)
  ];

  for (const email of emails) {
    const normalized = normalizeEmail(email);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

export async function sendEquipmentRequestEmails(input: {
  studentName: string;
  studentId: string;
  email: string;
  items: Array<{ name: string; barcode: string }>;
  pickupAt?: Date | null;
  returnAt?: Date | null;
}) {
  const recipients = await listEquipmentManagerEmails();
  const studentLabel = input.studentName.trim() || input.studentId;
  const count = input.items.length;
  const countLabel = count === 1 ? "1 item" : `${count} items`;
  const itemList = input.items.map((item) => `${item.name} (${item.barcode})`).join(", ");
  const origin = equipmentAppOrigin().replace(/\/+$/, "");

  return sendBrandedEmails({
    recipients,
    subject: `Equipment request from ${studentLabel}`,
    heading: "New equipment request",
    paragraphs: [
      `${studentLabel} (${input.studentId}) requested ${countLabel}.`,
      `Email: ${input.email}`,
      ...windowParagraphs(input.pickupAt, input.returnAt),
      itemList
    ],
    ctaLabel: "Review requests",
    ctaUrl: `${origin}/equipment/manage`
  });
}

function windowParagraphs(pickupAt?: Date | null, returnAt?: Date | null) {
  if (!pickupAt && !returnAt) return [];
  return [`Pickup: ${formatPacificWindowTime(pickupAt)} · Return: ${formatPacificWindowTime(returnAt)} (Pacific)`];
}

/** Emails the requester when a manager approves or denies their request (denials list each item's reason). */
export async function sendEquipmentDecisionEmail(input: {
  requestId: string;
  email: string;
  studentName: string | null;
  decision: "APPROVED" | "DENIED";
  pickupAt: Date | null;
  returnAt: Date | null;
  items: Array<{ name: string; barcode: string; reason?: string | null }>;
}) {
  const email = input.email.trim();
  if (!email) return null;
  const origin = equipmentAppOrigin().replace(/\/+$/, "");
  const greeting = input.studentName?.trim() ? `Hi ${input.studentName.trim()},` : "Hi,";
  const approved = input.decision === "APPROVED";
  const itemLines = input.items.map((item) => {
    const label = `${item.name} (${item.barcode})`;
    const reason = item.reason?.trim();
    return !approved && reason ? `${label}: ${reason}` : label;
  });

  return sendBrandedEmails({
    recipients: [email],
    subject: approved ? "Your equipment request was approved" : "Your equipment request was denied",
    heading: approved ? "Equipment request approved" : "Equipment request denied",
    paragraphs: [
      greeting,
      approved
        ? "Your equipment request was approved. These items are held for you; bring your student ID to pick them up."
        : "Your equipment request was denied.",
      ...windowParagraphs(input.pickupAt, input.returnAt),
      ...(approved ? itemLines : itemLines.map((line) => `Denied: ${line}`))
    ],
    ctaLabel: approved ? "View equipment" : "Request again",
    ctaUrl: `${origin}/equipment`,
    idempotencyKey: `equipment-decision:${input.requestId}:${input.decision}`
  });
}

export async function sendEquipmentOverdueEmails(input: {
  itemName: string;
  code: string;
  studentName: string;
  studentEmail?: string | null;
  managerEmails?: string[];
  hoursOut: number;
  manageUrl?: string;
}) {
  const managers = input.managerEmails ?? (await listEquipmentManagerEmails());
  const origin = equipmentAppOrigin().replace(/\/+$/, "");
  const manageUrl = input.manageUrl ?? `${origin}/equipment/manage`;
  const studentLabel = input.studentName.trim() || "A student";
  const itemLabel = `${input.itemName} (${input.code})`;
  const hoursLabel = `${input.hoursOut} hours`;

  const managersResult = await sendBrandedEmails({
    recipients: managers,
    subject: `Overdue: ${itemLabel}`,
    heading: "Overdue equipment",
    paragraphs: [
      `${studentLabel} still has ${itemLabel}.`,
      `It has been out for ${hoursLabel}.`
    ],
    ctaLabel: "Open manage",
    ctaUrl: manageUrl
  });

  const studentEmail = input.studentEmail?.trim();
  if (!studentEmail) {
    return { managers: managersResult, student: null };
  }

  const studentResult = await sendBrandedEmails({
    recipients: [studentEmail],
    subject: `Please return ${itemLabel}`,
    heading: "Equipment overdue",
    paragraphs: [
      `You still have ${itemLabel}.`,
      `It has been out for ${hoursLabel}. Please return it.`
    ],
    ctaLabel: "Open manage",
    ctaUrl: manageUrl
  });
  return { managers: managersResult, student: studentResult };
}
