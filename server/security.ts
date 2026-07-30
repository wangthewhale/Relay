import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { pool } from "./db";

const SESSION_COOKIE = "relay_session";
const SESSION_DAYS = 30;
const SHARE_DAYS = 7;

export type StoreScope =
  | { kind: "session"; authType: "browser_session" | "api_key"; workspaceId: string; userId: string; workspaceRole: "owner" | "admin" | "member" | "viewer"; allowedMissionIds: string[]; apiCapabilities?: ApiCapability[]; actorName: string; email?: string; title?: string; department?: string; identityVerified: boolean; canWrite: true }
  | { kind: "share"; missionId: string; actorName: string; canWrite: boolean }
  | { kind: "system"; actorName: string; canWrite: true };

export const systemScope: StoreScope = { kind: "system", actorName: "Relay System", canWrite: true };
export type ApiCapability = "runtime:control" | "tool:call" | "mission:correct" | "mission:comment" | "mission:handoff";

export class AuthenticationError extends Error {
  status = 401;
}

export class AuthorizationError extends Error {
  status = 403;
}

interface SessionRecord {
  tokenHash: string;
  userId: string;
  workspaceId: string;
  workspaceRole: "owner" | "admin" | "member" | "viewer";
  allowedMissionIds: string[];
  actorName: string;
  email?: string;
  title?: string;
  department?: string;
  identityVerified: boolean;
  expiresAt: string;
  revokedAt?: string;
}

interface RuntimeKeyRecord {
  id: string;
  tokenHash: string;
  workspaceId: string;
  userId: string;
  name: string;
  allowedMissionIds: string[];
  capabilities: ApiCapability[];
  expiresAt: string;
  revokedAt?: string;
}

interface ShareRecord {
  tokenHash: string;
  missionId: string;
  permission: "viewer" | "editor";
  expiresAt: string;
  revokedAt?: string;
}

const memorySessions = new Map<string, SessionRecord>();
const memoryShares = new Map<string, ShareRecord>();
const memoryRuntimeKeys = new Map<string, RuntimeKeyRecord>();

