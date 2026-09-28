-- Cycle the Class Board shows. Null = follow the current cycle.
ALTER TABLE "ProgramSetting" ADD COLUMN IF NOT EXISTS "classBoardCycleNumber" INTEGER;
