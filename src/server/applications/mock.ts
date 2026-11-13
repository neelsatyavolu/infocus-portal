import type { Prisma } from "@prisma/client";
import { EMPTY_ANSWERS, type ApplicationAnswers } from "@/src/lib/applications/answers";
import { parseApplicationConfig } from "@/src/lib/applications/config";
import { prisma } from "@/src/lib/prisma";
import type { ApplicationsViewer } from "@/src/server/applications/access";
import { audit, getRoundOrThrow } from "@/src/server/applications/rounds";

/**
 * Placeholder applicants (no user account, isMock) so execs can try the reviewer side in production.
 * Names and writing are made up. They're tagged everywhere and never block a release.
 */

type MockPersona = {
  name: string;
  grade: string;
  years: string;
  roles: number[];
  acceptOther: "yes" | "no";
  hours: string;
  skills: number[];
  commitments: string;
  answer1: string;
  answer2: string;
  notes: [number, number, string][];
  summary: string;
  air: number;
  airReason: string;
  draft?: boolean;
};

const PERSONAS: MockPersona[] = [
  {
    name: "Abby Mock",
    grade: "12",
    years: "3+",
    roles: [0, 1],
    acceptOther: "yes",
    hours: "6+",
    skills: [0, 1, 9],
    commitments: "Varsity swim in the winter, part-time job on weekends.",
    answer1:
      "Packages slip because nobody checks in between pitch and initial cut. I'd add a ten-minute Monday stand-up where each group names its next deadline and one blocker, and an AP follows up by Wednesday. I tried this informally with my own group in the fall and we hit every deadline after that.",
    answer2:
      "Our homecoming package lost its main interview audio because the lav was never switched on. I told the producers the same day, rebooked the interview for the next morning, and wrote a one-line audio check into our shoot list. Now I check levels on headphones before every take.",
    notes: [
      [12, 0, "The open is slow. Start on the strongest soundbite instead of the wide shot."],
      [41, 1, "The second interview repeats the first one. Cut it or use it for a new point."],
      [78, 3, "The music is louder than the VO here. Duck it at least 10 dB."],
      [96, 4, "Lower third has the wrong title for the coach."]
    ],
    summary:
      "Fix the lower third first because it's an accuracy problem. Then duck the music under the VO so people can hear the story. Last, tighten the open by leading with the soundbite.",
    air: 1,
    airReason: "The story is there, but the wrong title and the audio mix have to be fixed before it airs."
  },
  {
    name: "Otto Mock",
    grade: "11",
    years: "2",
    roles: [0, 2, 1],
    acceptOther: "yes",
    hours: "4–6",
    skills: [1, 4, 2],
    commitments: "Robotics team.",
    answer1:
      "The livestream crew should be trained before the season, not during it. I'd run two practice streams in August with new crew on every position, so the first real game isn't anyone's first time on the switcher.",
    answer2:
      "During a basketball stream the encoder dropped at halftime. I didn't know the backup plan, so we were off air for eight minutes. Afterwards I wrote a one-page restart checklist and taped it to the cart.",
    notes: [
      [5, 2, "Shaky handheld shot. Use the tripod angle instead."],
      [78, 3, "Music too loud."],
      [120, 6, "Ending feels abrupt."]
    ],
    summary: "Make the audio mix even, swap the shaky shot and give it a real ending. The audio matters most because people tune out when they can't hear.",
    air: 1,
    airReason: "It mostly works once the audio is fixed."
  },
  {
    name: "Sage Mock",
    grade: "11",
    years: "1",
    roles: [1, 0],
    acceptOther: "yes",
    hours: "2–4",
    skills: [5, 6, 8],
    commitments: "Debate, tutoring twice a week.",
    answer1:
      "InFocus should post every package as a short vertical cut. I'd make one person per group responsible for a 30-second version due with the final cut, and track views to see what works.",
    answer2:
      "I missed the script deadline for a features package because I underestimated the interviews. I told my group early, split the writing, and we turned it in a day late. Next time I'd schedule interviews first.",
    notes: [
      [41, 1, "Soundbite is too long, trim to the key line."],
      [96, 4, "Coach's title is wrong in the lower third."],
      [110, 5, "We should confirm the stat about the season record."],
      [130, 0, "Ending should come back to the player we opened with."]
    ],
    summary:
      "Correct the lower third and confirm the season stat so nothing inaccurate airs. Then trim the long soundbite to keep the pace.",
    air: 1,
    airReason: "Accuracy issues have to be fixed, but it doesn't need a re-cut."
  },
  {
    name: "Rowan Mock",
    grade: "12",
    years: "3+",
    roles: [0],
    acceptOther: "no",
    hours: "6+",
    skills: [0, 3, 9, 7],
    commitments: "None.",
    answer1:
      "We need a shared calendar that actually gets used. I'd move every shoot, deadline and show into the Portal calendar and stop announcing them in three places.",
    answer2:
      "A package I produced aired with a typo in a graphic. I owned it in the next class meeting and added a graphics read-through to our final-cut checklist.",
    notes: [
      [12, 0, "Open is slow."],
      [96, 4, "Fix lower third."],
      [78, 3, "Mix music under VO."]
    ],
    summary: "Lower third, audio mix, and the open, in that order.",
    air: 2,
    airReason: "Too many basic problems for one day."
  },
  {
    name: "Juno Mock",
    grade: "11",
    years: "2",
    roles: [2, 0, 3],
    acceptOther: "yes",
    hours: "4–6",
    skills: [4, 1, 2],
    commitments: "Orchestra.",
    answer1:
      "Shows run long because segments aren't timed. I'd give every segment a target length on the rundown and have the director call time cues.",
    answer2:
      "Our teleprompter froze mid-show. I switched the anchors to printed scripts and we finished the show. I now print a backup every time.",
    notes: [
      [5, 2, "Shot is shaky."],
      [41, 1, "Repetitive soundbite."],
      [78, 3, "Music is loud."],
      [96, 4, "Wrong title on lower third."],
      [110, 5, "Check the season record stat."]
    ],
    summary: "Fix the accuracy problems first (title and stat), then the audio, then tighten the interviews.",
    air: 1,
    airReason: "The fixes are small enough to finish in a day."
  },
  {
    name: "Milo Mock",
    grade: "11",
    years: "1",
    roles: [1],
    acceptOther: "yes",
    hours: "2–4",
    skills: [6],
    commitments: "Soccer and a job.",
    answer1: "More fun packages.",
    answer2: "",
    notes: [],
    summary: "",
    air: -1,
    airReason: "",
    draft: true
  }
];