export function secureToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function expiresIn(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1_000).toISOString();
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.cookie ?? "";
  for (const item of cookie.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function setSessionCookie(response: Response, rawToken: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(rawToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${secure}`,
  );
}

export async function createGuestSession(input?: { name?: string; workspaceName?: string }) {
  const rawToken = secureToken();
  const tokenHash = hashToken(rawToken);
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const suffix = randomBytes(8).toString("hex");
  const actorName = input?.name?.trim().slice(0, 120) || "Mission owner";
  const workspaceName = input?.workspaceName?.trim().slice(0, 160) || "Private launch workspace";
  const expiresAt = expiresIn(SESSION_DAYS);

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO workspaces (id, name) VALUES ($1, $2)", [workspaceId, workspaceName]);
      await client.query("INSERT INTO users (id, name, email, identity_source) VALUES ($1, $2, $3, 'relay_session')", [userId, actorName, `guest-${suffix}@relay.local`]);
      await client.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [workspaceId, userId]);
      await client.query("INSERT INTO auth_sessions (id, token_hash, user_id, workspace_id, expires_at) VALUES ($1, $2, $3, $4, $5)", [randomUUID(), tokenHash, userId, workspaceId, expiresAt]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } else {
    memorySessions.set(tokenHash, { tokenHash, userId, workspaceId, workspaceRole: "owner", allowedMissionIds: [], actorName, identityVerified: false, expiresAt });
  }

  return { rawToken, scope: { kind: "session", authType: "browser_session", workspaceId, userId, workspaceRole: "owner", allowedMissionIds: [], actorName, identityVerified: false, canWrite: true } satisfies StoreScope, expiresAt, workspaceName };
}

export async function createSessionForIdentity(input: {
  userId: string;
  workspaceId: string;
  actorName: string;
  email: string;
  title?: string;
  department?: string;
  identityVerified: boolean;
  workspaceRole?: "owner" | "admin" | "member" | "viewer";
  allowedMissionIds?: string[];
}) {
  const rawToken = secureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = expiresIn(SESSION_DAYS);
  if (pool) {
    await pool.query(
      "INSERT INTO auth_sessions (id, token_hash, user_id, workspace_id, expires_at) VALUES ($1,$2,$3,$4,$5)",
      [randomUUID(), tokenHash, input.userId, input.workspaceId, expiresAt],
    );
  } else {
    memorySessions.set(tokenHash, {
      tokenHash,
      userId: input.userId,
      workspaceId: input.workspaceId,
      workspaceRole: input.workspaceRole ?? "member",
      allowedMissionIds: input.allowedMissionIds ?? [],
      actorName: input.actorName,
      email: input.email,
      title: input.title,
      department: input.department,
      identityVerified: input.identityVerified,
      expiresAt,
    });
  }
  return {
    rawToken,
    expiresAt,
    scope: {
      kind: "session",
      authType: "browser_session",
      workspaceId: input.workspaceId,
      userId: input.userId,
      workspaceRole: input.workspaceRole ?? "member",
      allowedMissionIds: input.allowedMissionIds ?? [],
      actorName: input.actorName,
      email: input.email,
      title: input.title,
      department: input.department,
      identityVerified: input.identityVerified,
      canWrite: true,
    } satisfies StoreScope,
  };
}

export async function updateSessionIdentity(
  scope: Extract<StoreScope, { kind: "session" }>,
  input: { name: string; email?: string; title?: string; department?: string },
) {
  const email = input.email?.trim().toLowerCase();
  if (pool) {
    try {
      await pool.query(
        `UPDATE users SET name=$2,email=COALESCE(NULLIF($3,''),email),title=NULLIF($4,''),department=$5
         WHERE id=$1`,
        [scope.userId, input.name.trim(), email ?? "", input.title ?? "", input.department ?? "Other"],
      );
    } catch (error: any) {
      if (error?.code === "23505") throw Object.assign(new Error("This email already belongs to another Relay identity. Accept that person's invite or use a different email."), { status: 409 });
      throw error;
    }
  } else {
    for (const record of memorySessions.values()) {
      if (record.userId !== scope.userId || record.workspaceId !== scope.workspaceId) continue;
      record.actorName = input.name.trim();
      record.email = email || record.email;
      record.title = input.title || undefined;
      record.department = input.department || "Other";
    }
  }
  return { ...scope, actorName: input.name.trim(), email: email || scope.email, title: input.title || undefined, department: input.department || "Other" };
}

async function resolveSession(rawToken: string): Promise<StoreScope | undefined> {
  const tokenHash = hashToken(rawToken);
  if (pool) {
    const result = await pool.query(
      `SELECT s.user_id, s.workspace_id, wm.role AS workspace_role, u.name, u.email, u.title, u.department, u.identity_verified_at,
        COALESCE(array_agg(mm.mission_id) FILTER (WHERE mm.mission_id IS NOT NULL), '{}') AS allowed_mission_ids
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.user_id = s.user_id
       LEFT JOIN mission_members mm ON mm.user_id=s.user_id AND mm.mission_id IN (SELECT id FROM missions WHERE workspace_id=s.workspace_id)
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
       GROUP BY s.user_id,s.workspace_id,wm.role,u.name,u.email,u.title,u.department,u.identity_verified_at`,
      [tokenHash],
    );
    if (!result.rowCount) return undefined;
    const row = result.rows[0];
    return { kind: "session", authType: "browser_session", workspaceId: row.workspace_id, userId: row.user_id, workspaceRole: row.workspace_role, allowedMissionIds: row.allowed_mission_ids ?? [], actorName: row.name, email: row.email, title: row.title ?? undefined, department: row.department ?? undefined, identityVerified: Boolean(row.identity_verified_at), canWrite: true };
  }
  const record = memorySessions.get(tokenHash);
  if (!record || record.revokedAt || new Date(record.expiresAt).getTime() <= Date.now()) return undefined;
  return { kind: "session", authType: "browser_session", workspaceId: record.workspaceId, userId: record.userId, workspaceRole: record.workspaceRole, allowedMissionIds: record.allowedMissionIds, actorName: record.actorName, email: record.email, title: record.title, department: record.department, identityVerified: record.identityVerified, canWrite: true };
}

async function resolveRuntimeApiKey(rawToken: string): Promise<Extract<StoreScope, { kind: "session" }> | undefined> {
  const tokenHash = hashToken(rawToken);
  if (pool) {
    const result = await pool.query(
      `UPDATE runtime_api_keys rak SET last_used_at=now()
       FROM users u WHERE rak.token_hash=$1 AND rak.created_by=u.id AND rak.revoked_at IS NULL AND rak.expires_at>now()
       RETURNING rak.workspace_id,rak.created_by,rak.name,rak.allowed_mission_ids,rak.capabilities`,
      [tokenHash],
    );
    if (!result.rowCount) return undefined;
    const row = result.rows[0];
    return { kind: "session", authType: "api_key", workspaceId: row.workspace_id, userId: row.created_by, workspaceRole: "member", allowedMissionIds: row.allowed_mission_ids ?? [], apiCapabilities: row.capabilities ?? [], actorName: `Relay SDK · ${row.name}`, identityVerified: true, canWrite: true };
  }
  const record = memoryRuntimeKeys.get(tokenHash);
  if (!record || record.revokedAt || new Date(record.expiresAt).getTime() <= Date.now()) return undefined;
  return { kind: "session", authType: "api_key", workspaceId: record.workspaceId, userId: record.userId, workspaceRole: "member", allowedMissionIds: record.allowedMissionIds, apiCapabilities: record.capabilities, actorName: `Relay SDK · ${record.name}`, identityVerified: true, canWrite: true };
}

async function resolveShare(rawToken: string): Promise<StoreScope | undefined> {
  const tokenHash = hashToken(rawToken);
  if (pool) {
    const result = await pool.query(
      "SELECT mission_id, permission FROM mission_shares WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()",
      [tokenHash],
    );
    if (!result.rowCount) return undefined;
    const row = result.rows[0];
    return { kind: "share", missionId: row.mission_id, actorName: "Read-only guest", canWrite: false };
  }
  const record = memoryShares.get(tokenHash);
  if (!record || record.revokedAt || new Date(record.expiresAt).getTime() <= Date.now()) return undefined;
  return { kind: "share", missionId: record.missionId, actorName: "Read-only guest", canWrite: false };
}

export function resolveRequestScope(request: Request, options: { sessionOnly: true; write?: boolean; apiCapability?: ApiCapability }): Promise<Extract<StoreScope, { kind: "session" }>>;
export function resolveRequestScope(request: Request, options?: { sessionOnly?: false; write?: boolean; apiCapability?: ApiCapability }): Promise<StoreScope>;
export async function resolveRequestScope(request: Request, options?: { sessionOnly?: boolean; write?: boolean; apiCapability?: ApiCapability }): Promise<StoreScope> {
  const shareToken = request.header("X-Relay-Share-Token");
  const sessionToken = cookieValue(request, SESSION_COOKIE);
  const authorization = request.header("Authorization");
  const apiToken = authorization?.match(/^Bearer\s+(rly_[A-Za-z0-9_-]+)$/i)?.[1];
  const scope = apiToken
    ? await resolveRuntimeApiKey(apiToken)
    : sessionToken
    ? await resolveSession(sessionToken)
    : shareToken
      ? await resolveShare(shareToken)
      : undefined;
  if (!scope) throw new AuthenticationError("A private Relay session or valid mission link is required.");
  if (options?.sessionOnly && scope.kind !== "session") {
    if (options.write) throw new AuthorizationError("Mission share links are read-only; this action requires a named workspace identity.");
    throw new AuthenticationError("A private workspace session is required.");
  }
  if (options?.write && !scope.canWrite) throw new AuthorizationError("This mission link is view-only.");
  if (scope.kind === "session" && scope.authType === "api_key" && options?.write) {
    if (!options.apiCapability || !scope.apiCapabilities?.includes(options.apiCapability)) throw new AuthorizationError("This Runtime API key does not grant the required capability.");
  }
  return scope;
}

export async function createRuntimeApiKey(
  scope: Extract<StoreScope, { kind: "session" }>,
  input: { name: string; missionIds: string[]; capabilities: ApiCapability[]; expiresInDays: number },
) {
  assertWorkspaceAdmin(scope);
  const rawToken = `rly_${secureToken()}`;
  const tokenHash = hashToken(rawToken);
  const id = randomUUID();
  const expiresAt = expiresIn(input.expiresInDays);
  if (pool) {
    const missionRows = await pool.query("SELECT id FROM missions WHERE workspace_id=$1 AND id=ANY($2::uuid[])", [scope.workspaceId, input.missionIds]);
    if (missionRows.rowCount !== input.missionIds.length) throw new AuthorizationError("Every Runtime API key mission must belong to this Workspace.");
    await pool.query(
      `INSERT INTO runtime_api_keys (id,workspace_id,name,token_hash,allowed_mission_ids,capabilities,created_by,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, scope.workspaceId, input.name, tokenHash, input.missionIds, input.capabilities, scope.userId, expiresAt],
    );
  } else {
    memoryRuntimeKeys.set(tokenHash, { id, tokenHash, workspaceId: scope.workspaceId, userId: scope.userId, name: input.name, allowedMissionIds: input.missionIds, capabilities: input.capabilities, expiresAt });
  }
  return { id, token: rawToken, name: input.name, missionIds: input.missionIds, capabilities: input.capabilities, expiresAt };
}

