import { shouldSendOverdueReminder } from "@/src/lib/equipment-overdue";
import { prisma } from "@/src/lib/prisma";
import { listEquipmentManagerEmails, sendEquipmentOverdueEmails } from "@/src/server/equipment-mail";

const HOUR = 60 * 60 * 1000;

export async function runEquipmentOverdueJob(now = new Date()) {
  // Snap to 16:00 UTC so Inngest jitter does not skip the next 24h window.
  const scheduled = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0));

  const checkouts = await prisma.equipmentCheckout.findMany({
    where: { status: "CHECKED_OUT" },
    include: { item: true, student: true }
  });

  const due = checkouts.filter((checkout) =>
    shouldSendOverdueReminder({
      status: checkout.status,
      checkoutAt: checkout.checkoutAt,
      lastLateReminderAt: checkout.lastLateReminderAt,
      now: scheduled
    })
  );

  if (due.length === 0) {
    return { reminded: 0, failed: 0 };
  }

  const managerEmails = await listEquipmentManagerEmails();
  let reminded = 0;
  let failed = 0;

  for (const checkout of due) {
    try {
      const hoursOut = Math.max(0, Math.floor((scheduled.getTime() - checkout.checkoutAt.getTime()) / HOUR));
      const mail = await sendEquipmentOverdueEmails({
        itemName: checkout.item.name,
        code: checkout.item.barcode,
        studentName: checkout.student.name?.trim() || checkout.student.studentId,
        studentEmail: checkout.student.email,
        managerEmails,
        hoursOut
      });
      if (mail.managers.failed !== 0 || (mail.student?.failed ?? 0) !== 0) {
        failed += 1;
        continue;
      }
      await prisma.equipmentCheckout.update({
        where: { id: checkout.id },
        data: { lastLateReminderAt: scheduled }
      });
      reminded += 1;
    } catch (error) {
      failed += 1;
      console.error(`equipment-overdue: failed to remind checkout ${checkout.id}`, error);
    }
  }

  return { reminded, failed };
}
