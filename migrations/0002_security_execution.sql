BEGIN;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mission_shares (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  permission text NOT NULL CHECK (permission IN ('viewer', 'editor')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  plan_version_id uuid NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS execution_receipts (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  plan_version_id uuid NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  executor text NOT NULL,
  status text NOT NULL CHECK (status IN ('succeeded', 'blocked', 'failed')),
  preflight jsonb NOT NULL,
  artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  artifact_hash text,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_reports (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_hash ON auth_sessions(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mission_shares_hash ON mission_shares(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_mission_created ON artifacts(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_receipts_mission_created ON execution_receipts(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_reports_slug ON public_reports(slug) WHERE revoked_at IS NULL;

COMMIT;
