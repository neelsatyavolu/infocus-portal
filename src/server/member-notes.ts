import { isExcludedFromGrading, loadNonGradableEmails } from "@/src/lib/gradable-roster";
import {
  MEMBER_NOTE_MAX,
  memberNoteCycleIsAllowed,
  parseMemberNoteCycle
} from "@/src/lib/member-notes";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { ensurePackageProgressDefaults } from "@/src/server/package-progress-data";
import { userDisplayName } from "@/src/lib/user-display";

export type MemberNoteCycle = {
  cycleNumber: number;
  focus: string;
};

export type ProducerMemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  notesByCycle: Record<string, string>;
};

async function requireProducer(email: string | null | undefined) {
  const access = await getPlatformAccess(email);
  if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
    throw new Error("FORBIDDEN");
  }
  return access;
}

export async function listProducerMembers() {
  const [users, notes, cycles, nonGradableEmails] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, nickname: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    }),
    prisma.memberProducerNote.findMany({
      select: { userId: true, cycleNumber: true, notes: true }
    }),
    ensurePackageProgressDefaults(),
    loadNonGradableEmails()
  ]);

  const notesByUser = new Map<string, Record<string, string>>();
  for (const note of notes) {
    const current = notesByUser.get(note.userId) ?? {};
    current[String(note.cycleNumber)] = note.notes;
    notesByUser.set(note.userId, current);
  }

  const members: ProducerMemberRow[] = users
    .filter((user) => !isExcludedFromGrading(user, nonGradableEmails))
    .map((user) => ({
      id: user.id,
      name: userDisplayName(user) || user.name,
      email: user.email,
      notesByCycle: notesByUser.get(user.id) ?? {}
    }));

  return {
    cycles: cycles.map(
      (cycle): MemberNoteCycle => ({
        cycleNumber: cycle.cycleNumber,
        focus: cycle.focus
      })
    ),
    members
  };
}

export async function saveMemberProducerNote(input: {
  actorEmail: string | null | undefined;
  userId: string;
  cycleNumber: unknown;
  notes: string;
}) {
  await requireProducer(input.actorEmail);

  const cycleNumber = parseMemberNoteCycle(input.cycleNumber);
  const notes = input.notes.slice(0, MEMBER_NOTE_MAX);
  const cycles = await ensurePackageProgressDefaults();
  const cycleNumbers = cycles.map((cycle) => cycle.cycleNumber);

  if (!memberNoteCycleIsAllowed(cycleNumber, cycleNumbers)) {
    throw new Error("BAD_REQUEST");
  }

  const [user, nonGradableEmails] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, nickname: true, email: true }
    }),
    loadNonGradableEmails()
  ]);

  if (!user || isExcludedFromGrading(user, nonGradableEmails)) {
    throw new Error("NOT_FOUND");
  }

  const saved = await prisma.memberProducerNote.upsert({
    where: {
      userId_cycleNumber: {
        userId: user.id,
        cycleNumber
      }
    },
    update: { notes },
    create: {
      userId: user.id,
      cycleNumber,
      notes
    },
    select: {
      userId: true,
      cycleNumber: true,
      notes: true
    }
  });

  return saved;
}
