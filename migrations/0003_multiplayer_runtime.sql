BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_source text NOT NULL DEFAULT 'relay_session';
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS workspace_invites (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES missions(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  title text,
  department text,
  workspace_role text NOT NULL CHECK (workspace_role IN ('admin', 'member', 'viewer')),
  mission_role text NOT NULL CHECK (mission_role IN ('owner', 'decision_maker', 'contributor', 'observer')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mission_members (
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'decision_maker', 'contributor', 'observer')),
  responsibility text NOT NULL DEFAULT '',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, user_id)
);

CREATE TABLE IF NOT EXISTS mission_presence (
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('viewing', 'editing', 'deciding', 'away')),
  cursor_context text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, user_id, connection_id)
);

CREATE TABLE IF NOT EXISTS collaboration_events (
  sequence bigserial UNIQUE NOT NULL,
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  plan_version integer,
  mission_revision bigint NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'agent', 'system', 'provider')),
  actor_id uuid,
  actor_name text NOT NULL,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  summary text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mission_comments (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}',
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  conflict_id uuid REFERENCES conflicts(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES mission_comments(id) ON DELETE CASCADE,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_handoffs (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  from_agent_id uuid,
  to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  to_agent_id uuid,
  reason text NOT NULL,
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('offered', 'accepted', 'declined', 'cancelled')),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user_id IS NOT NULL OR from_agent_id IS NOT NULL),
  CHECK (to_user_id IS NOT NULL OR to_agent_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES missions(id) ON DELETE CASCADE,
  name text NOT NULL,
  purpose text NOT NULL,
  model_provider text NOT NULL DEFAULT 'openai',
  model_name text NOT NULL DEFAULT 'configured-at-runtime',
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_ceiling integer NOT NULL DEFAULT 1 CHECK (risk_ceiling BETWEEN 0 AND 4),
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'paused', 'offline')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, name)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_handoffs_from_agent_fk') THEN
    ALTER TABLE task_handoffs
      ADD CONSTRAINT task_handoffs_from_agent_fk FOREIGN KEY (from_agent_id) REFERENCES agents(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_handoffs_to_agent_fk') THEN
    ALTER TABLE task_handoffs
      ADD CONSTRAINT task_handoffs_to_agent_fk FOREIGN KEY (to_agent_id) REFERENCES agents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  plan_version_id uuid NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'pause_requested', 'paused', 'cancel_requested', 'cancelled', 'succeeded', 'failed', 'blocked')),
  attempt integer NOT NULL DEFAULT 1,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  phase text NOT NULL DEFAULT 'queued',
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot jsonb,
  idempotency_key text NOT NULL UNIQUE,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connector_connections (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  account_id text NOT NULL,
  account_label text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'connected', 'verified', 'expired', 'revoked', 'error')),
  granted_scopes text[] NOT NULL DEFAULT '{}',
  encrypted_credentials text NOT NULL,
  credential_key_version integer NOT NULL DEFAULT 1,
  expires_at timestamptz,
  verified_at timestamptz,
  last_error text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, account_id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES missions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  state_hash text NOT NULL UNIQUE,
  code_verifier_encrypted text,
  redirect_after text NOT NULL DEFAULT '/',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_manifests (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  plan_version_id uuid NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES connector_connections(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  granted_capabilities jsonb NOT NULL,
  allowed_resources jsonb NOT NULL,
  forbidden_actions jsonb NOT NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  manifest_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id uuid PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  plan_version_id uuid NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES connector_connections(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  capability text NOT NULL,
  resource_id text,
  risk_level integer NOT NULL CHECK (risk_level BETWEEN 0 AND 4),
  request_payload_hash text NOT NULL,
  response_payload_hash text,
  status text NOT NULL CHECK (status IN ('requested', 'approved', 'executing', 'succeeded', 'blocked', 'failed')),
  approval_id uuid REFERENCES approvals(id) ON DELETE SET NULL,
  blocked_reason text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS authority_edges (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subject_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('workspace', 'department', 'mission', 'capability', 'budget')),
  scope_value text NOT NULL,
  authority_level integer NOT NULL CHECK (authority_level BETWEEN 1 AND 5),
  can_approve_risk integer NOT NULL DEFAULT 0 CHECK (can_approve_risk BETWEEN 0 AND 4),
  budget_ceiling numeric(14,2),
  source_assertion_id uuid REFERENCES intent_assertions(id) ON DELETE SET NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  superseded_by uuid REFERENCES authority_edges(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outcome_learning_signals (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  assertion_id uuid REFERENCES intent_assertions(id) ON DELETE SET NULL,
  conflict_id uuid REFERENCES conflicts(id) ON DELETE SET NULL,
  plan_version_id uuid REFERENCES plan_versions(id) ON DELETE SET NULL,
  signal_type text NOT NULL CHECK (signal_type IN ('accepted_conflict', 'false_positive', 'human_correction', 'approval_rejected', 'rollback', 'outcome')),
  label text NOT NULL,
  value numeric(10,4),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime_api_keys (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  allowed_mission_ids uuid[] NOT NULL,
  capabilities text[] NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invites_token ON workspace_invites(token_hash) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mission_members_user ON mission_members(user_id, mission_id);
CREATE INDEX IF NOT EXISTS idx_presence_mission_seen ON mission_presence(mission_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_collaboration_events_mission_sequence ON collaboration_events(mission_id, sequence DESC);
CREATE INDEX IF NOT EXISTS idx_comments_mission_created ON mission_comments(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_handoffs_mission_created ON task_handoffs(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_mission_status ON agents(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_queue ON agent_runs(status, created_at) WHERE status IN ('queued', 'running', 'pause_requested', 'cancel_requested');
CREATE INDEX IF NOT EXISTS idx_agent_runs_mission_created ON agent_runs(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connections_workspace_provider ON connector_connections(workspace_id, provider, status);
CREATE INDEX IF NOT EXISTS idx_manifests_mission_version ON access_manifests(mission_id, plan_version_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_run_created ON tool_calls(agent_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_authority_workspace_scope ON authority_edges(workspace_id, scope_type, scope_value);
CREATE INDEX IF NOT EXISTS idx_learning_workspace_created ON outcome_learning_signals(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_api_keys_hash ON runtime_api_keys(token_hash) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION relay_publish_collaboration_event() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('relay_mission_events', json_build_object('missionId', NEW.mission_id, 'sequence', NEW.sequence)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS collaboration_event_notify ON collaboration_events;
CREATE TRIGGER collaboration_event_notify
AFTER INSERT ON collaboration_events
FOR EACH ROW EXECUTE FUNCTION relay_publish_collaboration_event();

COMMIT;
