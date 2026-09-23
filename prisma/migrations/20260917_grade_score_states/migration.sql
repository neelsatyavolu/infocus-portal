CREATE TYPE "GradeScoreState" AS ENUM ('UNGRADED', 'EXEMPT');

ALTER TABLE "PackageGrade"
ADD COLUMN "finalCutState" "GradeScoreState",
ADD COLUMN "pitchingState" "GradeScoreState",
ADD COLUMN "proofOfContactState" "GradeScoreState",
ADD COLUMN "aRollBRollState" "GradeScoreState",
ADD COLUMN "initialCutState" "GradeScoreState";
