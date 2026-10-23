import { fillPackageTosses } from "@/src/lib/teleprompter-package-toss";
import { buildDefaultTeleprompterSections, renderA2BulletinContent } from "@/src/lib/teleprompter-template";
import type { SubmittedAnnouncement } from "@/src/lib/submitted-announcements";

function announcement(text: string) {
  return { announcement: text } as SubmittedAnnouncement;
}

/** The real A1–A5 template with three announcements and a package toss, as run mode shows it. */
export function templateSections() {
  const sections = buildDefaultTeleprompterSections({
    showDate: new Date("2026-10-23T12:00:00.000Z"),
    a2BulletinContent: renderA2BulletinContent([
      announcement("College visits this week: check MaiaLearning for times."),
      announcement("Spirit Week starts Monday with pajama day."),
      announcement("Robot Club meets Thursday in the library.")
    ]),
    anchorName: "Abby Ames",
    coanchorName: "Otto Ortiz"
  });

  return sections.map((section, index) => ({
    id: `s${index + 1}`,
    label: section.label,
    content:
      section.label === "A3"
        ? fillPackageTosses(section.content, [
            { title: "Robotics", toss: "The robotics team built a robot that sorts recycling." },
            { title: "Garden", toss: "" }
          ])
        : section.content
  }));
}
