import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { pool } from "./db";

const SESSION_COOKIE = "relay_session";
const SESSION_DAYS = 30;
const SHARE_DAYS = 7;

export type StoreScope =
  | { kind: "session"; workspaceId: string; userId: string; actorName: string; canWrite: true }
  | { kind: "share"; missionId: string; actorName: string; canWrite: boolean }
  | { kind: "system"; actorName: string; canWrite: true };

export const systemScope: StoreScope = { kind: "system", actorName: "Relay System", canWrite: true };

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
  actorName: string;
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

function token() {
  return randomBytes(32).toString("base64url");
}

function hash(value: string) {
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
  const rawToken = token();
  const tokenHash = hash(rawToken);
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
      await client.query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)", [userId, actorName, `guest-${suffix}@relay.local`]);
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
    memorySessions.set(tokenHash, { tokenHash, userId, workspaceId, actorName, expiresAt });
  }

  return { rawToken, scope: { kind: "session", workspaceId, userId, actorName, canWrite: true } satisfies StoreScope, expiresAt, workspaceName };
}

async function resolveSession(rawToken: string): Promise<StoreScope | undefined> {
  const tokenHash = hash(rawToken);
  if (pool) {
    const result = await pool.query(
      `SELECT s.user_id, s.workspace_id, u.name
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.user_id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
      [tokenHash],
    );
    if (!result.rowCount) return undefined;
    const row = result.rows[0];
    return { kind: "session", workspaceId: row.workspace_id, userId: row.user_id, actorName: row.name, canWrite: true };
  }
  const record = memorySessions.get(tokenHash);
  if (!record || record.revokedAt || new Date(record.expiresAt).getTime() <= Date.now()) return undefined;
  return { kind: "session", workspaceId: record.workspaceId, userId: record.userId, actorName: record.actorName, canWrite: true };
}

async function resolveShare(rawToken: string): Promise<StoreScope | undefined> {
  const tokenHash = hash(rawToken);
  if (pool) {
    const result = await pool.query(
      "SELECT mission_id, permission FROM mission_shares WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()",
      [tokenHash],
    );
    if (!result.rowCount) return undefined;
    const row = result.rows[0];
    return { kind: "share", missionId: row.mission_id, actorName: "Shared collaborator", canWrite: row.permission === "editor" };
  }
  const record = memoryShares.get(tokenHash);
  if (!record || record.revokedAt || new Date(record.expiresAt).getTime() <= Date.now()) return undefined;
  return { kind: "share", missionId: record.missionId, actorName: "Shared collaborator", canWrite: record.permission === "editor" };
}

export async function resolveRequestScope(request: Request, options?: { sessionOnly?: boolean; write?: boolean }) {
  const shareToken = request.header("X-Relay-Share-Token");
  const sessionToken = cookieValue(request, SESSION_COOKIE);
  const scope = !options?.sessionOnly && shareToken
    ? await resolveShare(shareToken)
    : sessionToken
      ? await resolveSession(sessionToken)
      : undefined;
  if (!scope) throw new AuthenticationError("A private Relay session or valid mission link is required.");
  if (options?.sessionOnly && scope.kind !== "session") throw new AuthorizationError("This action requires a workspace session.");
  if (options?.write && !scope.canWrite) throw new AuthorizationError("This mission link is view-only.");
  return scope;
}

export async function createMissionShare(input: { missionId: string; permission: "viewer" | "editor"; createdBy?: string }) {
  const rawToken = token();
  const tokenHash = hash(rawToken);
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
    || (scope.kind === "session" && scope.workspaceId === workspaceId)
    || (scope.kind === "share" && scope.missionId === missionId);
}

export function assertMissionAccess(scope: StoreScope, missionId: string, workspaceId: string) {
  if (!canAccessMission(scope, missionId, workspaceId)) {
    // Return 404 to avoid revealing whether a cross-tenant mission exists.
    const error = new Error("Mission not found.") as Error & { status: number };
    error.status = 404;
    throw error;
  }
}
