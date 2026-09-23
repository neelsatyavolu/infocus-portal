ALTER TABLE "LivestreamAttendee" ADD COLUMN "creditHours" DOUBLE PRECISION;
ALTER TABLE "LivestreamAttendee" ADD CONSTRAINT "LivestreamAttendee_creditHours_check" CHECK ("creditHours" >= 0 AND "creditHours" <= 24);
