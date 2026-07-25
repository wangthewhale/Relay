BEGIN;

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS missions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  objective text NOT NULL,
  success_metric text NOT NULL,
  status text NOT NULL CHECK (status IN ('intake', 'conflicts', 'planning', 'active', 'completed')),
  current_plan_version integer NOT NULL DEFAULT 0,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  title text NOT NULL,
  author_name text NOT NULL,
  content text NOT NULL,
  occurred_at timestamptz,
  authority_level integer NOT NULL CHECK (authority_level BETWEEN 1 AND 5),
  evidence_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intent_assertions (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  statement text NOT NULL,
  assertion_type text NOT NULL,
  authority_level integer NOT NULL CHECK (authority_level BETWEEN 1 AND 5),
  confidence numeric(4,3) NOT NULL,
  scope text NOT NULL DEFAULT 'mission',
  expiration timestamptz,
  superseded_by uuid REFERENCES intent_assertions(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conflicts (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  conflict_type text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL CHECK (status IN ('open', 'resolved')),
  blocking boolean NOT NULL DEFAULT false,
  source_assertion_ids uuid[] NOT NULL DEFAULT '{}',
  decision_owner text NOT NULL,
  decision_due_at timestamptz,
  consequences text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS conflict_resolutions (
  id uuid PRIMARY KEY,
  conflict_id uuid NOT NULL UNIQUE REFERENCES conflicts(id) ON DELETE CASCADE,
  option_id text NOT NULL,
  decision text NOT NULL,
  reason text NOT NULL,
  decided_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_versions (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'superseded')),
  change_summary text NOT NULL,
  diff jsonb NOT NULL DEFAULT '[]'::jsonb,
  contract jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  UNIQUE (mission_id, version_no)
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  plan_version_id uuid NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  title text NOT NULL,
  goal text NOT NULL,
  owner_type text NOT NULL CHECK (owner_type IN ('human', 'agent')),
  owner_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'blocked', 'ready', 'running', 'completed', 'failed')),
  risk_level integer NOT NULL CHECK (risk_level BETWEEN 0 AND 4),
  dependencies text[] NOT NULL DEFAULT '{}',
  required_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  definition_of_done text NOT NULL,
  required_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  forbidden_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_limit numeric(14,2),
  time_limit_minutes integer NOT NULL,
  approval_policy text NOT NULL,
  retry_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  stop_condition text NOT NULL,
  rollback_strategy text NOT NULL,
  required_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome_metric text NOT NULL,
  preflight jsonb,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_version_id, task_key)
);

CREATE TABLE IF NOT EXISTS access_blueprints (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  plan_version_id uuid NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  why_needed text NOT NULL,
  task_keys text[] NOT NULL DEFAULT '{}',
  resource_scope text NOT NULL,
  access_level text NOT NULL CHECK (access_level IN ('read', 'draft', 'write', 'publish')),
  status text NOT NULL CHECK (status IN ('not_connected', 'pending', 'verified', 'expired', 'revoked')),
  expiration timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  plan_version_id uuid NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  action text NOT NULL,
  exact_payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  audience text NOT NULL,
  budget numeric(14,2),
  start_time timestamptz,
  stop_condition text NOT NULL,
  requester text NOT NULL,
  approver text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'invalidated')),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'agent', 'system')),
  actor_name text NOT NULL,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  plan_version integer,
  summary text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outcomes (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL UNIQUE REFERENCES missions(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  target_value text NOT NULL,
  actual_value text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('not_started', 'on_track', 'at_risk', 'achieved', 'missed')),
  cost numeric(14,2) NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 0,
  human_interventions integer NOT NULL DEFAULT 0,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sources_mission ON sources(mission_id);
CREATE INDEX IF NOT EXISTS idx_assertions_mission ON intent_assertions(mission_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_mission_status ON conflicts(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_plan_versions_mission ON plan_versions(mission_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_mission_status ON tasks(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_mission_status ON approvals(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_events_mission_created ON audit_events(mission_id, created_at DESC);

COMMIT;
