import { z } from "zod";
import { prisma } from "@/src/lib/prisma";
import { directoryLookup } from "@/src/server/equipment-directory";

export async function lookupEquipmentStudent(studentId: string) {
  const id = studentId.trim();
  if (!id) {
    return null;
  }

  const existing = await prisma.equipmentStudent.findUnique({
    where: { studentId: id }
  });
  if (existing) {
    return existing;
  }

  const directory = await directoryLookup(id);
  if (!directory) {
    return null;
  }

  return prisma.equipmentStudent.upsert({
    where: { studentId: id },
    create: {
      studentId: id,
      name: directory.name,
      email: directory.email,
      firstName: directory.firstName,
      lastName: directory.lastName,
      lastSyncedAt: new Date()
    },
    update: {
      name: directory.name,
      email: directory.email,
      firstName: directory.firstName,
      lastName: directory.lastName,
      lastSyncedAt: new Date()
    }
  });
}

// Keep the internal student key stable so existing checkouts and holds still match.
export async function resolveEquipmentStudentContact(studentName: string, studentEmail: string) {
  const name = z.string().trim().min(1).max(200).parse(studentName);
  const email = z.string().trim().email().max(254).parse(studentEmail).toLowerCase();
  const schoolId = email.match(/^[a-z]+(\d+)@pausd\.us$/)?.[1];
  const studentId = schoolId ? `950${schoolId}` : `email:${email}`;
  const matches = await prisma.equipmentStudent.findMany({
    where: { OR: [{ email: { equals: email, mode: "insensitive" } }, { studentId }] },
    take: 2
  });
  const existing = matches[0];
  if (matches.length > 1 || (existing?.email && existing.email.trim().toLowerCase() !== email)) {
    throw new Error("Student email conflicts with existing records. Ask an equipment manager to check the student details.");
  }
  return prisma.equipmentStudent.upsert({
    where: { studentId: existing?.studentId ?? studentId },
    create: { studentId, name, email },
    update: { name, email }
  });
}
