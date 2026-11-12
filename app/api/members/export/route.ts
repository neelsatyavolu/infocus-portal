import { handleRouteError } from "@/src/lib/api-errors";
import { buildCsv, csvFilename, csvResponse } from "@/src/lib/csv";
import { MEMBER_GENERAL_CYCLE_NUMBER } from "@/src/lib/member-notes";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { listProducerMembers } from "@/src/server/member-notes";
import { loadExportViewer } from "@/src/server/export-viewer";

/** People on /members with their general and per-cycle producer notes. Same access as the page (AP+). */
export async function GET() {
  try {
    const { role } = await loadExportViewer();
    if (!hasPlatformRole(role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const { cycles, members } = await listProducerMembers();
    const cycleNumbers = cycles
      .map((cycle) => cycle.cycleNumber)
      .filter((cycleNumber) => cycleNumber !== MEMBER_GENERAL_CYCLE_NUMBER);

    const csv = buildCsv(
      ["Name", "Email", "General notes", ...cycleNumbers.map((cycleNumber) => `Cycle ${cycleNumber} notes`)],
      members.map((member) => [
        member.name,
        member.email,
        member.notesByCycle[String(MEMBER_GENERAL_CYCLE_NUMBER)] ?? "",
        ...cycleNumbers.map((cycleNumber) => member.notesByCycle[String(cycleNumber)] ?? "")
      ])
    );
    return csvResponse(csvFilename("members"), csv);
  } catch (error) {
    return handleRouteError(error);
  }
}
