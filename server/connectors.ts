import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { ConnectorConnection, ConnectorDescriptor } from "../shared/domain";
import { pool } from "./db";
import { contentHash } from "./execution";
import { hashToken, secureToken, type StoreScope } from "./security";
import { store } from "./store";
import { recordCollaborationEvent } from "./collaboration";

type ProviderKey = "google" | "slack" | "notion" | "github" | "figma";
type ProviderDefinition = {
  key: ProviderKey;
  label: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  baseScopes: string[];
  capabilityScopes: Record<string, string[]>;
  capabilities: string[];
  supportsPkce?: boolean;
};
type CredentialPayload = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope: string[];
  expiresAt?: string;
};
type MemoryConnection = ConnectorConnection & { workspaceId: string; credentials: CredentialPayload };
type MemoryState = { workspaceId: string; userId: string; missionId?: string; provider: ProviderKey; redirectAfter: string; redirectUri: string; verifier?: string; requestedCapabilities: string[]; requestedScopes: string[]; expiresAt: string };

const PROVIDERS: Record<ProviderKey, ProviderDefinition> = {
  google: {
    key: "google", label: "Google Workspace", clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID", clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", supportsPkce: true,
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"],
    baseScopes: ["openid", "email", "profile"],
    capabilityScopes: {
      "Drive: read selected files": ["https://www.googleapis.com/auth/drive.readonly"],
      "Gmail: read selected threads": ["https://www.googleapis.com/auth/gmail.readonly"],
      "Gmail: create draft": ["https://www.googleapis.com/auth/gmail.compose"],
      "Calendar: read events": ["https://www.googleapis.com/auth/calendar.readonly"],
      "Calendar: create review event": ["https://www.googleapis.com/auth/calendar.events"],
    },
    capabilities: ["Drive: read selected files", "Gmail: read selected threads", "Gmail: create draft", "Calendar: read events", "Calendar: create review event"],
  },
  slack: {
    key: "slack", label: "Slack", clientIdEnv: "SLACK_OAUTH_CLIENT_ID", clientSecretEnv: "SLACK_OAUTH_CLIENT_SECRET",
    authorizeUrl: "https://slack.com/oauth/v2/authorize", tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["channels:read", "channels:history", "groups:read", "groups:history", "chat:write"],
    baseScopes: [],
    capabilityScopes: {
      "Slack: read selected channels": ["channels:read", "channels:history", "groups:read", "groups:history"],
      "Slack: post internal update": ["chat:write"],
    },
    capabilities: ["Slack: read selected channels", "Slack: post internal update"],
  },
  notion: {
    key: "notion", label: "Notion", clientIdEnv: "NOTION_OAUTH_CLIENT_ID", clientSecretEnv: "NOTION_OAUTH_CLIENT_SECRET",
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize", tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [], baseScopes: [], capabilityScopes: { "Notion: read user-selected pages": [], "Notion: update mission page": [] }, capabilities: ["Notion: read user-selected pages", "Notion: update mission page"],
  },
  github: {
    key: "github", label: "GitHub", clientIdEnv: "GITHUB_OAUTH_CLIENT_ID", clientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
    authorizeUrl: "https://github.com/login/oauth/authorize", tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["read:user", "user:email", "repo"], baseScopes: ["read:user", "user:email"], capabilityScopes: { "GitHub: read mission repositories": ["repo"], "GitHub: create issue": ["repo"], "GitHub: comment on pull request": ["repo"] }, capabilities: ["GitHub: read mission repositories", "GitHub: create issue", "GitHub: comment on pull request"],
  },
  figma: {
    key: "figma", label: "Figma", clientIdEnv: "FIGMA_OAUTH_CLIENT_ID", clientSecretEnv: "FIGMA_OAUTH_CLIENT_SECRET",
    authorizeUrl: "https://www.figma.com/oauth", tokenUrl: "https://api.figma.com/v1/oauth/token", supportsPkce: true,
    scopes: ["current_user:read", "file_content:read", "file_comments:read", "file_comments:write"], baseScopes: ["current_user:read"], capabilityScopes: { "Figma: read mission files": ["file_content:read"], "Figma: read comments": ["file_comments:read"], "Figma: post review comment": ["file_comments:write"] }, capabilities: ["Figma: read mission files", "Figma: read comments", "Figma: post review comment"],
  },
};

