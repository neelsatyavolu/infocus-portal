import { sendBrandedEmails } from "@/src/lib/email";
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
      itemList
    ],
    ctaLabel: "Review requests",
    ctaUrl: `${origin}/equipment/manage`
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