function personaAnswers(persona: MockPersona, roles: string[], skills: string[], categories: string[], airOptions: string[]): ApplicationAnswers {
  return {
    ...EMPTY_ANSWERS,
    grade: persona.grade,
    years: persona.years,
    rolePrefs: persona.roles.map((index) => roles[index]).filter((role): role is string => Boolean(role)),
    acceptOther: persona.acceptOther,
    pastRoles: ["Reporter"],
    commitments: persona.commitments,
    hours: persona.hours,
    skills: persona.skills.map((index) => skills[index]).filter((skill): skill is string => Boolean(skill)),
    answer1: persona.answer1,
    answer2: persona.answer2,
    cutNotes: persona.notes.map(([t, category, text], index) => ({
      id: `mock-${index}`,
      t,
      category: categories[category] ?? categories[categories.length - 1] ?? "Other",
      text
    })),
    cutSummary: persona.summary,
    airDecision: persona.air >= 0 ? (airOptions[persona.air] ?? "") : "",
    airReason: persona.airReason
  };
}

export async function addMockApplicants(viewer: ApplicationsViewer, roundId: string) {
  const round = await getRoundOrThrow(roundId);
  const config = parseApplicationConfig(round.config);
  const existing = await prisma.application.findMany({ where: { roundId, isMock: true, userId: null }, select: { mockName: true } });
  const taken = new Set(existing.map((row) => row.mockName));
  const now = Date.now();
  const toCreate = PERSONAS.filter((persona) => !taken.has(persona.name));
  await prisma.$transaction(
    toCreate.map((persona, index) =>
      prisma.application.create({
        data: {
          roundId,
          isMock: true,
          mockName: persona.name,
          status: persona.draft ? "DRAFT" : "SUBMITTED",
          submittedAt: persona.draft ? null : new Date(now - (toCreate.length - index) * 3_600_000),
          version: persona.draft ? 0 : 1,
          attested: !persona.draft,
          answers: personaAnswers(persona, config.roles, config.skills, config.roughCut.categories, config.roughCut.airOptions) as unknown as Prisma.InputJsonValue
        }
      })
    )
  );
  await audit(roundId, null, viewer.userId, "mock.add", { count: toCreate.length });
  return toCreate.length;
}

/** Removes the placeholder applicants and any exec test applications. */
export async function removeMockApplicants(viewer: ApplicationsViewer, roundId: string) {
  await getRoundOrThrow(roundId);
  const { count } = await prisma.application.deleteMany({ where: { roundId, isMock: true } });
  await audit(roundId, null, viewer.userId, "mock.remove", { count });
  return count;
}
