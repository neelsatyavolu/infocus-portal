-- Golden leaves (worth 5) and harvest hour's double points (src/lib/thanksgiving-board.ts).
ALTER TABLE "ThanksgivingScore" ADD COLUMN IF NOT EXISTS "goldenLeaves" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ThanksgivingScore" ADD COLUMN IF NOT EXISTS "bonus" INTEGER NOT NULL DEFAULT 0;
