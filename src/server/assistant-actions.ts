import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { PackageCategory } from "@prisma/client";
import { z } from "zod";
import { parseAccountInviteInput } from "@/src/lib/account-invite";
import { sendAccessRequestDecisionEmail, sendAccountInviteEmail } from "@/src/lib/email";
import { exclusiveProducerAssignment } from "@/src/lib/package-producer-assignment";
import { hardcodedPlatformRole, normalizeEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { formatShowDateLabel } from "@/src/lib/show-assignment";
import { NICKNAME_MAX_LENGTH, normalizeNickname, userDisplayName } from "@/src/lib/user-display";
import {
  loadAssignableExecutiveProducers,
  loadAssignableProducers
} from "@/src/server/package-progress-data";
import {
  getAssistantGrades,
  getAssistantGroup,
  listAssistantGroups,
  listAssistantProducedGroups
} from "@/src/server/assistant-lookups";
import { assertValidCycleNumber, setCyclesPerSemester } from "@/src/server/program-settings";
import { setQueuedForAir } from "@/src/server/publishing-queue";
import { listUpcomingShows } from "@/src/server/show-schedule";
import { MAX_PORTFOLIO_POINTS } from "@/src/lib/grading";
import { isExcludedFromGrading, loadNonGradableEmails } from "@/src/lib/gradable-roster";
import { calculateExtensionDays, parseDateInput, sanitizeFreeExtensionDays } from "@/src/lib/extensions";
import { approvedExtensionDaysFor, calculateLatePenalty, effectiveDeadline } from "@/src/lib/package-extensions";
import { MAX_EFFORT_POINTS } from "@/src/lib/package-grades";
import { officialFinalCutPoints } from "@/src/lib/package-review-mail";
import { capAwardedForRevision } from "@/src/lib/package-revisions";

const PROPOSAL_TTL_MS = 10 * 60 * 1000;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export type AssistantActionKind =
  | "add_person"
  | "set_nickname"
  | "add_package"
  | "update_package"
  | "set_cycle_dates"
  | "remove_package"
  | "assign_role"
  | "remove_role"
  | "queue_package"
  | "set_cycles_per_semester"
  | "decide_access"
  | "remove_person"
  | "set_grade"
  | "set_portfolio"
  | "publish_grade";

export type AssistantActionPreview = {
  token: string;
  kind: AssistantActionKind;
  title: string;
  details: Array<{ label: string; value: string }>;
};

type PersonRef = { userId: string; name: string; email: string | null };

const addPersonPayload = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  sendInvite: z.boolean().optional()
});

const setNicknamePayload = z.object({
  userId: z.string().min(1),
  nickname: z.string().trim().max(NICKNAME_MAX_LENGTH)
});

const addPackagePayload = z.object({
  cycleNumber: z.number().int().min(1).max(8),
  topic: z.string().trim().min(1).max(280),
  category: z.nativeEnum(PackageCategory).nullable(),
  memberUserIds: z.array(z.string()).max(20),
  producerUserId: z.string().min(1).nullable()
});

const updatePackagePayload = z.object({
  rowId: z.string().min(1),
  topic: z.string().trim().min(1).max(280).optional(),
  category: z.nativeEnum(PackageCategory).nullable().optional(),
  memberUserIds: z.array(z.string()).max(20).optional(),
  producerUserId: z.string().min(1).nullable().optional()
});

const setCycleDatesPayload = z.object({
  cycleNumber: z.number().int().min(1).max(8),
  focus: z.string().trim().max(180).optional(),
  pitchingDate: z.string().nullable().optional(),
  proofOfContactDate: z.string().nullable().optional(),
  aRollBRollDate: z.string().nullable().optional(),
  initialCutDate: z.string().nullable().optional(),
  finalCutDate: z.string().nullable().optional()
});

const removePackagePayload = z.object({
  rowId: z.string().min(1)
});

const assignRolePayload = z.object({
  email: z.string().email(),
  role: z.enum(["ASSOCIATE_PRODUCER", "EXECUTIVE_PRODUCER", "ADVISER"])
});

const removeRolePayload = z.object({
  email: z.string().email()
});

const queuePackagePayload = z.object({
  rowId: z.string().min(1),
  queued: z.boolean(),
  showDate: z.string().nullable().optional()
});

const setCyclesCountPayload = z.object({
  cyclesPerSemester: z.number().int().min(1).max(8)
});

const decideAccessPayload = z.object({
  requestId: z.string().min(1),
  status: z.enum(["APPROVED", "DENIED"])
});

const removePersonPayload = z.object({
  userId: z.string().min(1)
});

const setGradePayload = z
  .object({
    userId: z.string().min(1),
    cycleNumber: z.number().int().min(1).max(8),
    points: z.number().min(0).max(MAX_EFFORT_POINTS).nullable().optional(),
    ungraded: z.boolean().optional(),
    feedback: z.string().trim().max(2000).optional(),
    turnedInDate: z.string().nullable().optional(),
    publish: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if (value.ungraded) {
      return;
    }
    if (value.points == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "points is required (0–50), or set ungraded." });
    }
  });

export function isClearGradeRequest(args: Record<string, unknown>) {
  if (args.ungraded === true || args.clear === true) {
    return true;
  }
  const raw = args.points ?? args.score;
  if (raw == null || typeof raw === "number") {
    return false;
  }
  const text = String(raw).trim().toLowerCase();
  return text === "ungraded" || text === "dash" || text === "—" || text === "-" || text === "none" || text === "null";
}

const setPortfolioPayload = z.object({
  userId: z.string().min(1),
  points: z.number().int().min(0).max(MAX_PORTFOLIO_POINTS),
  feedback: z.string().trim().max(1200).optional()
});

const publishGradePayload = z.object({
  userId: z.string().min(1),
  cycleNumber: z.number().int().min(1).max(8),
  published: z.boolean()
});

function getAuthSecret() {
  const secret = process.env.APP_AUTH_SECRET || "";
  if (!secret) {
    throw new Error("APP_AUTH_SECRET is required.");
  }
  return secret;
}

function signToken(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getAuthSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyAssistantActionToken(token: string, actorUserId: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    throw new Error("BAD_REQUEST");
  }
  const expected = createHmac("sha256", getAuthSecret()).update(encoded).digest("base64url");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("BAD_REQUEST");
  }
  let parsed: {
    v?: number;
    actorUserId?: string;
    exp?: number;
    kind?: AssistantActionKind;
    payload?: unknown;
    title?: string;
    details?: Array<{ label: string; value: string }>;
  };
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as typeof parsed;
  } catch {
    throw new Error("BAD_REQUEST");
  }
  if (parsed.v !== 1 || parsed.actorUserId !== actorUserId || typeof parsed.exp !== "number" || !parsed.kind) {
    throw new Error("FORBIDDEN");
  }
  if (parsed.exp < Date.now()) {
    throw new Error("This proposal expired. Ask the assistant again.");
  }
  return {
    kind: parsed.kind,
    payload: parsed.payload,
    title: parsed.title ?? "Proposed change",
    details: parsed.details ?? []
  };
}

export function createAssistantActionPreview(
  actorUserId: string,
  kind: AssistantActionKind,
  payload: unknown,
  title: string,
  details: Array<{ label: string; value: string }>
): AssistantActionPreview {
  const token = signToken({
    v: 1,
    actorUserId,
    exp: Date.now() + PROPOSAL_TTL_MS,
    kind,
    payload,
    title,
    details
  });
  return { token, kind, title, details };
}

