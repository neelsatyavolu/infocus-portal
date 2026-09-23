import { inngest } from "@/src/lib/inngest";
import { prisma } from "@/src/lib/prisma";
import { loadAssignableProducers } from "@/src/server/package-progress-data";
import { loadAssociatePerformance } from "@/src/server/associate-performance";

export const refreshAssociateFeedbackDaily = inngest.createFunction(
  { id: "associate-feedback-quality-daily", concurrency: 1, retries: 2 },
  { cron: "TZ=America/Los_Angeles 0 0 * * *" },
  async ({ step, event }) => {
    const { day, producers } = await step.run("build-refresh-queue", async () => {
      const producers = await loadAssignableProducers();
      const rows = await prisma.packageProgressRow.findMany({
        where: { cycleNumber: { gt: 0 }, assignedProducerUserId: { in: producers.map((p) => p.userId) } },
        select: { assignedProducerUserId: true, cycleNumber: true },
        distinct: ["assignedProducerUserId", "cycleNumber"]
      });
      return {
        day: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(event.ts ?? Date.now())),
        producers: producers.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "") || a.userId.localeCompare(b.userId)).map((p) => ({
          userId: p.userId,
          cycles: rows.filter((r) => r.assignedProducerUserId === p.userId).map((r) => r.cycleNumber).sort((a, b) => a - b)
        })).filter((p) => p.cycles.length)
      };
    });
    const results = [];
    for (const [index, producer] of producers.entries()) {
      if (index > 0) await step.sleep(`producer-gap-${producer.userId}`, "30m");
      for (const [cycleIndex, cycle] of producer.cycles.entries()) {
        if (cycleIndex > 0) await step.sleep(`cycle-gap-${producer.userId}-${cycle}`, "1m");
        results.push(await step.run(`refresh-${producer.userId}-${cycle}`, async () => {
          const data = await loadAssociatePerformance(cycle, { evaluateUserId: producer.userId, refreshDay: day });
          const quality = data.associates.find((a) => a.userId === producer.userId)?.quality;
          return { userId: producer.userId, cycle, status: quality?.status ?? "skipped", evaluatedAt: quality?.evaluatedAt ?? null };
        }));
      }
    }
    return { day, results };
  }
);
