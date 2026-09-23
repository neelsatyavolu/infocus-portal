ALTER TABLE "AnnouncementSubmission" ADD COLUMN IF NOT EXISTS "isPermanent" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "SubmittedAnnouncementDeletion" (
  "id" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmittedAnnouncementDeletion_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AnnouncementSubmission" ("id", "email", "name", "submitterKind", "runOn", "announcement", "startDate", "endDate", "policyAgreed", "isPermanent", "updatedAt")
VALUES ('permanent-paly-scholarships', '', 'InFocus', 'COMMUNITY_MEMBER', 'INFOCUS_ONLY', 'You can find a list of scholarships with upcoming deadlines in the next two weeks at https://bit.ly/palyscholarships.  For a full list of all scholarships with detailed information, log in to MaiaLearning by clicking the tile of the app in the ClassLink portal; then, from the left, navigate to Student > Financial Aid & click the Local Scholarships hyperlink from the top navigation.  Click on a scholarship name from the list to expand an entry and view details.', '', '', true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