export function parseRoleInput(value: unknown): "ASSOCIATE_PRODUCER" | "EXECUTIVE_PRODUCER" | "ADVISER" {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (raw === "AP" || raw.includes("ASSOCIATE")) {
    return "ASSOCIATE_PRODUCER";
  }
  if (raw === "EP" || raw.includes("EXECUTIVE")) {
    return "EXECUTIVE_PRODUCER";
  }
  if (raw === "ADVISER" || raw === "ADVISOR") {
    return "ADVISER";
  }
  throw new Error("Role must be associate producer, executive producer, or adviser.");
}

function roleLabel(role: "ASSOCIATE_PRODUCER" | "EXECUTIVE_PRODUCER" | "ADVISER") {
  if (role === "ASSOCIATE_PRODUCER") return "Associate producer";
  if (role === "EXECUTIVE_PRODUCER") return "Executive producer";
  return "Adviser";
}

async function findPackageRow(args: Record<string, unknown>) {
  const id = String(args.packageId ?? args.rowId ?? "").trim();
  if (id) {
    const row = await prisma.packageProgressRow.findUnique({
      where: { id },
      select: {
        id: true,
        cycleNumber: true,
        groupTopic: true,
        queuedForShowDate: true,
        finalCutMediaItemId: true
      }
    });
    if (!row) {
      throw new Error("That package was not found.");
    }
    return row;
  }

  const topic = String(args.topic ?? args.package ?? "").trim();
  if (!topic) {
    throw new Error("Name the package topic.");
  }
  const cycleNumber = args.cycleNumber != null ? Number(args.cycleNumber) : undefined;
  const rows = await prisma.packageProgressRow.findMany({
    where: {
      groupTopic: { contains: topic, mode: "insensitive" },
      ...(Number.isInteger(cycleNumber) ? { cycleNumber } : {})
    },
    select: {
      id: true,
      cycleNumber: true,
      groupTopic: true,
      queuedForShowDate: true,
      finalCutMediaItemId: true
    }
  });
  const exact = rows.filter((row) => row.groupTopic.trim().toLowerCase() === topic.toLowerCase());
  const pool = exact.length > 0 ? exact : rows;
  if (pool.length === 0) {
    throw new Error(`No package matched “${topic}”.`);
  }
  if (pool.length > 1) {
    throw new Error(`Several packages match “${topic}”. Say which cycle.`);
  }
  return pool[0];
}

export function parseCategoryInput(value: unknown): PackageCategory | null {
  if (value == null || value === "") {
    return null;
  }
  const raw = String(value).trim().toUpperCase().replace(/\s+/g, "_");
  if (raw === "NEWS" || raw === "FEATURE" || raw === "COMMENTARY") {
    return raw;
  }
  throw new Error(`Category must be News, Feature, or Commentary (got ${String(value)}).`);
}

export function parseOptionalDate(value: unknown) {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new Error("Dates must be YYYY-MM-DD.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Dates must be YYYY-MM-DD.");
  }
  return value;
}

type DirectoryPerson = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string | null;
};

export function matchPeople(people: DirectoryPerson[], query: string): DirectoryPerson[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const exactEmail = people.filter((person) => (person.email ?? "").toLowerCase() === needle);
  if (exactEmail.length > 0) {
    return exactEmail;
  }
  const exactName = people.filter((person) => {
    const display = userDisplayName(person).toLowerCase();
    const nickname = (person.nickname ?? "").toLowerCase();
    const full = (person.name ?? "").toLowerCase();
    return display === needle || nickname === needle || full === needle;
  });
  if (exactName.length > 0) {
    return exactName;
  }
  return people.filter((person) => {
    const display = userDisplayName(person).toLowerCase();
    const full = (person.name ?? "").toLowerCase();
    const firstDisplay = display.split(/\s+/)[0] ?? "";
    const firstFull = full.split(/\s+/)[0] ?? "";
    return firstDisplay === needle || firstFull === needle || display.includes(needle) || full.includes(needle);
  });
}

function pickOne(people: DirectoryPerson[], query: string, label: string): PersonRef {
  const matches = matchPeople(people, query);
  if (matches.length === 0) {
    throw new Error(`No ${label} matched “${query}”.`);
  }
  if (matches.length > 1) {
    const names = matches.map((person) => userDisplayName(person) || person.email || person.id).join(", ");
    throw new Error(`“${query}” matches more than one ${label}: ${names}. Use an email.`);
  }
  const person = matches[0];
  return {
    userId: person.id,
    name: userDisplayName(person) || person.email || person.id,
    email: person.email
  };
}

async function loadDirectory() {
  return prisma.user.findMany({
    where: { email: { not: null } },
    select: { id: true, name: true, nickname: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }]
  });
}

async function resolveMembers(queries: string[]) {
  const people = await loadDirectory();
  return queries.map((query) => pickOne(people, query, "person"));
}

async function resolveProducer(query: string | null) {
  if (!query?.trim()) {
    return null;
  }
  const [producers, executives] = await Promise.all([loadAssignableProducers(), loadAssignableExecutiveProducers()]);
  const merged: DirectoryPerson[] = [...producers, ...executives].map((person) => ({
    id: person.userId,
    name: person.name,
    nickname: null,
    email: person.email
  }));
  return pickOne(merged, query, "producer");
}

function categoryLabel(category: PackageCategory | null) {
  if (!category) {
    return "None";
  }
  return category.charAt(0) + category.slice(1).toLowerCase();
}

function groupTypeFromCategory(category: PackageCategory | null) {
  if (category === "NEWS") return "News";
  if (category === "FEATURE") return "Feature";
  if (category === "COMMENTARY") return "Commentary";
  return "";
}

function invitedUserIdForEmail(email: string) {
  const digest = createHash("sha256").update(`invited:${email}`).digest("hex").slice(0, 24);
  return `user_${digest}`;
}

export async function listAssistantPeople() {
  const people = await loadDirectory();
  return people.map((person) => ({
    name: userDisplayName(person) || person.email,
    email: person.email,
    nickname: person.nickname
  }));
}

export async function listAssistantPackages(cycleNumber: number) {
  await assertValidCycleNumber(cycleNumber);
  const rows = await prisma.packageProgressRow.findMany({
    where: { cycleNumber },
    orderBy: { rowOrder: "asc" },
    select: {
      id: true,
      groupTopic: true,
      category: true,
      assignedProducer: { select: { name: true, nickname: true, email: true } },
      assignedExecutiveProducer: { select: { name: true, nickname: true, email: true } },
      members: {
        select: { user: { select: { name: true, nickname: true, email: true } } }
      }
    }
  });
  return rows
    .filter((row) => row.groupTopic.trim() || row.members.length > 0)
    .map((row) => ({
      id: row.id,
      topic: row.groupTopic || "(untitled)",
      category: categoryLabel(row.category),
      producer: userDisplayName(row.assignedProducer ?? row.assignedExecutiveProducer ?? {}) || "Unassigned",
      members: row.members.map((member) => userDisplayName(member.user) || member.user.email || "Unknown")
    }));
}

