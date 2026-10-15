"use client";

import type { Health } from "./admin-status";
import { ConfigurationSection } from "./configuration-section";
import { PackageCyclesSection } from "./package-cycles-section";
import type { AdminConfiguration } from "./use-admin-configuration";

/** Admin → School year: package cycles, then the school calendar (Paly's calendar check, school years, days off). */
export function SchoolYearView({
  cyclesPerSemester,
  onCyclesPerSemesterChange,
  configuration,
  calendarHealth
}: {
  cyclesPerSemester: number;
  onCyclesPerSemesterChange: (value: number) => void;
  configuration: AdminConfiguration;
  calendarHealth: Health;
}) {
  return (
    <div id="school-year" className="scroll-mt-24 space-y-6">
      <PackageCyclesSection cyclesPerSemester={cyclesPerSemester} onCyclesPerSemesterChange={onCyclesPerSemesterChange} />
      <ConfigurationSection configuration={configuration} calendarHealth={calendarHealth} />
    </div>
  );
}
