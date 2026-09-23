const HOUR = 60 * 60 * 1000;
const OVERDUE_AFTER = 72 * HOUR;
const REMIND_EVERY = 24 * HOUR;

export type OverdueReminderInput = {
  status: string;
  checkoutAt: Date;
  lastLateReminderAt: Date | null;
  now: Date;
};

export function shouldSendOverdueReminder(input: OverdueReminderInput): boolean {
  if (input.status !== "CHECKED_OUT") return false;
  if (input.checkoutAt.getTime() > input.now.getTime() - OVERDUE_AFTER) return false;
  if (input.lastLateReminderAt && input.lastLateReminderAt.getTime() > input.now.getTime() - REMIND_EVERY) {
    return false;
  }
  return true;
}
