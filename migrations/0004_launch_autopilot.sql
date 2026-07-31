BEGIN;

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS execution_mode text;

-- Missions created before launch-readiness mode existed were compiled for live
-- provider execution. Preserve that meaning instead of silently relabeling
-- their existing plans. Newly created missions default to the safer mode.
UPDATE missions
  SET execution_mode = 'live_launch'
  WHERE execution_mode IS NULL;

ALTER TABLE missions
  ALTER COLUMN execution_mode SET DEFAULT 'launch_readiness',
  ALTER COLUMN execution_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'missions_execution_mode_check') THEN
    ALTER TABLE missions
      ADD CONSTRAINT missions_execution_mode_check
      CHECK (execution_mode IN ('launch_readiness', 'live_launch'));
  END IF;
END $$;

ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS team_size integer NOT NULL DEFAULT 1;
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS baseline_meetings integer NOT NULL DEFAULT 0;
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS actual_meetings integer NOT NULL DEFAULT 0;
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS meeting_minutes integer NOT NULL DEFAULT 0;

COMMIT;