export async function revokeRuntimeApiKey(scope: Extract<StoreScope, { kind: "session" }>, id: string) {
  assertWorkspaceAdmin(scope);
  if (pool) {
    const result = await pool.query("UPDATE runtime_api_keys SET revoked_at=now() WHERE id=$1 AND workspace_id=$2 AND revoked_at IS NULL RETURNING id", [id, scope.workspaceId]);
    if (!result.rowCount) throw Object.assign(new Error("Runtime API key not found."), { status: 404 });
  } else {
    const record = [...memoryRuntimeKeys.values()].find((item) => item.id === id && item.workspaceId === scope.workspaceId && !item.revokedAt);
    if (!record) throw Object.assign(new Error("Runtime API key not found."), { status: 404 });
    record.revokedAt = new Date().toISOString();
  }
  return { id, revoked: true as const };
}

export async function createMissionShare(input: { missionId: string; permission: "viewer" | "editor"; createdBy?: string }) {
  const rawToken = secureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = expiresIn(SHARE_DAYS);
  if (pool) {
    await pool.query(
      "INSERT INTO mission_shares (id, mission_id, token_hash, permission, created_by, expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [randomUUID(), input.missionId, tokenHash, input.permission, input.createdBy ?? null, expiresAt],
    );
  } else {
    memoryShares.set(tokenHash, { tokenHash, missionId: input.missionId, permission: input.permission, expiresAt });
  }
  return { token: rawToken, expiresAt, permission: input.permission };
}

