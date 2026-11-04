-- Run once, after the catch log is live: totals counted before the log existed become one
-- "baseline" row per person and kind (the score minus what the log already holds), dated at
-- the score's last update. Safe to re-run: it skips anyone who already has a baseline row.
INSERT INTO "ThanksgivingCatch" ("id", "userId", "year", "kind", "count", "caughtAt", "source", "accepted")
SELECT 'baseline_' || s."id" || '_' || k.kind, s."userId", s."year", k.kind, k.total - COALESCE(logged.n, 0), s."updatedAt", 'baseline', true
FROM "ThanksgivingScore" s
CROSS JOIN LATERAL (VALUES
  ('leaves', s."leaves"), ('pies', s."pies"), ('wishbones', s."wishbones"),
  ('giantTurkeys', s."giantTurkeys"), ('pardons', s."pardons")
) AS k(kind, total)
LEFT JOIN LATERAL (
  SELECT SUM(c."count")::int AS n FROM "ThanksgivingCatch" c
  WHERE c."userId" = s."userId" AND c."year" = s."year" AND c."kind" = k.kind AND c."accepted"
) logged ON true
WHERE k.total - COALESCE(logged.n, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "ThanksgivingCatch" b
    WHERE b."userId" = s."userId" AND b."year" = s."year" AND b."source" = 'baseline'
  );