export async function listAssistantCycleDates() {
  const cycles = await prisma.packageCycle.findMany({
    orderBy: { cycleNumber: "asc" }
  });
  return cycles.map((cycle) => ({
    cycleNumber: cycle.cycleNumber,
    focus: cycle.focus,
    pitchingDate: cycle.pitchingDate?.toISOString().slice(0, 10) ?? null,
    proofOfContactDate: cycle.proofOfContactDate?.toISOString().slice(0, 10) ?? null,
    aRollBRollDate: cycle.aRollBRollDate?.toISOString().slice(0, 10) ?? null,
    initialCutDate: cycle.initialCutDate?.toISOString().slice(0, 10) ?? null,
    finalCutDate: cycle.finalCutDate?.toISOString().slice(0, 10) ?? null
  }));
}

export async function listAssistantProducers() {
  const [producers, executives] = await Promise.all([loadAssignableProducers(), loadAssignableExecutiveProducers()]);
  return {
    associates: producers.map((person) => ({
      name: person.name,
      email: person.email,
      category: person.category
    })),
    executives: executives.map((person) => ({
      name: person.name,
      email: person.email
    }))
  };
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

export async function proposeAssistantAction(
  actorUserId: string,
  name: string,
  rawArgs: unknown
): Promise<{ preview?: AssistantActionPreview; error?: string; result?: unknown }> {
  try {
    const args = rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>) : {};

    if (name === "list_people") {
      return { result: { people: await listAssistantPeople() } };
    }
    if (name === "list_packages") {
      const cycleNumber = Number(args.cycleNumber);
      if (!Number.isInteger(cycleNumber)) {
        throw new Error("cycleNumber is required.");
      }
      return { result: { packages: await listAssistantGroups({ cycleNumber, actorUserId }) } };
    }
    if (name === "list_groups") {
      const cycleNumber = args.cycleNumber == null || args.cycleNumber === "" ? undefined : Number(args.cycleNumber);
      if (cycleNumber != null && !Number.isInteger(cycleNumber)) {
        throw new Error("cycleNumber must be a whole number.");
      }
      return { result: { groups: await listAssistantGroups({ cycleNumber, actorUserId }) } };
    }
    if (name === "list_my_groups") {
      const cycleNumber = args.cycleNumber == null || args.cycleNumber === "" ? undefined : Number(args.cycleNumber);
      if (cycleNumber != null && !Number.isInteger(cycleNumber)) {
        throw new Error("cycleNumber must be a whole number.");
      }
      const groups = await listAssistantProducedGroups({ cycleNumber, actorUserId });
      return {
        result: {
          groups,
          note:
            groups.length === 0
              ? "You are not assigned as the producer on any package."
              : "These are packages you produce."
        }
      };
    }
    if (name === "get_group") {
      const topic = String(args.topic ?? args.package ?? "").trim();
      const cycleNumber = args.cycleNumber == null || args.cycleNumber === "" ? undefined : Number(args.cycleNumber);
      if (cycleNumber != null && !Number.isInteger(cycleNumber)) {
        throw new Error("cycleNumber must be a whole number.");
      }
      return {
        result: await getAssistantGroup({ topic, cycleNumber, actorUserId })
      };
    }
    if (name === "get_grades") {
      const query = String(args.person ?? args.name ?? "").trim();
      if (!query) {
        throw new Error("Name the person.");
      }
      const person = pickOne(await loadDirectory(), query, "person");
      return { result: await getAssistantGrades({ person, actorUserId }) };
    }
    if (name === "list_cycle_dates") {
      return { result: { cycles: await listAssistantCycleDates() } };
    }
    if (name === "list_producers") {
      return { result: await listAssistantProducers() };
    }
    if (name === "list_queue") {
      const [queued, upcoming] = await Promise.all([
        prisma.packageProgressRow.findMany({
          where: { queuedForAirAt: { not: null } },
          orderBy: { queuedForShowDate: "asc" },
          select: {
            groupTopic: true,
            cycleNumber: true,
            queuedForShowDate: true
          }
        }),
        listUpcomingShows(8)
      ]);
      return {
        result: {
          queued: queued.map((row) => ({
            topic: row.groupTopic,
            cycle: row.cycleNumber,
            show: row.queuedForShowDate
          })),
          upcomingShows: upcoming
        }
      };
    }
    if (name === "list_access_requests") {
      const pending = await prisma.platformAccessRequest.findMany({
        where: { status: "PENDING" },
        orderBy: { requestedAt: "asc" },
        select: { id: true, email: true, name: true, requestedAt: true }
      });
      return {
        result: {
          pending: pending.map((entry) => ({
            name: entry.name,
            email: entry.email,
            requestedAt: entry.requestedAt.toISOString()
          }))
        }
      };
    }

    if (name === "propose_add_person") {
      const parsed = addPersonPayload.parse({
        name: args.name,
        email: normalizeEmail(String(args.email ?? "")),
        sendInvite: args.sendInvite !== false
      });
      parseAccountInviteInput(parsed.email, parsed.name);
      return {
        preview: createAssistantActionPreview(actorUserId, "add_person", parsed, "Add person", [
          { label: "Name", value: parsed.name },
          { label: "Email", value: parsed.email },
          { label: "Invite email", value: parsed.sendInvite === false ? "No" : "Yes" }
        ]),
        result: { ok: true, waitingForApproval: true }
      };
    }

    if (name === "propose_set_nickname") {
      const query = String(args.person ?? args.email ?? args.userId ?? "").trim();
      const people = await loadDirectory();
      const person = pickOne(people, query, "person");
      const nickname = normalizeNickname(String(args.nickname ?? "")) ?? "";
      const parsed = setNicknamePayload.parse({ userId: person.userId, nickname });
      return {
        preview: createAssistantActionPreview(actorUserId, "set_nickname", parsed, "Set nickname", [
          { label: "Person", value: person.email ? `${person.name} (${person.email})` : person.name },
          { label: "Nickname", value: parsed.nickname || "(clear)" }
        ]),
        result: { ok: true, waitingForApproval: true }
      };
    }

    if (name === "propose_add_package") {
      const cycleNumber = Number(args.cycleNumber);
      await assertValidCycleNumber(cycleNumber);
      const topic = String(args.topic ?? "").trim();
      const category = parseCategoryInput(args.category);
      const members = await resolveMembers(stringList(args.members));
      const producer = await resolveProducer(typeof args.producer === "string" ? args.producer : null);
      const parsed = addPackagePayload.parse({
        cycleNumber,
        topic,
        category,
        memberUserIds: members.map((member) => member.userId),
        producerUserId: producer?.userId ?? null
      });
      return {
        preview: createAssistantActionPreview(actorUserId, "add_package", parsed, `Add package to Cycle ${cycleNumber}`, [
          { label: "Topic", value: parsed.topic },
          { label: "Category", value: categoryLabel(parsed.category) },
          { label: "Members", value: members.length ? members.map((member) => member.name).join(", ") : "None yet" },
          { label: "Producer", value: producer?.name ?? "Unassigned" }
        ]),
        result: { ok: true, waitingForApproval: true }
      };
    }

    if (name === "propose_update_package") {
      const found = await findPackageRow(args);
      const row = await prisma.packageProgressRow.findUnique({
        where: { id: found.id },
        select: {
          id: true,
          cycleNumber: true,
          groupTopic: true,
          category: true,
          members: { select: { user: { select: { name: true, nickname: true, email: true } } } }
        }
      });
      if (!row) {
        throw new Error("That package was not found.");
      }
      const topic = args.newTopic != null ? String(args.newTopic).trim() : undefined;
      const category = args.category !== undefined ? parseCategoryInput(args.category) : undefined;
      const members = args.members !== undefined ? await resolveMembers(stringList(args.members)) : undefined;
      const producer =
        args.producer !== undefined
          ? await resolveProducer(args.producer === null ? null : String(args.producer))
          : undefined;
      const parsed = updatePackagePayload.parse({
        rowId: row.id,
        topic,
        category,
        memberUserIds: members?.map((member) => member.userId),
        producerUserId: producer === undefined ? undefined : producer?.userId ?? null
      });
      const details: Array<{ label: string; value: string }> = [
        { label: "Package", value: row.groupTopic || row.id },
        { label: "Cycle", value: String(row.cycleNumber) }
      ];
      if (parsed.topic) details.push({ label: "Topic", value: parsed.topic });
      if (parsed.category !== undefined) details.push({ label: "Category", value: categoryLabel(parsed.category) });
      if (members) details.push({ label: "Members", value: members.map((member) => member.name).join(", ") || "None" });
      if (producer !== undefined) details.push({ label: "Producer", value: producer?.name ?? "Unassigned" });
      return {
        preview: createAssistantActionPreview(actorUserId, "update_package", parsed, "Update package", details),
        result: { ok: true, waitingForApproval: true }
      };
    }

    if (name === "propose_set_cycle_dates") {
      const cycleNumber = Number(args.cycleNumber);
      await assertValidCycleNumber(cycleNumber);
      const parsed = setCycleDatesPayload.parse({
        cycleNumber,
        focus: args.focus,
        pitchingDate: args.pitchingDate === undefined ? undefined : parseOptionalDate(args.pitchingDate),
        proofOfContactDate:
          args.proofOfContactDate === undefined ? undefined : parseOptionalDate(args.proofOfContactDate),
        aRollBRollDate: args.aRollBRollDate === undefined ? undefined : parseOptionalDate(args.aRollBRollDate),
        initialCutDate: args.initialCutDate === undefined ? undefined : parseOptionalDate(args.initialCutDate),
        finalCutDate: args.finalCutDate === undefined ? undefined : parseOptionalDate(args.finalCutDate)
      });
      const details: Array<{ label: string; value: string }> = [{ label: "Cycle", value: String(parsed.cycleNumber) }];
      if (parsed.focus !== undefined) details.push({ label: "Focus", value: parsed.focus || "(clear)" });
      if (parsed.pitchingDate !== undefined) details.push({ label: "Pitching", value: parsed.pitchingDate || "(clear)" });
      if (parsed.proofOfContactDate !== undefined) {
        details.push({ label: "Proof of contact", value: parsed.proofOfContactDate || "(clear)" });
      }
      if (parsed.aRollBRollDate !== undefined) details.push({ label: "A-roll/B-roll", value: parsed.aRollBRollDate || "(clear)" });
      if (parsed.initialCutDate !== undefined) details.push({ label: "Initial cut", value: parsed.initialCutDate || "(clear)" });
      if (parsed.finalCutDate !== undefined) details.push({ label: "Final cut", value: parsed.finalCutDate || "(clear)" });
      if (details.length === 1) {
        throw new Error("Provide at least one date or a focus to change.");
      }
      return {
        preview: createAssistantActionPreview(
          actorUserId,
          "set_cycle_dates",
          parsed,
          `Update Cycle ${parsed.cycleNumber} dates`,
          details
        ),
        result: { ok: true, waitingForApproval: true }
      };
    }

    if (name === "propose_remove_package") {
      const row = await findPackageRow(args);
      const parsed = removePackagePayload.parse({ rowId: row.id });
      return {
        preview: createAssistantActionPreview(actorUserId, "remove_package", parsed, "Remove package", [
          { label: "Package", value: row.groupTopic || "Untitled" },
          { label: "Cycle", value: String(row.cycleNumber) }
        ]),
        result: { ok: true, waitingForApproval: true }
      };
    }

    if (name === "propose_assign_role") {
      const people = await loadDirectory();
      const person = pickOne(people, String(args.person ?? args.email ?? ""), "person");
      if (!person.email) {
        throw new Error("That person has no email, so a role cannot be assigned.");
      }
      if (hardcodedPlatformRole(person.email)) {
        throw new Error("That account’s role is fixed.");
      }
      const role = parseRoleInput(args.role);
      const parsed = assignRolePayload.parse({ email: person.email, role });
      return {
        preview: createAssistantActionPreview(actorUserId, "assign_role", parsed, "Set producer role", [
          { label: "Person", value: `${person.name} (${person.email})` },
          { label: "Role", value: roleLabel(role) }
        ]),
        result: { ok: true, waitingForApproval: true }
      };
    }

    if (name === "propose_remove_role") {
      const people = await loadDirectory();
      const person = pickOne(people, String(args.person ?? args.email ?? ""), "person");
      if (!person.email) {
        throw new Error("That person has no email.");
      }
      if (hardcodedPlatformRole(person.email)) {
        throw new Error("That account’s role is fixed.");
      }
      const parsed = removeRolePayload.parse({ email: person.email });
      return {
        preview: createAssistantActionPreview(actorUserId, "remove_role", parsed, "Remove producer role", [
          { label: "Person", value: `${person.name} (${person.email})` }
        ]),
        result: { ok: true, waitingForApproval: true }
      };
    }

    if (name === "propose_queue_package") {
      const row = await findPackageRow(args);
      const queued = args.queued !== false && String(args.action ?? "queue").toLowerCase() !== "unqueue";
      const showDate =
        args.showDate === undefined || args.showDate === null || args.showDate === ""
          ? null
          : parseOptionalDate(args.showDate);
      const parsed = queuePackagePayload.parse({
        rowId: row.id,
        queued,
        showDate
      });
      const details = [
        { label: "Package", value: row.groupTopic || "Untitled" },
        { label: "Action", value: queued ? "Send to publishing queue" : "Remove from queue" }
      ];
      if (queued && showDate) {
        details.push({ label: "Show", value: formatShowDateLabel(showDate) });
      } else if (queued) {
        details.push({ label: "Show", value: "Next empty show" });
      }
      return {
        preview: createAssistantActionPreview(
          actorUserId,
          "queue_package",
          parsed,
          queued ? "Send to publishing queue" : "Remove from queue",
          details
        ),
        result: { ok: true, waitingForApproval: true }
      };
    }

    if (name === "propose_set_cycles_per_semester") {
      const parsed = setCyclesCountPayload.parse({ cyclesPerSemester: Number(args.count ?? args.cyclesPerSemester) });
      return {
        preview: createAssistantActionPreview(
          actorUserId,
          "set_cycles_per_semester",
          parsed,
          "Set cycles per semester",
          [{ label: "Cycles", value: String(parsed.cyclesPerSemester) }]
        ),
        result: { ok: true, waitingForApproval: true }
      };
    }

    if (name === "propose_decide_access") {
      const query = String(args.person ?? args.email ?? "").trim();
      const status = String(args.status ?? args.decision ?? "APPROVED").toUpperCase();
      if (status !== "APPROVED" && status !== "DENIED") {
        throw new Error("Say approve or deny.");
      }
      const pending = await prisma.platformAccessRequest.findMany({
        where: { status: "PENDING" },
        orderBy: { requestedAt: "asc" }
      });
      const match = pending.filter((entry) => {
        const email = entry.email.toLowerCase();
        const name = (entry.name ?? "").toLowerCase();
        const needle = query.toLowerCase();
        return email === needle || email.includes(needle) || name.includes(needle);
      });
      if (match.length === 0) {
        throw new Error(query ? `No pending request matched “${query}”.` : "No pending access requests.");
      }
      if (match.length > 1 && query) {
        throw new Error(`Several pending requests match “${query}”. Use the email.`);
      }
      const entry = match[0];
      const parsed = decideAccessPayload.parse({ requestId: entry.id, status });
      return {
        preview: createAssistantActionPreview(
          actorUserId,
          "decide_access",
          parsed,
          status === "APPROVED" ? "Approve access request" : "Deny access request",
          [
            { label: "Person", value: entry.name ? `${entry.name} (${entry.email})` : entry.email },
            { label: "Decision", value: status === "APPROVED" ? "Approve and let them sign in" : "Deny" }
          ]
        ),
        result: { ok: true, waitingForApproval: true }
      };
    }

    if (name === "propose_set_grade") {
      const query = String(args.person ?? args.name ?? "").trim();
      const cycleNumber = Number(args.cycleNumber ?? args.cycle);
      if (!query) {
        throw new Error("Name the person.");
      }
      if (!Number.isInteger(cycleNumber)) {
        throw new Error("cycleNumber is required.");
      }
      const ungraded = isClearGradeRequest(args);
      const points = ungraded ? null : Number(args.points ?? args.score);
      if (!ungraded && !Number.isFinite(points)) {
        throw new Error("points is required (0–50), or set ungraded.");
      }
      const person = pickOne(await loadDirectory(), query, "person");
      const parsed = setGradePayload.parse({
        userId: person.userId,
        cycleNumber,
        points,
        ungraded,
        feedback: ungraded ? undefined : args.feedback,
        turnedInDate: ungraded
          ? undefined
          : args.turnedInDate === undefined
            ? undefined
            : parseOptionalDate(args.turnedInDate),
        publish: ungraded ? false : args.publish
      });
      return {
        preview: createAssistantActionPreview(
          actorUserId,
          "set_grade",
          parsed,
          parsed.ungraded ? "Clear package grade" : "Set package grade",
          [
            { label: "Person", value: person.name },
            { label: "Cycle", value: String(parsed.cycleNumber) },
            { label: "Quality", value: parsed.ungraded ? "Ungraded (—)" : `${parsed.points}/50` },
            ...(parsed.feedback ? [{ label: "Feedback", value: parsed.feedback }] : []),
            ...(parsed.turnedInDate ? [{ label: "Turned in", value: parsed.turnedInDate }] : []),
            ...(parsed.publish ? [{ label: "Publish", value: "Yes" }] : [])
          ]
        )
      };
    }
    if (name === "propose_set_portfolio") {
      const query = String(args.person ?? args.name ?? "").trim();
      const points = Number(args.points ?? args.score);
      if (!query) {
        throw new Error("Name the person.");
      }
      if (!Number.isFinite(points)) {
        throw new Error("points is required (0–100).");
      }
      const person = pickOne(await loadDirectory(), query, "person");
      const parsed = setPortfolioPayload.parse({
        userId: person.userId,
        points,
        feedback: args.feedback
      });
      return {
        preview: createAssistantActionPreview(actorUserId, "set_portfolio", parsed, "Set portfolio grade", [
          { label: "Person", value: person.name },
          { label: "Portfolio", value: `${parsed.points}/100` },
          ...(parsed.feedback ? [{ label: "Feedback", value: parsed.feedback }] : [])
        ])
      };
    }
    if (name === "propose_publish_grade") {
      const query = String(args.person ?? args.name ?? "").trim();
      const cycleNumber = Number(args.cycleNumber ?? args.cycle);
      if (!query) {
        throw new Error("Name the person.");
      }
      if (!Number.isInteger(cycleNumber)) {
        throw new Error("cycleNumber is required.");
      }
      const person = pickOne(await loadDirectory(), query, "person");
      const parsed = publishGradePayload.parse({
        userId: person.userId,
        cycleNumber,
        published: args.published !== false && args.publish !== false
      });
      return {
        preview: createAssistantActionPreview(actorUserId, "publish_grade", parsed, parsed.published ? "Publish grade" : "Unpublish grade", [
          { label: "Person", value: person.name },
          { label: "Cycle", value: String(parsed.cycleNumber) },
          { label: "Published", value: parsed.published ? "Yes" : "No" }
        ])
      };
    }
    if (name === "propose_remove_person") {
      const people = await loadDirectory();
      const person = pickOne(people, String(args.person ?? args.email ?? ""), "person");
      if (person.userId === actorUserId) {
        throw new Error("You can't remove your own account.");
      }
      if (hardcodedPlatformRole(person.email)) {
        throw new Error("That account can't be removed from here.");
      }
      const parsed = removePersonPayload.parse({ userId: person.userId });
      return {
        preview: createAssistantActionPreview(actorUserId, "remove_person", parsed, "Remove person", [
          { label: "Person", value: person.email ? `${person.name} (${person.email})` : person.name },
          { label: "Effect", value: "They will no longer be able to sign in" }
        ]),
        result: { ok: true, waitingForApproval: true }
      };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build that change.";
    return { error: message };
  }
}

async function assignProducerIds(producerUserId: string | null) {
  if (!producerUserId) {
    return exclusiveProducerAssignment(null, null, []);
  }
  const [producers, executives] = await Promise.all([loadAssignableProducers(), loadAssignableExecutiveProducers()]);
  const assignable = [...producers, ...executives];
  const person = assignable.find((entry) => entry.userId === producerUserId);
  if (!person) {
    throw new Error("That producer is not assignable.");
  }
  return exclusiveProducerAssignment(person.userId, person, executives.map((entry) => entry.userId));
}

function toDate(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  return new Date(`${value}T00:00:00.000Z`);
}

export async function executeAssistantAction(params: {
  actorUserId: string;
  actorEmail?: string | null;
  token: string;
  appBaseUrl: string;
  inviterName: string;
}) {
  const verified = verifyAssistantActionToken(params.token, params.actorUserId);

  if (verified.kind === "add_person") {
    const payload = addPersonPayload.parse(verified.payload);
    const [entry] = parseAccountInviteInput(payload.email, payload.name);
    const existing = await prisma.user.findFirst({
      where: { email: entry.email },
      orderBy: { createdAt: "asc" }
    });
    const nickname = normalizeNickname(entry.name);
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: entry.name ?? existing.name,
            ...(existing.nickname || !nickname ? {} : { nickname })
          },
          select: { email: true, name: true }
        })
      : await prisma.user.create({
          data: {
            id: invitedUserIdForEmail(entry.email),
            email: entry.email,
            name: entry.name,
            nickname
          },
          select: { email: true, name: true }
        });
    if (payload.sendInvite !== false && user.email) {
      await sendAccountInviteEmail({
        recipients: [user.email],
        signInUrl: `${params.appBaseUrl.replace(/\/$/, "")}/sign-in`,
        recipientName: user.name,
        inviterName: params.inviterName
      });
    }
    return { message: `${payload.name} can sign in.` };
  }

  if (verified.kind === "set_nickname") {
    const payload = setNicknamePayload.parse(verified.payload);
    const updated = await prisma.user.update({
      where: { id: payload.userId },
      data: { nickname: payload.nickname || null },
      select: { name: true, nickname: true, email: true }
    });
    return { message: `Nickname for ${userDisplayName(updated) || updated.email} is now ${updated.nickname || "cleared"}.` };
  }

  if (verified.kind === "add_package") {
    const payload = addPackagePayload.parse(verified.payload);
    await assertValidCycleNumber(payload.cycleNumber);
    const assignment = await assignProducerIds(payload.producerUserId);
    const empty = await prisma.packageProgressRow.findFirst({
      where: {
        cycleNumber: payload.cycleNumber,
        groupTopic: "",
        members: { none: {} }
      },
      orderBy: { rowOrder: "asc" },
      select: { id: true }
    });
    const data = {
      groupTopic: payload.topic,
      groupType: groupTypeFromCategory(payload.category),
      category: payload.category,
      assignedProducerUserId: assignment.assignedProducerUserId,
      assignedExecutiveProducerUserId: assignment.assignedExecutiveProducerUserId
    };
    const saved = empty
      ? await prisma.packageProgressRow.update({ where: { id: empty.id }, data })
      : await prisma.packageProgressRow.create({
          data: {
            cycleNumber: payload.cycleNumber,
            rowOrder: ((
              await prisma.packageProgressRow.aggregate({
                where: { cycleNumber: payload.cycleNumber },
                _max: { rowOrder: true }
              })
            )._max.rowOrder ?? -1) + 1,
            groupMembers: "",
            ...data
          }
        });
    if (payload.memberUserIds.length > 0) {
      await prisma.packageProgressMember.createMany({
        data: payload.memberUserIds.map((userId) => ({ rowId: saved.id, userId })),
        skipDuplicates: true
      });
    }
    return { message: `Added “${payload.topic}” to Cycle ${payload.cycleNumber}.` };
  }

  if (verified.kind === "update_package") {
    const payload = updatePackagePayload.parse(verified.payload);
    const existing = await prisma.packageProgressRow.findUnique({
      where: { id: payload.rowId },
      select: { id: true, groupTopic: true }
    });
    if (!existing) {
      throw new Error("NOT_FOUND");
    }
    const data: {
      groupTopic?: string;
      groupType?: string;
      category?: PackageCategory | null;
      assignedProducerUserId?: string | null;
      assignedExecutiveProducerUserId?: string | null;
    } = {};
    if (payload.topic) {
      data.groupTopic = payload.topic;
    }
    if (payload.category !== undefined) {
      data.category = payload.category;
      data.groupType = groupTypeFromCategory(payload.category);
    }
    if (payload.producerUserId !== undefined) {
      const assignment = await assignProducerIds(payload.producerUserId);
      data.assignedProducerUserId = assignment.assignedProducerUserId;
      data.assignedExecutiveProducerUserId = assignment.assignedExecutiveProducerUserId;
    }
    if (Object.keys(data).length > 0) {
      await prisma.packageProgressRow.update({ where: { id: payload.rowId }, data });
    }
    if (payload.memberUserIds) {
      await prisma.packageProgressMember.deleteMany({
        where: {
          rowId: payload.rowId,
          ...(payload.memberUserIds.length > 0 ? { userId: { notIn: payload.memberUserIds } } : {})
        }
      });
      if (payload.memberUserIds.length > 0) {
        await prisma.packageProgressMember.createMany({
          data: payload.memberUserIds.map((userId) => ({ rowId: payload.rowId, userId })),
          skipDuplicates: true
        });
      }
    }
    return { message: `Updated ${payload.topic || existing.groupTopic || "the package"}.` };
  }

  if (verified.kind === "set_cycle_dates") {
    const payload = setCycleDatesPayload.parse(verified.payload);
    await assertValidCycleNumber(payload.cycleNumber);
    await prisma.packageCycle.upsert({
      where: { cycleNumber: payload.cycleNumber },
      create: {
        cycleNumber: payload.cycleNumber,
        focus: payload.focus ?? "",
        pitchingDate: toDate(payload.pitchingDate) ?? null,
        proofOfContactDate: toDate(payload.proofOfContactDate) ?? null,
        aRollBRollDate: toDate(payload.aRollBRollDate) ?? null,
        initialCutDate: toDate(payload.initialCutDate) ?? null,
        finalCutDate: toDate(payload.finalCutDate) ?? null
      },
      update: {
        ...(payload.focus !== undefined ? { focus: payload.focus } : {}),
        ...(payload.pitchingDate !== undefined ? { pitchingDate: toDate(payload.pitchingDate) ?? null } : {}),
        ...(payload.proofOfContactDate !== undefined
          ? { proofOfContactDate: toDate(payload.proofOfContactDate) ?? null }
          : {}),
        ...(payload.aRollBRollDate !== undefined ? { aRollBRollDate: toDate(payload.aRollBRollDate) ?? null } : {}),
        ...(payload.initialCutDate !== undefined ? { initialCutDate: toDate(payload.initialCutDate) ?? null } : {}),
        ...(payload.finalCutDate !== undefined ? { finalCutDate: toDate(payload.finalCutDate) ?? null } : {})
      }
    });
    return { message: `Cycle ${payload.cycleNumber} dates saved.` };
  }

  if (verified.kind === "remove_package") {
    const payload = removePackagePayload.parse(verified.payload);
    const row = await prisma.packageProgressRow.findUnique({
      where: { id: payload.rowId },
      select: { groupTopic: true, cycleNumber: true }
    });
    if (!row) {
      throw new Error("NOT_FOUND");
    }
    await prisma.packageProgressRow.delete({ where: { id: payload.rowId } });
    return { message: `Removed “${row.groupTopic || "Untitled"}” from Cycle ${row.cycleNumber}.` };
  }

  if (verified.kind === "assign_role") {
    const payload = assignRolePayload.parse(verified.payload);
    if (hardcodedPlatformRole(payload.email)) {
      throw new Error("That account’s role is fixed.");
    }
    await prisma.platformRoleAssignment.upsert({
      where: { email: payload.email },
      update: { role: payload.role, category: null },
      create: { email: payload.email, role: payload.role, category: null }
    });
    return { message: `${payload.email} is now ${roleLabel(payload.role).toLowerCase()}.` };
  }

  if (verified.kind === "remove_role") {
    const payload = removeRolePayload.parse(verified.payload);
    if (hardcodedPlatformRole(payload.email)) {
      throw new Error("That account’s role is fixed.");
    }
    await prisma.platformRoleAssignment.deleteMany({ where: { email: payload.email } });
    return { message: `Removed the producer role from ${payload.email}.` };
  }

  if (verified.kind === "queue_package") {
    const payload = queuePackagePayload.parse(verified.payload);
    const row = await setQueuedForAir(payload.rowId, payload.queued, payload.showDate);
    if (!payload.queued) {
      return { message: "Removed from the publishing queue." };
    }
    const show = row.queuedForShowDate ? formatShowDateLabel(row.queuedForShowDate) : "a show";
    return { message: `Queued for ${show}.` };
  }

  if (verified.kind === "set_cycles_per_semester") {
    const payload = setCyclesCountPayload.parse(verified.payload);
    const settings = await setCyclesPerSemester(payload.cyclesPerSemester);
    return { message: `Each semester now has ${settings.cyclesPerSemester} package cycles.` };
  }

  if (verified.kind === "decide_access") {
    const payload = decideAccessPayload.parse(verified.payload);
    const existing = await prisma.platformAccessRequest.findUnique({ where: { id: payload.requestId } });
    if (!existing || existing.status !== "PENDING") {
      throw new Error("That access request is no longer pending.");
    }
    const decidedByEmail = normalizeEmail(params.actorEmail) || null;
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.platformAccessRequest.update({
        where: { id: payload.requestId },
        data: {
          status: payload.status,
          decidedAt: new Date(),
          decidedByEmail
        }
      });
      if (payload.status === "APPROVED") {
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
              id: `pending_${randomUUID()}`,
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
      signInUrl: `${params.appBaseUrl.replace(/\/$/, "")}/sign-in`,
      recipientName: updated.name,
      decidedByName: params.inviterName
    });
    return {
      message:
        payload.status === "APPROVED"
          ? `${updated.email} can sign in.`
          : `Denied access for ${updated.email}.`
    };
  }

  if (verified.kind === "remove_person") {
    const payload = removePersonPayload.parse(verified.payload);
    if (payload.userId === params.actorUserId) {
      throw new Error("You can't remove your own account.");
    }
    const existing = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, nickname: true }
    });
    if (!existing) {
      throw new Error("NOT_FOUND");
    }
    if (hardcodedPlatformRole(existing.email)) {
      throw new Error("That account can't be removed from here.");
    }
    await prisma.$transaction(async (tx) => {
      if (existing.email) {
        await tx.platformRoleAssignment.deleteMany({ where: { email: existing.email } });
      }
      await tx.user.delete({ where: { id: existing.id } });
    });
    return { message: `Removed ${userDisplayName(existing) || existing.email || "that person"}.` };
  }

  if (verified.kind === "set_grade") {
    const payload = setGradePayload.parse(verified.payload);
    const target = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, nickname: true, email: true }
    });
    if (!target) {
      throw new Error("NOT_FOUND");
    }
    const nonGradableEmails = await loadNonGradableEmails();
    if (isExcludedFromGrading(target, nonGradableEmails)) {
      throw new Error("That person is not on the gradebook.");
    }
    await assertValidCycleNumber(payload.cycleNumber);
    if (payload.ungraded || payload.points == null) {
      await prisma.packageGrade.deleteMany({
        where: { cycleNumber: payload.cycleNumber, userId: payload.userId }
      });
      return {
        message: `Cleared ${userDisplayName(target)} Cycle ${payload.cycleNumber} to ungraded.`
      };
    }
    const existing = await prisma.packageGrade.findUnique({
      where: { cycleNumber_userId: { cycleNumber: payload.cycleNumber, userId: payload.userId } }
    });
    const turnedInDate =
      payload.turnedInDate === undefined ? (existing?.turnedInDate ?? null) : parseDateInput(payload.turnedInDate);
    const cycle = await prisma.packageCycle.findUnique({
      where: { cycleNumber: payload.cycleNumber },
      select: { finalCutDate: true }
    });
    const nextRevisionCount =
      existing?.awardedFinalCutPoints != null
        ? Math.max(existing.revisionCount, 1) + (existing.awardedFinalCutPoints !== payload.points ? 1 : 0)
        : 1;
    const cappedAwarded = capAwardedForRevision(payload.points, nextRevisionCount);
    const progressRow = await prisma.packageProgressRow.findFirst({
      where: { cycleNumber: payload.cycleNumber, members: { some: { userId: payload.userId } } },
      select: {
        extension: true,
        extensionRequests: { where: { status: "APPROVED" }, select: { requestedDays: true, grantedDays: true, grantedUserIds: true } }
      }
    });
    const approvedDays = approvedExtensionDaysFor(progressRow, payload.userId);
    const deadline = effectiveDeadline(cycle?.finalCutDate ?? null, approvedDays);
    const late = calculateLatePenalty(deadline, turnedInDate);
    const officialPoints = officialFinalCutPoints(cappedAwarded, late.penaltyMultiplier);
    const calculatedDays = turnedInDate ? calculateExtensionDays(cycle?.finalCutDate ?? null, turnedInDate) : 0;
    const turnedInChanged = (existing?.turnedInDate?.toISOString().slice(0, 10) ?? null) !== (turnedInDate?.toISOString().slice(0, 10) ?? null);
    const nextFeedback = payload.feedback ?? existing?.feedback ?? "";
    await prisma.packageGrade.upsert({
      where: { cycleNumber_userId: { cycleNumber: payload.cycleNumber, userId: payload.userId } },
      update: {
        effortPoints: Math.round(cappedAwarded),
        teamworkPoints: 0,
        awardedFinalCutPoints: cappedAwarded,
        finalCutPoints: officialPoints,
        revisionCount: nextRevisionCount,
        feedback: nextFeedback,
        turnedInDate,
        ...(turnedInChanged
          ? {
              extensionDaysApplied: calculatedDays,
              extensionExempt: false,
              freeExtensionDays: sanitizeFreeExtensionDays(existing?.freeExtensionDays ?? 0)
            }
          : {}),
        ...(payload.publish ? { publishedAt: new Date() } : {})
      },
      create: {
        cycleNumber: payload.cycleNumber,
        userId: payload.userId,
        effortPoints: Math.round(cappedAwarded),
        teamworkPoints: 0,
        awardedFinalCutPoints: cappedAwarded,
        finalCutPoints: officialPoints,
        revisionCount: nextRevisionCount,
        feedback: nextFeedback,
        turnedInDate,
        extensionDaysApplied: calculatedDays,
        freeExtensionDays: 0,
        extensionExempt: false,
        publishedAt: payload.publish ? new Date() : null
      }
    });
    return {
      message: payload.publish
        ? `Set ${userDisplayName(target)} Cycle ${payload.cycleNumber} to ${cappedAwarded}/50 and published it.`
        : `Set ${userDisplayName(target)} Cycle ${payload.cycleNumber} to ${cappedAwarded}/50.`
    };
  }

  if (verified.kind === "set_portfolio") {
    const payload = setPortfolioPayload.parse(verified.payload);
    const target = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, nickname: true, email: true }
    });
    if (!target) {
      throw new Error("NOT_FOUND");
    }
    const nonGradableEmails = await loadNonGradableEmails();
    if (isExcludedFromGrading(target, nonGradableEmails)) {
      throw new Error("That person is not on the gradebook.");
    }
    await prisma.portfolioGrade.upsert({
      where: { userId: payload.userId },
      update: { points: payload.points, feedback: payload.feedback ?? "" },
      create: { userId: payload.userId, points: payload.points, feedback: payload.feedback ?? "" }
    });
    return { message: `Set ${userDisplayName(target)} portfolio to ${payload.points}/100.` };
  }

  if (verified.kind === "publish_grade") {
    const payload = publishGradePayload.parse(verified.payload);
    const target = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, nickname: true, email: true }
    });
    if (!target) {
      throw new Error("NOT_FOUND");
    }
    await prisma.packageGrade.upsert({
      where: { cycleNumber_userId: { cycleNumber: payload.cycleNumber, userId: payload.userId } },
      update: { publishedAt: payload.published ? new Date() : null },
      create: {
        cycleNumber: payload.cycleNumber,
        userId: payload.userId,
        effortPoints: 0,
        teamworkPoints: 0,
        publishedAt: payload.published ? new Date() : null
      }
    });
    return {
      message: payload.published
        ? `Published ${userDisplayName(target)} Cycle ${payload.cycleNumber}.`
        : `Unpublished ${userDisplayName(target)} Cycle ${payload.cycleNumber}.`
    };
  }

  throw new Error("BAD_REQUEST");
}