export function enforceSameOrigin(request: Request) {
  const origin = request.header("Origin");
  if (!origin) return;
  const expected = `${request.protocol}://${request.get("host")}`;
  const forwarded = request.header("X-Forwarded-Host");
  const forwardedProto = request.header("X-Forwarded-Proto")?.split(",")[0]?.trim();
  const forwardedOrigin = forwarded ? `${forwardedProto || request.protocol}://${forwarded}` : undefined;
  if (origin !== expected && origin !== forwardedOrigin) throw new AuthorizationError("Cross-origin mutation rejected.");
}

export function canAccessMission(scope: StoreScope, missionId: string, workspaceId: string) {
  return scope.kind === "system"
    || (scope.kind === "session" && scope.workspaceId === workspaceId && (["owner", "admin"].includes(scope.workspaceRole) || scope.allowedMissionIds.includes(missionId)))
    || (scope.kind === "share" && scope.missionId === missionId);
}

export function assertWorkspaceAdmin(scope: Extract<StoreScope, { kind: "session" }>) {
  if (!["owner", "admin"].includes(scope.workspaceRole)) throw new AuthorizationError("This action requires a Workspace owner or admin.");
}

export function assertMissionAccess(scope: StoreScope, missionId: string, workspaceId: string) {
  if (!canAccessMission(scope, missionId, workspaceId)) {
    // Return 404 to avoid revealing whether a cross-tenant mission exists.
    const error = new Error("Mission not found.") as Error & { status: number };
    error.status = 404;
    throw error;
  }
}
