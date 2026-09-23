import type { PlatformRole } from "@prisma/client";
import {
  buildBoardDays,
  buildBoardLivestreams,
  buildBoardDeadlines,
  buildRaceLanes,
  classBoardWindow,
  classBoardReviewDates,
  formatGateDate,
  RACE_GATE_LABELS,
  type ClassBoardModel,
  type RacePackageInput
} from "@/src/lib/class-board";
import { GROUP_NAV_SLUGS } from "@/src/lib/package-stages";
import { prisma } from "@/src/lib/prisma";
import { addDaysToDateKey } from "@/src/lib/show-assignment";
import { userDisplayName } from "@/src/lib/user-display";
import { loadMasterCalendarMonth } from "@/src/server/master-calendar-data";
import { loadPackageProgressData } from "@/src/server/package-progress-data";
import { loadPalyClassSessions } from "@/src/server/paly-bell-schedule";

export async function loadClassBoard(role: PlatformRole | null, now = new Date()): Promise<ClassBoardModel> {
  const window = classBoardWindow(now);
  const progress = await loadPackageProgressData();
  const [cycles, events, calendars, classSessions] = await Promise.all([
    prisma.packageCycle.findMany({
      orderBy: { cycleNumber: "asc" },
      select: {
        cycleNumber: true,
        focus: true,
        pitchingDate: true,
        proofOfContactDate: true,
        aRollBRollDate: true,
        initialCutDate: true,
        finalCutDate: true
      }
    }),
    prisma.livestreamEvent.findMany({
      where: {
        status: "SCHEDULED",
        startsAt: { gte: window.start, lt: window.until }
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        title: true,
        startsAt: true,
        location: true,
        status: true,
        availability: true,
        capacity: true,
        attendees: {
          orderBy: { createdAt: "asc" },
          select: { user: { select: { name: true, nickname: true, email: true } } }
        }
      }
    }),
    Promise.all([...monthsBetween(window.today, window.end)].map((month) => loadMasterCalendarMonth(month, role))),
    loadPalyClassSessions(window.today, window.end)
  ]);

  const cycle = cycles.find((item) => item.cycleNumber === progress.activeCycleNumber) ?? null;
  const reviewDates = classBoardReviewDates(cycle?.finalCutDate ?? null);
  const gateDates = {
    pitching: cycle?.pitchingDate ?? null,
    brainstorming: cycle?.proofOfContactDate ?? null,
    "a-roll": cycle?.aRollBRollDate ?? null,
    "initial-stage-1": cycle?.initialCutDate ?? null,
    "initial-stage-2": reviewDates.initialCutStage2,
    "initial-stage-3": reviewDates.initialCutStage3,
    "final-cut": cycle?.finalCutDate ?? null
  };

  const rows: RacePackageInput[] = progress.rows.map((row) => ({
    id: row.id,
    topic: row.groupTopic,
    memberNames: row.members.map((member) => member.name ?? "").filter(Boolean),
    producerName: row.assignedProducer?.name ?? null,
    extension: row.extension,
    extensionDays: row.extensionDays,
    pitching: row.pitching,
    proofOfContact: row.proofOfContact,
    aRollBRoll: row.aRollBRoll,
    initialCut: row.initialCut,
    initialCutReviewStage: row.initialCutReviewStage,
    finalCut: row.finalCut,
    status: {
      reviewReadyAt: row.reviewReadyAt,
      pitching: row.pitching,
      proofOfContact: row.proofOfContact,
      proofCount: row.proofs.length,
      brainstormDocUrl: row.brainstormDocUrl,
      aRollBRoll: row.aRollBRoll,
      aRollHasMedia: row.aRollHasMedia,
      aRollNeedsChanges: row.aRollNeedsChanges,
      initialCutHasMedia: Boolean(row.initialCutMediaItemId),
      initialCutVersionNumber: row.initialCutVersionNumber,
      initialCutNeedsRevisions: row.initialCutNeedsRevisions,
      awaitingRevisedInitialCut: row.awaitingRevisedInitialCut,
      approvalStage: row.approvalStage,
      remainingExecutiveSignoffs: row.remainingExecutiveSignoffs,
      finalCutHasMedia: Boolean(row.finalCutMediaItemId),
      queuedForAir: row.queuedForAir
    }
  }));

  return {
    classSessions,
    deadlines: buildBoardDeadlines(
      cycles.map((item) => ({
        cycleNumber: item.cycleNumber,
        pitching: item.pitchingDate,
        proofOfContact: item.proofOfContactDate,
        aRollBRoll: item.aRollBRollDate,
        initialCut: item.initialCutDate,
        finalCut: item.finalCutDate
      })),
      window.today
    ),
    generatedAt: now.toISOString(),
    cycleNumber: progress.activeCycleNumber,
    cycleFocus: cycle?.focus.trim() ?? "",
    gates: GROUP_NAV_SLUGS.map((key) => ({
      key,
      label: RACE_GATE_LABELS[key],
      dateLabel: formatGateDate(gateDates[key])
    })),
    lanes: buildRaceLanes(rows, now.getTime()),
    livestreams: buildBoardLivestreams(
      events.map((event) => ({
        id: event.id,
        title: event.title,
        startsAt: event.startsAt.toISOString(),
        location: event.location,
        status: event.status,
        availability: event.availability,
        capacity: event.capacity,
        attendeeNames: event.attendees.map((attendee) => userDisplayName(attendee.user)).filter(Boolean)
      })),
      window,
      now
    ),
    days: buildBoardDays({
      today: window.today,
      end: window.end,
      schedule: calendars.flatMap((month) => month.schedule),
      entries: calendars.flatMap((month) => month.entries),
      showManagers: Object.assign({}, ...calendars.map((month) => month.showManagers)),
      queued: calendars.flatMap((month) =>
        month.queuedPackages.map((item) => ({
          date: item.date,
          title: item.groupTopic
        }))
      )
    })
  };
}

function monthsBetween(today: string, end: string) {
  const months = new Set<string>();
  for (let date = today; date < end; date = addDaysToDateKey(date, 1)) {
    months.add(date.slice(0, 7));
  }
  return [...months];
}