export const ASSISTANT_ADMIN_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_people",
      description: "List Portal people (name, nickname, email) before adding someone or setting a nickname.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "list_packages",
      description: "List packages in one cycle: topic, members, producer, current stage, and status.",
      parameters: {
        type: "object",
        properties: { cycleNumber: { type: "integer", description: "Package cycle number, e.g. 1" } },
        required: ["cycleNumber"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "list_groups",
      description: "List Groups packages with current stage and status. Omit cycleNumber to list every cycle.",
      parameters: {
        type: "object",
        properties: { cycleNumber: { type: "integer", description: "Optional cycle number" } },
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "list_my_groups",
      description:
        "Packages this signed-in producer is assigned to produce. Use when they ask what they are assigned to, which groups they manage, or to check in on their packages. Returns topic, members, current stage, status, and noteCount. For comments, uploads, and stage notes on one package, call get_group.",
      parameters: {
        type: "object",
        properties: { cycleNumber: { type: "integer", description: "Optional cycle number" } },
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "get_group",
      description:
        "Look up one package by topic: members, producer, current stage, each stage's status, comments and notes (including approval notes and clip notes), uploads, proof of contact, and player comments on the cuts.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Package topic" },
          cycleNumber: { type: "integer" }
        },
        required: ["topic"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "get_grades",
      description: "Look up one student's grade: letter, percent, per-cycle final cut and check-ins, livestream, participation, portfolio.",
      parameters: {
        type: "object",
        properties: { person: { type: "string", description: "Name, nickname, or email" } },
        required: ["person"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "list_cycle_dates",
      description: "List pitching / contact / a-roll / initial / final dates for each cycle.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "list_producers",
      description: "List assignable associate and executive producers.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "list_queue",
      description: "List packages on the publishing queue and upcoming show dates.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "list_access_requests",
      description: "List people waiting for Portal access.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_add_person",
      description: "Propose adding a Portal account. Does not save until the user approves the card.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          sendInvite: { type: "boolean" }
        },
        required: ["name", "email"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_set_nickname",
      description: "Propose a nickname for an existing person. Does not save until approved.",
      parameters: {
        type: "object",
        properties: {
          person: { type: "string", description: "Name, nickname, or email" },
          nickname: { type: "string" }
        },
        required: ["person", "nickname"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_add_package",
      description: "Propose adding a package to a cycle. Does not save until approved.",
      parameters: {
        type: "object",
        properties: {
          cycleNumber: { type: "integer" },
          topic: { type: "string" },
          category: { type: "string", description: "News, Feature, or Commentary" },
          members: { type: "array", items: { type: "string" }, description: "Names or emails" },
          producer: { type: "string", description: "Assigned producer name or email" }
        },
        required: ["cycleNumber", "topic"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_update_package",
      description: "Propose changing a package topic, category, members, or producer. Name the package topic (and cycle if needed).",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Current package topic to find" },
          cycleNumber: { type: "integer" },
          packageId: { type: "string" },
          category: { type: "string" },
          members: { type: "array", items: { type: "string" } },
          producer: { type: "string" },
          newTopic: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_set_cycle_dates",
      description: "Propose changing cycle stage dates (YYYY-MM-DD) or focus. Omit fields you are not changing.",
      parameters: {
        type: "object",
        properties: {
          cycleNumber: { type: "integer" },
          focus: { type: "string" },
          pitchingDate: { type: "string" },
          proofOfContactDate: { type: "string" },
          aRollBRollDate: { type: "string" },
          initialCutDate: { type: "string" },
          finalCutDate: { type: "string" }
        },
        required: ["cycleNumber"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_remove_package",
      description: "Propose removing a package from a cycle. Name the topic.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string" },
          cycleNumber: { type: "integer" }
        },
        required: ["topic"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_assign_role",
      description: "Propose making someone associate producer, executive producer, or adviser.",
      parameters: {
        type: "object",
        properties: {
          person: { type: "string" },
          role: { type: "string" }
        },
        required: ["person", "role"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_remove_role",
      description: "Propose removing someone's producer role.",
      parameters: {
        type: "object",
        properties: { person: { type: "string" } },
        required: ["person"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_queue_package",
      description: "Propose sending a package to the publishing queue, assigning a show date, or removing it from the queue.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string" },
          cycleNumber: { type: "integer" },
          queued: { type: "boolean" },
          showDate: { type: "string", description: "YYYY-MM-DD show date, or omit for the next empty show" }
        },
        required: ["topic"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_set_cycles_per_semester",
      description: "Propose how many package cycles run each semester.",
      parameters: {
        type: "object",
        properties: { count: { type: "integer" } },
        required: ["count"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_decide_access",
      description: "Propose approving or denying a pending access request.",
      parameters: {
        type: "object",
        properties: {
          person: { type: "string" },
          status: { type: "string", description: "approve or deny" }
        },
        required: ["person", "status"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_set_grade",
      description:
        "Propose a package-cycle final cut quality score. Ungraded is a dash (—), not 0. 0 means they earned nothing. Set ungraded=true to clear the grade. Check-ins are automatic.",
      parameters: {
        type: "object",
        properties: {
          person: { type: "string" },
          cycleNumber: { type: "integer" },
          points: { type: "number", description: "Quality score 0–50. Omit when ungraded=true." },
          ungraded: {
            type: "boolean",
            description: "True to clear the grade to a dash. Do not use 0 for that."
          },
          feedback: { type: "string" },
          turnedInDate: { type: "string", description: "YYYY-MM-DD" },
          publish: { type: "boolean" }
        },
        required: ["person", "cycleNumber"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_set_portfolio",
      description: "Propose a portfolio score out of 100. Does not save until approved.",
      parameters: {
        type: "object",
        properties: {
          person: { type: "string" },
          points: { type: "integer", description: "0–100" },
          feedback: { type: "string" }
        },
        required: ["person", "points"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_publish_grade",
      description: "Propose publishing or unpublishing a cycle grade so the student can see it.",
      parameters: {
        type: "object",
        properties: {
          person: { type: "string" },
          cycleNumber: { type: "integer" },
          published: { type: "boolean" }
        },
        required: ["person", "cycleNumber"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "propose_remove_person",
      description: "Propose removing someone so they can no longer sign in.",
      parameters: {
        type: "object",
        properties: { person: { type: "string" } },
        required: ["person"],
        additionalProperties: false
      }
    }
  }
];

const LOOKUP_TOOL_NAMES = new Set([
  "list_people",
  "list_packages",
  "list_groups",
  "list_my_groups",
  "get_group",
  "get_grades",
  "list_cycle_dates",
  "list_producers",
  "list_queue"
]);

export const ASSISTANT_LOOKUP_TOOLS = ASSISTANT_ADMIN_TOOLS.filter((tool) => LOOKUP_TOOL_NAMES.has(tool.function.name));
export const ASSISTANT_MUTATION_TOOLS = ASSISTANT_ADMIN_TOOLS.filter((tool) => !LOOKUP_TOOL_NAMES.has(tool.function.name));
