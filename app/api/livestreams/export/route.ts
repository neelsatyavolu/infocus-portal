import { GET as getCompletion } from "@/app/api/livestreams/completion/route";
import { buildCsv, csvFilename, csvResponse } from "@/src/lib/csv";

type CompletionRow = {
  name: string | null;
  email: string | null;
  completedHours: number;
  completedEvents: number;
  requiredHours: number;
  isManager: boolean;
  managedEvents: number;
  requiredManagedEvents: number;
  creditPercent: number;
  scheduledHours: number;
};

/**
 * Livestream hours per student for the current semester: the Completion roster as CSV. It reuses
 * GET /api/livestreams/completion, so the access check (producers and livestream managers) and
 * the numbers are the same as the page.
 */
export async function GET() {
  const response = await getCompletion();
  if (!response.ok) return response;

  const { data } = (await response.json()) as { data: { semester: { label: string }; rows: CompletionRow[] } };
  const csv = buildCsv(
    [
      "Name",
      "Email",
      "Semester",
      "Hours completed",
      "Hours required",
      "Livestreams completed",
      "Hours signed up (upcoming)",
      "Livestream manager",
      "Managed livestreams",
      "Managed required",
      "Credit %"
    ],
    data.rows.map((row) => [
      row.name,
      row.email,
      data.semester.label,
      row.completedHours,
      row.requiredHours,
      row.completedEvents,
      row.scheduledHours,
      row.isManager,
      row.isManager ? row.managedEvents : null,
      row.isManager ? row.requiredManagedEvents : null,
      row.creditPercent
    ])
  );
  return csvResponse(csvFilename(`livestream-hours-${data.semester.label.replace(/\s+/g, "-")}`), csv);
}