const memoryConnections = new Map<string, MemoryConnection>();
const memoryStates = new Map<string, MemoryState>();
const now = () => new Date().toISOString();

export function connectorProviders() {
  return Object.values(PROVIDERS);
}

function provider(value: string) {
  const found = PROVIDERS[value.toLowerCase() as ProviderKey];
  if (!found) throw Object.assign(new Error("Unsupported connector provider."), { status: 404 });
  return found;
}

function vaultKey() {
  const secret = process.env.RELAY_VAULT_KEY;
  if (!secret) throw Object.assign(new Error("RELAY_VAULT_KEY is required before connector credentials can be stored."), { status: 503 });
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

function decrypt<T>(value: string): T {
  const [version, iv, tag, body] = value.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Credential vault payload is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")) as T;
}

function configuration(definition: ProviderDefinition) {
  return {
    clientId: process.env[definition.clientIdEnv],
    clientSecret: process.env[definition.clientSecretEnv],
    configured: Boolean(process.env[definition.clientIdEnv] && process.env[definition.clientSecretEnv] && process.env.RELAY_VAULT_KEY),
  };
}

function safeRedirect(path: string | undefined) {
  return path?.startsWith("/") && !path.startsWith("//") ? path : "/app";
}

function challenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function requestedAccess(definition: ProviderDefinition, requested: string[] | undefined) {
  const capabilities = requested?.length ? [...new Set(requested)] : definition.capabilities;
  const unsupported = capabilities.filter((capability) => !definition.capabilities.includes(capability));
  if (unsupported.length) throw Object.assign(new Error(`Unsupported ${definition.label} capabilities: ${unsupported.join(", ")}.`), { status: 400 });
  const scopes = [...new Set([...definition.baseScopes, ...capabilities.flatMap((capability) => definition.capabilityScopes[capability] ?? [])])];
  return { capabilities, scopes };
}

function canonicalCapability(providerName: string, capability: string) {
  if (capability.includes(":")) return capability;
  const prefix = providerName === "Google Drive" ? "Drive" : providerName === "Google Calendar" ? "Calendar" : providerName;
  return `${prefix}: ${capability}`;
}

function resourceAliases(value: string | undefined, providerKey: ProviderKey) {
  if (!value) return [];
  const aliases = new Set([value]);
  const patterns: Partial<Record<ProviderKey, RegExp[]>> = {
    google: [/\/d\/([\w-]+)/, /[?&]id=([\w-]+)/, /\/(?:d|folders|threads)\/([\w-]+)/, /[#/]([a-zA-Z0-9_-]{12,})$/],
    slack: [/\/archives\/([A-Z0-9]+)/i],
    notion: [/([a-f0-9]{32})(?:\?|$)/i],
    github: [/github\.com\/([^/]+\/[^/?#]+)/i],
    figma: [/figma\.com\/(?:file|design)\/([^/?#]+)/i],
  };
  for (const pattern of patterns[providerKey] ?? []) {
    const match = value.match(pattern)?.[1];
    if (match) aliases.add(match.replace(/\.git$/i, ""));
  }
  return [...aliases];
}

function form(input: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params;
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload: any;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok || payload.ok === false || payload.error_description) {
    const message = payload.error_description || payload.error?.message || payload.error || `Provider returned HTTP ${response.status}`;
    throw Object.assign(new Error(String(message)), { status: 502, providerStatus: response.status });
  }
  return payload;
}

function mapConnection(row: Record<string, any>): ConnectorConnection {
  return {
    id: row.id, provider: row.provider, accountId: row.account_id, accountLabel: row.account_label, status: row.status,
    grantedScopes: row.granted_scopes ?? [], expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at ?? undefined,
    verifiedAt: row.verified_at instanceof Date ? row.verified_at.toISOString() : row.verified_at ?? undefined, lastError: row.last_error ?? undefined,
  };
}

export async function listConnectorDescriptors(scope: Extract<StoreScope, { kind: "session" }>): Promise<ConnectorDescriptor[]> {
  const connections = !pool
    ? [...memoryConnections.values()].filter((item) => item.workspaceId === scope.workspaceId && ["owner", "admin"].includes(scope.workspaceRole))
    : (await pool.query(
      ["owner", "admin"].includes(scope.workspaceRole)
        ? "SELECT * FROM connector_connections WHERE workspace_id=$1 AND status<>'revoked' ORDER BY created_at DESC"
        : `SELECT DISTINCT cc.* FROM connector_connections cc JOIN access_manifests am ON am.connection_id=cc.id
           WHERE cc.workspace_id=$1 AND cc.status<>'revoked' AND am.mission_id=ANY($2::uuid[])
             AND am.revoked_at IS NULL AND am.expires_at>now() ORDER BY cc.created_at DESC`,
      ["owner", "admin"].includes(scope.workspaceRole) ? [scope.workspaceId] : [scope.workspaceId, scope.allowedMissionIds],
    )).rows.map(mapConnection);
  return Object.values(PROVIDERS).map((definition) => {
    const configured = configuration(definition).configured;
    return {
      provider: definition.key,
      label: definition.label,
      configured,
      capabilities: definition.capabilities,
      connections: connections.filter((connection) => connection.provider === definition.key),
      configurationHint: configured ? undefined : `Set ${definition.clientIdEnv}, ${definition.clientSecretEnv}, and RELAY_VAULT_KEY in Replit Secrets.`,
    };
  });
}

export async function beginOAuth(input: {
  provider: string;
  missionId?: string;
  requestedCapabilities?: string[];
  redirectAfter?: string;
  baseUrl: string;
  scope: Extract<StoreScope, { kind: "session" }>;
}) {
  const definition = provider(input.provider);
  const config = configuration(definition);
  if (!config.configured) throw Object.assign(new Error(`${definition.label} is not configured in this deployment.`), { status: 503, details: { requiredSecrets: [definition.clientIdEnv, definition.clientSecretEnv, "RELAY_VAULT_KEY"] } });
  if (input.missionId) await store.getMission(input.missionId, input.scope);
  const rawState = secureToken();
  const stateHash = hashToken(rawState);
  const redirectUri = `${input.baseUrl}/api/oauth/${definition.key}/callback`;
  const verifier = definition.supportsPkce ? secureToken() : undefined;
  const requested = requestedAccess(definition, input.requestedCapabilities);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1_000).toISOString();
  const state: MemoryState = { workspaceId: input.scope.workspaceId, userId: input.scope.userId, missionId: input.missionId, provider: definition.key, redirectAfter: safeRedirect(input.redirectAfter), redirectUri, verifier, requestedCapabilities: requested.capabilities, requestedScopes: requested.scopes, expiresAt };
  if (!pool) memoryStates.set(stateHash, state);
  else {
    await pool.query(
      `INSERT INTO oauth_states (id,workspace_id,user_id,mission_id,provider,state_hash,code_verifier_encrypted,redirect_after,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [randomUUID(), state.workspaceId, state.userId, state.missionId ?? null, state.provider, stateHash, encrypt({ verifier, redirectUri, requestedCapabilities: requested.capabilities, requestedScopes: requested.scopes }), state.redirectAfter, expiresAt],
    );
  }
  const params = new URLSearchParams({ client_id: config.clientId!, redirect_uri: redirectUri, state: rawState, response_type: "code" });
  if (requested.scopes.length) params.set("scope", definition.key === "slack" ? requested.scopes.join(",") : requested.scopes.join(" "));
  if (definition.key === "google") { params.set("access_type", "offline"); params.set("prompt", "consent"); params.set("include_granted_scopes", "true"); }
  if (definition.key === "notion") params.set("owner", "user");
  if (verifier) { params.set("code_challenge", challenge(verifier)); params.set("code_challenge_method", "S256"); }
  return { authorizeUrl: `${definition.authorizeUrl}?${params}`, provider: definition.key, requestedCapabilities: requested.capabilities, expiresAt };
}

async function consumeState(rawState: string, expectedProvider: ProviderKey) {
  const stateHash = hashToken(rawState);
  if (!pool) {
    const state = memoryStates.get(stateHash);
    if (!state || state.provider !== expectedProvider || new Date(state.expiresAt).getTime() <= Date.now()) throw Object.assign(new Error("OAuth state is invalid or expired."), { status: 410 });
    memoryStates.delete(stateHash);
    return state;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM oauth_states WHERE state_hash=$1 AND provider=$2 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE", [stateHash, expectedProvider]);
    if (!result.rowCount) throw Object.assign(new Error("OAuth state is invalid or expired."), { status: 410 });
    await client.query("UPDATE oauth_states SET consumed_at=now() WHERE id=$1", [result.rows[0].id]);
    await client.query("COMMIT");
    const payload = result.rows[0].code_verifier_encrypted ? decrypt<{ verifier?: string; redirectUri: string; requestedCapabilities?: string[]; requestedScopes?: string[] }>(result.rows[0].code_verifier_encrypted) : { redirectUri: "" };
    const definition = provider(result.rows[0].provider);
    const requested = requestedAccess(definition, payload.requestedCapabilities);
    return { workspaceId: result.rows[0].workspace_id, userId: result.rows[0].user_id, missionId: result.rows[0].mission_id ?? undefined, provider: result.rows[0].provider as ProviderKey, redirectAfter: result.rows[0].redirect_after, redirectUri: payload.redirectUri, verifier: payload.verifier, requestedCapabilities: requested.capabilities, requestedScopes: payload.requestedScopes ?? requested.scopes, expiresAt: result.rows[0].expires_at.toISOString() } satisfies MemoryState;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function exchangeCode(definition: ProviderDefinition, code: string, state: MemoryState): Promise<any> {
  const config = configuration(definition);
  const body = form({ code, redirect_uri: state.redirectUri, grant_type: "authorization_code", code_verifier: state.verifier });
  if (definition.key === "slack") {
    body.set("client_id", config.clientId!); body.set("client_secret", config.clientSecret!);
    return fetchJson(definition.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  }
  if (definition.key === "notion") {
    return fetchJson(definition.tokenUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "Notion-Version": "2026-03-11" }, body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: state.redirectUri }) });
  }
  if (definition.key === "figma") {
    return fetchJson(definition.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}` }, body });
  }
  if (definition.key === "github") {
    body.set("client_id", config.clientId!); body.set("client_secret", config.clientSecret!);
    return fetchJson(definition.tokenUrl, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body });
  }
  body.set("client_id", config.clientId!); body.set("client_secret", config.clientSecret!);
  return fetchJson(definition.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
}

async function providerIdentity(key: ProviderKey, accessToken: string, tokenPayload: any) {
  if (key === "google") {
    const profile = await fetchJson("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
    return { accountId: String(profile.sub), accountLabel: profile.email || profile.name || profile.sub };
  }
  if (key === "slack") {
    const profile = await fetchJson("https://slack.com/api/auth.test", { headers: { Authorization: `Bearer ${accessToken}` } });
    return { accountId: String(profile.team_id), accountLabel: profile.team || profile.team_id };
  }
  if (key === "notion") {
    if (tokenPayload.workspace_id || tokenPayload.bot_id) return { accountId: String(tokenPayload.workspace_id || tokenPayload.bot_id), accountLabel: tokenPayload.workspace_name || tokenPayload.owner?.user?.name || "Notion workspace" };
    const profile = await fetchJson("https://api.notion.com/v1/users/me", { headers: { Authorization: `Bearer ${accessToken}`, "Notion-Version": "2026-03-11" } });
    return { accountId: String(profile.bot?.workspace_id || profile.id), accountLabel: profile.bot?.workspace_name || profile.name || "Notion workspace" };
  }
  if (key === "github") {
    const profile = await fetchJson("https://api.github.com/user", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
    return { accountId: String(profile.id), accountLabel: profile.login };
  }
  const profile = await fetchJson("https://api.figma.com/v1/me", { headers: { Authorization: `Bearer ${accessToken}` } });
  return { accountId: String(profile.id), accountLabel: profile.email || profile.handle || profile.id };
}

export async function completeOAuth(input: { provider: string; state: string; code?: string; error?: string }) {
  const definition = provider(input.provider);
  const state = await consumeState(input.state, definition.key);
  try {
    if (input.error) throw Object.assign(new Error(`Provider authorization was not completed: ${input.error}`), { status: 400 });
    if (!input.code) throw Object.assign(new Error("OAuth callback did not include an authorization code."), { status: 400 });
    const tokenPayload = await exchangeCode(definition, input.code, state);
    const accessToken = tokenPayload.access_token;
    if (!accessToken) throw Object.assign(new Error(`${definition.label} did not return an access token.`), { status: 502 });
    const identity = await providerIdentity(definition.key, accessToken, tokenPayload);
    const scopes = String(tokenPayload.scope || tokenPayload.authed_user?.scope || state.requestedScopes.join(" ")).split(/[ ,]+/).filter(Boolean);
    const credentials: CredentialPayload = { accessToken, refreshToken: tokenPayload.refresh_token, tokenType: tokenPayload.token_type, scope: scopes, expiresAt: tokenPayload.expires_in ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1_000).toISOString() : undefined };
    let connection: ConnectorConnection;
    if (!pool) {
      const existing = [...memoryConnections.values()].find((item) => item.workspaceId === state.workspaceId && item.provider === definition.key && item.accountId === identity.accountId);
      connection = { id: existing?.id ?? randomUUID(), provider: definition.key, accountId: identity.accountId, accountLabel: identity.accountLabel, status: "connected", grantedScopes: scopes, expiresAt: credentials.expiresAt };
      memoryConnections.set(connection.id, { ...connection, workspaceId: state.workspaceId, credentials });
    } else {
      const result = await pool.query(
        `INSERT INTO connector_connections (id,workspace_id,provider,account_id,account_label,status,granted_scopes,encrypted_credentials,expires_at,created_by)
         VALUES ($1,$2,$3,$4,$5,'connected',$6,$7,$8,$9)
         ON CONFLICT (workspace_id,provider,account_id) DO UPDATE SET account_label=EXCLUDED.account_label,status='connected',granted_scopes=EXCLUDED.granted_scopes,encrypted_credentials=EXCLUDED.encrypted_credentials,expires_at=EXCLUDED.expires_at,last_error=NULL,updated_at=now()
         RETURNING *`,
        [randomUUID(), state.workspaceId, definition.key, identity.accountId, identity.accountLabel, scopes, encrypt(credentials), credentials.expiresAt ?? null, state.userId],
      );
      connection = mapConnection(result.rows[0]);
    }
    if (state.missionId) await recordCollaborationEvent({ missionId: state.missionId, actor: { type: "provider", name: definition.label }, eventType: "connector.connected", entityType: "connector_connection", entityId: connection.id, summary: `${definition.label} authorized ${identity.accountLabel}; capability verification is next.`, data: { provider: definition.key, grantedScopes: scopes } });
    return { connection, missionId: state.missionId, redirectAfter: state.redirectAfter };
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error("OAuth failed."), { redirectAfter: state.redirectAfter });
  }
}

async function rawConnection(connectionId: string, workspaceId: string) {
  if (!pool) {
    const connection = memoryConnections.get(connectionId);
    if (!connection || connection.workspaceId !== workspaceId) throw Object.assign(new Error("Connector connection not found."), { status: 404 });
    return { public: connection as ConnectorConnection, credentials: connection.credentials };
  }
  const result = await pool.query("SELECT * FROM connector_connections WHERE id=$1 AND workspace_id=$2 AND status<>'revoked'", [connectionId, workspaceId]);
  if (!result.rowCount) throw Object.assign(new Error("Connector connection not found."), { status: 404 });
  return { public: mapConnection(result.rows[0]), credentials: decrypt<CredentialPayload>(result.rows[0].encrypted_credentials) };
}

async function refreshIfNeeded(connectionId: string, workspaceId: string, definition: ProviderDefinition, credentials: CredentialPayload) {
  if (!credentials.expiresAt || new Date(credentials.expiresAt).getTime() > Date.now() + 60_000) return credentials;
  if (!credentials.refreshToken) throw Object.assign(new Error(`${definition.label} connection expired and must be reconnected.`), { status: 401 });
  const config = configuration(definition);
  let payload: any;
  if (definition.key === "figma") {
    payload = await fetchJson("https://api.figma.com/v1/oauth/refresh", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}` }, body: form({ refresh_token: credentials.refreshToken }) });
  } else if (definition.key === "notion") {
    payload = await fetchJson(definition.tokenUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "Notion-Version": "2026-03-11" }, body: JSON.stringify({ grant_type: "refresh_token", refresh_token: credentials.refreshToken }) });
  } else {
    payload = await fetchJson(definition.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: credentials.refreshToken, grant_type: "refresh_token" }) });
  }
  const updated: CredentialPayload = { accessToken: payload.access_token, refreshToken: payload.refresh_token || credentials.refreshToken, tokenType: payload.token_type || credentials.tokenType, scope: String(payload.scope || credentials.scope.join(" ")).split(/[ ,]+/).filter(Boolean), expiresAt: payload.expires_in ? new Date(Date.now() + Number(payload.expires_in) * 1_000).toISOString() : credentials.expiresAt };
  if (!pool) {
    const connection = memoryConnections.get(connectionId)!;
    connection.credentials = updated; connection.expiresAt = updated.expiresAt;
  } else {
    await pool.query("UPDATE connector_connections SET encrypted_credentials=$2,expires_at=$3,updated_at=now() WHERE id=$1", [connectionId, encrypt(updated), updated.expiresAt ?? null]);
  }
  return updated;
}

export async function getProviderCredential(connectionId: string, scope: Extract<StoreScope, { kind: "session" }>) {
  const raw = await rawConnection(connectionId, scope.workspaceId);
  const definition = provider(raw.public.provider);
  return { connection: raw.public, definition, credentials: await refreshIfNeeded(connectionId, scope.workspaceId, definition, raw.credentials) };
}

export async function verifyConnector(connectionId: string, missionId: string | undefined, scope: Extract<StoreScope, { kind: "session" }>) {
  if (missionId) await store.getMission(missionId, scope);
  const { connection, definition, credentials } = await getProviderCredential(connectionId, scope);
  const identity = await providerIdentity(definition.key, credentials.accessToken, {});
  if (identity.accountId !== connection.accountId) throw Object.assign(new Error("Provider identity changed; reconnect the intended workspace account."), { status: 409 });
  const verifiedAt = now();
  const verified: ConnectorConnection = { ...connection, status: "verified", verifiedAt, lastError: undefined };
  if (missionId) {
    const mission = await store.getMission(missionId, scope);
    const plan = mission.currentPlan;
    if (!plan) throw Object.assign(new Error("Compile the mission before granting provider capabilities."), { status: 409 });
    const aliases = definition.key === "google" ? ["Gmail", "Google Drive", "Google Calendar"] : [definition.label];
    const requirements = plan.accessBlueprint.filter((item) => aliases.includes(item.provider));
    const requiredCapabilities = [...new Set(requirements.flatMap((requirement) => requirement.capabilities.map((capability) => canonicalCapability(requirement.provider, capability))))];
    const missingCapabilities = requiredCapabilities.filter((capability) => {
      const neededScopes = definition.capabilityScopes[capability];
      return !neededScopes || neededScopes.some((requiredScope) => !credentials.scope.includes(requiredScope));
    });
    if (missingCapabilities.length) throw Object.assign(new Error(`Reconnect ${definition.label} and approve the capabilities this Plan requires: ${missingCapabilities.join(", ")}.`), { status: 409, details: { missingCapabilities } });
    if (!pool) memoryConnections.set(connectionId, { ...memoryConnections.get(connectionId)!, ...verified });
    else await pool.query("UPDATE connector_connections SET status='verified',verified_at=now(),last_error=NULL,updated_at=now() WHERE id=$1", [connectionId]);
    const sourceResources = mission.sources
      .filter((source) => aliases.includes(source.type) || (definition.key === "google" && ((source.type === "Email" && aliases.includes("Gmail")) || (source.type === "Calendar" && aliases.includes("Google Calendar")))))
      .flatMap((source) => [...resourceAliases(source.evidenceUrl, definition.key), ...resourceAliases(source.title, definition.key)]);
    const allowedResources = [...new Set([...sourceResources, `mission:${missionId}:drafts`])];
    if (pool) {
      for (const requirement of requirements) {
        const manifest = { missionId, planVersion: plan.version, provider: requirement.provider, connectionId, capabilities: requirement.capabilities, resources: allowedResources, forbiddenActions: plan.tasks.flatMap((task) => task.forbiddenActions) };
        await pool.query(
          `INSERT INTO access_manifests (id,mission_id,plan_version_id,connection_id,provider,granted_capabilities,allowed_resources,forbidden_actions,approved_by,expires_at,manifest_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [randomUUID(), missionId, plan.id, connectionId, requirement.provider, JSON.stringify(requirement.capabilities), JSON.stringify(allowedResources), JSON.stringify(manifest.forbiddenActions), scope.userId, new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(), contentHash(manifest)],
        );
        await pool.query("UPDATE access_blueprints SET status='verified',expiration=now()+interval '30 days' WHERE id=$1", [requirement.id]);
      }
    }
    await recordCollaborationEvent({ missionId, actor: { type: "provider", name: definition.label }, eventType: "connector.verified", entityType: "connector_connection", entityId: connectionId, summary: `${definition.label} passed a live identity and capability check.`, data: { accountLabel: identity.accountLabel, planVersion: plan.version, capabilityCount: requirements.reduce((sum, item) => sum + item.capabilities.length, 0) } });
  } else if (!pool) memoryConnections.set(connectionId, { ...memoryConnections.get(connectionId)!, ...verified });
  else await pool.query("UPDATE connector_connections SET status='verified',verified_at=now(),last_error=NULL,updated_at=now() WHERE id=$1", [connectionId]);
  return verified;
}

export async function revokeConnector(connectionId: string, scope: Extract<StoreScope, { kind: "session" }>) {
  const { connection, definition, credentials } = await getProviderCredential(connectionId, scope);
  try {
    if (definition.key === "google") await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ token: credentials.accessToken }) });
    if (definition.key === "slack") await fetchJson("https://slack.com/api/auth.revoke", { method: "POST", headers: { Authorization: `Bearer ${credentials.accessToken}` } });
  } finally {
    if (!pool) { const item = memoryConnections.get(connectionId); if (item) item.status = "revoked"; }
    else {
      await pool.query("UPDATE connector_connections SET status='revoked',encrypted_credentials=$2,updated_at=now() WHERE id=$1 AND workspace_id=$3", [connectionId, encrypt({ revokedAt: now() }), scope.workspaceId]);
      await pool.query("UPDATE access_manifests SET revoked_at=now() WHERE connection_id=$1 AND revoked_at IS NULL", [connectionId]);
    }
  }
  return { id: connection.id, status: "revoked" as const };
}
