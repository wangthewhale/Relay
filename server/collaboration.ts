import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type {
  AuthorityEdge,
  CollaborationEvent,
  MissionComment,
  MissionMember,
  Presence,
  MissionInvitePreview,
  RelayUser,
  TaskHandoff,
} from "../shared/domain";
import { pool } from "./db";
import { store } from "./store";
import {
  createSessionForIdentity,
  hashToken,
  secureToken,
  type StoreScope,
} from "./security";

type Actor = {
  type: CollaborationEvent["actorType"];
  id?: string;
  name: string;
};

type EventInput = {
  missionId: string;
  actor: Actor;
  eventType: string;
  entityType: string;
  entityId?: string;
  summary: string;
  data?: Record<string, unknown>;
  planVersion?: number;
};

type RoomState = {
  revision: number;
  members: MissionMember[];
  presence: Presence[];
  comments: MissionComment[];
  handoffs: TaskHandoff[];
  events: CollaborationEvent[];
  authorityGraph: AuthorityEdge[];
};

type MemoryInvite = {
  tokenHash: string;
  workspaceId: string;
  missionId: string;
  email: string;
  name: string;
  title?: string;
  department?: string;
  workspaceRole: "admin" | "member" | "viewer";
  missionRole: MissionMember["role"];
  invitedByName: string;
  expiresAt: string;
  acceptedAt?: string;
};

type MemoryRoom = RoomState & {
  memberById: Map<string, MissionMember>;
  presenceByConnection: Map<string, Presence>;
};

const now = () => new Date().toISOString();
const eventBus = new EventEmitter();
eventBus.setMaxListeners(1_000);
const memoryRooms = new Map<string, MemoryRoom>();
const memoryInvites = new Map<string, MemoryInvite>();
let memorySequence = 0;
let listenerReady: Promise<void> | undefined;

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function relayUserFromScope(scope: Extract<StoreScope, { kind: "session" }>): RelayUser {
  return {
    id: scope.userId,
    name: scope.actorName,
    email: scope.email ?? `${scope.userId}@relay.local`,
    title: scope.title,
    department: scope.department,
    identitySource: scope.identityVerified ? "invite" : "relay_session",
    identityVerified: scope.identityVerified,
  };
}

async function memoryRoom(missionId: string, scope: StoreScope): Promise<MemoryRoom> {
  let room = memoryRooms.get(missionId);
  if (!room) {
    const mission = await store.getMission(missionId, scope);
    room = {
      revision: 1,
      members: [],
      memberById: new Map(),
      presence: [],
      presenceByConnection: new Map(),
      comments: [],
      handoffs: [],
      events: [],
      authorityGraph: [],
    };
    memoryRooms.set(missionId, room);
    if (scope.kind === "session") {
      const user = relayUserFromScope(scope);
      const member: MissionMember = { user, role: "owner", responsibility: "Mission outcome", joinedAt: mission.createdAt };
      room.memberById.set(user.id, member);
      room.members = [...room.memberById.values()];
      room.authorityGraph.push({
        id: randomUUID(),
        subjectUserId: user.id,
        subjectName: user.name,
        scopeType: "mission",
        scopeValue: missionId,
        authorityLevel: 5,
        canApproveRisk: 4,
        validFrom: mission.createdAt,
      });
    }
  } else if (scope.kind === "session" && !room.memberById.has(scope.userId)) {
    const member: MissionMember = { user: relayUserFromScope(scope), role: "contributor", responsibility: "Mission collaborator", joinedAt: now() };
    room.memberById.set(scope.userId, member);
    room.members = [...room.memberById.values()];
  }
  return room;
}

function mapEvent(row: Record<string, any>): CollaborationEvent {
  return {
    sequence: Number(row.sequence),
    id: row.id,
    missionId: row.mission_id,
    planVersion: row.plan_version ?? undefined,
    missionRevision: Number(row.mission_revision),
    actorType: row.actor_type,
    actorId: row.actor_id ?? undefined,
    actorName: row.actor_name,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id ?? undefined,
    summary: row.summary,
    data: row.data ?? {},
    createdAt: toIso(row.created_at)!,
  };
}

async function ensurePgListener() {
  if (!pool || listenerReady) return listenerReady;
  listenerReady = (async () => {
    const client = await pool.connect();
    client.on("notification", async (message) => {
      if (message.channel !== "relay_mission_events" || !message.payload) return;
      try {
        const payload = JSON.parse(message.payload) as { missionId: string; sequence: number };
        const result = await pool!.query("SELECT * FROM collaboration_events WHERE mission_id = $1 AND sequence = $2", [payload.missionId, payload.sequence]);
        if (result.rowCount) eventBus.emit(payload.missionId, mapEvent(result.rows[0]));
      } catch (error) {
        console.error("Relay event listener could not deliver a collaboration event.", error);
      }
    });
    client.on("error", (error) => {
      console.error("Relay collaboration LISTEN connection failed.", error);
      listenerReady = undefined;
      client.release();
      setTimeout(() => void ensurePgListener(), 1_000).unref();
    });
    await client.query("LISTEN relay_mission_events");
  })();
  return listenerReady;
}

async function ensurePostgresRoom(missionId: string, scope: StoreScope, makeOwner = false) {
  const mission = await store.getMission(missionId, scope);
  if (scope.kind !== "session") return mission;
  const ownership = await pool!.query(
    `SELECT wm.role,
      (SELECT count(*)::int FROM mission_members WHERE mission_id=$1) AS member_count
     FROM missions m JOIN workspace_members wm ON wm.workspace_id=m.workspace_id AND wm.user_id=$2
     WHERE m.id=$1`,
    [missionId, scope.userId],
  );
  const workspaceRole = ownership.rows[0]?.role as string | undefined;
  const hasNoMissionMembers = Number(ownership.rows[0]?.member_count ?? 0) === 0;
  const effectiveOwner = makeOwner || (hasNoMissionMembers && ["owner", "admin"].includes(workspaceRole ?? ""));
  await pool!.query(
    `INSERT INTO mission_members (mission_id, user_id, role, responsibility)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (mission_id, user_id) DO UPDATE SET
       role=CASE WHEN $5::boolean THEN 'owner' ELSE mission_members.role END,
       responsibility=CASE WHEN $5::boolean THEN 'Mission outcome' ELSE mission_members.responsibility END`,
    [missionId, scope.userId, effectiveOwner ? "owner" : "contributor", effectiveOwner ? "Mission outcome" : "Mission collaborator", effectiveOwner],
  );
  const membership = await pool!.query("SELECT role FROM mission_members WHERE mission_id=$1 AND user_id=$2", [missionId, scope.userId]);
  const role = membership.rows[0]?.role as MissionMember["role"] | undefined;
  if (role === "owner" || role === "decision_maker") {
    await pool!.query(
      `INSERT INTO authority_edges (id, workspace_id, subject_user_id, scope_type, scope_value, authority_level, can_approve_risk)
       SELECT $1,$2,$3,'mission',$4,$5,$6
       WHERE NOT EXISTS (
         SELECT 1 FROM authority_edges WHERE workspace_id=$2 AND subject_user_id=$3 AND scope_type='mission' AND scope_value=$4 AND superseded_by IS NULL
       )`,
      [randomUUID(), scope.workspaceId, scope.userId, missionId, role === "owner" ? 5 : 4, role === "owner" ? 4 : 3],
    );
  }
  return mission;
}

export async function initializeMissionRoom(missionId: string, scope: StoreScope, makeOwner = false) {
  if (pool) await ensurePostgresRoom(missionId, scope, makeOwner);
  else await memoryRoom(missionId, scope);
}

export async function assertDecisionAuthority(
  missionId: string,
  scope: Extract<StoreScope, { kind: "session" }>,
  requiredRisk = 2,
) {
  await initializeMissionRoom(missionId, scope);
  if (!pool) {
    const room = await memoryRoom(missionId, scope);
    const member = room.memberById.get(scope.userId);
    const authority = room.authorityGraph.find((edge) => edge.subjectUserId === scope.userId && edge.scopeType === "mission" && edge.scopeValue === missionId);
    if (!member || !["owner", "decision_maker"].includes(member.role) || !authority || authority.canApproveRisk < requiredRisk) {
      throw Object.assign(new Error(`This action requires a named Mission decision maker with authority through risk level ${requiredRisk}.`), { status: 403 });
    }
    return authority;
  }
  const result = await pool.query(
    `SELECT ae.* FROM mission_members mm
     JOIN missions m ON m.id=mm.mission_id
     JOIN authority_edges ae ON ae.workspace_id=m.workspace_id AND ae.subject_user_id=mm.user_id
       AND ae.scope_type='mission' AND ae.scope_value=mm.mission_id::text
     WHERE mm.mission_id=$1 AND mm.user_id=$2 AND mm.role IN ('owner','decision_maker')
       AND ae.superseded_by IS NULL AND (ae.valid_until IS NULL OR ae.valid_until>now())
       AND ae.can_approve_risk >= $3
     ORDER BY ae.authority_level DESC LIMIT 1`,
    [missionId, scope.userId, requiredRisk],
  );
  if (!result.rowCount) throw Object.assign(new Error(`This action requires a named Mission decision maker with authority through risk level ${requiredRisk}.`), { status: 403 });
  return result.rows[0];
}

export async function recordCollaborationEvent(input: EventInput): Promise<CollaborationEvent> {
  if (!pool) {
    const room = memoryRooms.get(input.missionId);
    if (!room) throw new Error("Mission room is not initialized.");
    room.revision += 1;
    const event: CollaborationEvent = {
      sequence: ++memorySequence,
      id: randomUUID(),
      missionId: input.missionId,
      planVersion: input.planVersion,
      missionRevision: room.revision,
      actorType: input.actor.type,
      actorId: input.actor.id,
      actorName: input.actor.name,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      data: input.data ?? {},
      createdAt: now(),
    };
    room.events.unshift(event);
    room.events = room.events.slice(0, 250);
    eventBus.emit(input.missionId, event);
    return event;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const revision = await client.query("UPDATE missions SET revision = revision + 1, updated_at = now() WHERE id = $1 RETURNING revision, current_plan_version", [input.missionId]);
    if (!revision.rowCount) throw new Error("Mission not found.");
    const eventResult = await client.query(
      `INSERT INTO collaboration_events
       (id, mission_id, plan_version, mission_revision, actor_type, actor_id, actor_name, event_type, entity_type, entity_id, summary, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        randomUUID(), input.missionId, input.planVersion ?? revision.rows[0].current_plan_version ?? null,
        revision.rows[0].revision, input.actor.type, input.actor.id ?? null, input.actor.name, input.eventType,
        input.entityType, input.entityId ?? null, input.summary, JSON.stringify(input.data ?? {}),
      ],
    );
    await client.query("COMMIT");
    return mapEvent(eventResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getEvents(missionId: string, scope: StoreScope, afterSequence = 0, limit = 100) {
  await initializeMissionRoom(missionId, scope);
  if (!pool) {
    const room = await memoryRoom(missionId, scope);
    return room.events.filter((event) => event.sequence > afterSequence).slice(0, limit).reverse();
  }
  const result = await pool.query(
    "SELECT * FROM collaboration_events WHERE mission_id=$1 AND sequence>$2 ORDER BY sequence ASC LIMIT $3",
    [missionId, afterSequence, Math.min(limit, 250)],
  );
  return result.rows.map(mapEvent);
}

export async function subscribeToMission(missionId: string, scope: StoreScope, listener: (event: CollaborationEvent) => void) {
  await initializeMissionRoom(missionId, scope);
  await ensurePgListener();
  eventBus.on(missionId, listener);
  return () => eventBus.off(missionId, listener);
}

export async function heartbeatPresence(
  missionId: string,
  scope: Extract<StoreScope, { kind: "session" }>,
  input: { connectionId: string; state: Presence["state"]; cursorContext?: string },
) {
  await initializeMissionRoom(missionId, scope);
  if (!pool) {
    const room = await memoryRoom(missionId, scope);
    const presence: Presence = { userId: scope.userId, connectionId: input.connectionId, state: input.state, cursorContext: input.cursorContext, lastSeenAt: now() };
    room.presenceByConnection.set(input.connectionId, presence);
    room.presence = [...room.presenceByConnection.values()].filter((item) => Date.now() - new Date(item.lastSeenAt).getTime() < 45_000);
    return presence;
  }
  const result = await pool.query(
    `INSERT INTO mission_presence (mission_id,user_id,connection_id,state,cursor_context,last_seen_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (mission_id,user_id,connection_id) DO UPDATE SET state=EXCLUDED.state,cursor_context=EXCLUDED.cursor_context,last_seen_at=now()
     RETURNING *`,
    [missionId, scope.userId, input.connectionId, input.state, input.cursorContext ?? null],
  );
  return { userId: result.rows[0].user_id, connectionId: result.rows[0].connection_id, state: result.rows[0].state, cursorContext: result.rows[0].cursor_context ?? undefined, lastSeenAt: toIso(result.rows[0].last_seen_at)! } satisfies Presence;
}

export async function addComment(
  missionId: string,
  scope: Extract<StoreScope, { kind: "session" }>,
  input: { body: string; mentions: string[]; taskId?: string; conflictId?: string; parentId?: string },
) {
  await initializeMissionRoom(missionId, scope);
  const mission = await store.getMission(missionId, scope);
  if (input.taskId && !mission.currentPlan?.tasks.some((task) => task.id === input.taskId)) throw Object.assign(new Error("Comment task is not part of the active Mission plan."), { status: 409 });
  if (input.conflictId && !mission.conflicts.some((conflict) => conflict.id === input.conflictId)) throw Object.assign(new Error("Comment conflict is not part of this Mission."), { status: 409 });
  const roomState = await getRoomState(missionId, scope);
  if (input.mentions.some((userId) => !roomState.members.some((member) => member.user.id === userId))) throw Object.assign(new Error("Every mentioned teammate must be a member of this Mission."), { status: 400 });
  let comment: MissionComment;
  if (!pool) {
    const room = await memoryRoom(missionId, scope);
    comment = { id: randomUUID(), missionId, author: relayUserFromScope(scope), body: input.body, mentions: input.mentions, taskId: input.taskId, conflictId: input.conflictId, parentId: input.parentId, createdAt: now(), updatedAt: now() };
    room.comments.unshift(comment);
  } else {
    const result = await pool.query(
      `INSERT INTO mission_comments (id,mission_id,author_user_id,body,mentions,task_id,conflict_id,parent_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [randomUUID(), missionId, scope.userId, input.body, input.mentions, input.taskId ?? null, input.conflictId ?? null, input.parentId ?? null],
    );
    const row = result.rows[0];
    comment = { id: row.id, missionId, author: relayUserFromScope(scope), body: row.body, mentions: row.mentions ?? [], taskId: row.task_id ?? undefined, conflictId: row.conflict_id ?? undefined, parentId: row.parent_id ?? undefined, createdAt: toIso(row.created_at)!, updatedAt: toIso(row.updated_at)! };
  }
  await recordCollaborationEvent({ missionId, actor: { type: "human", id: scope.userId, name: scope.actorName }, eventType: "comment.created", entityType: "comment", entityId: comment.id, summary: `${scope.actorName} added mission context.`, data: { body: input.body, mentions: input.mentions, taskId: input.taskId } });
  return comment;
}

export async function createHandoff(
  missionId: string,
  scope: Extract<StoreScope, { kind: "session" }>,
  input: { taskId: string; toUserId?: string; toAgentId?: string; reason: string; checkpoint: Record<string, unknown> },
) {
  await initializeMissionRoom(missionId, scope);
  const mission = await store.getMission(missionId, scope);
  if (!mission.currentPlan?.tasks.some((task) => task.id === input.taskId)) throw Object.assign(new Error("Handoff task is not part of the active Mission plan."), { status: 409 });
  const roomState = await getRoomState(missionId, scope);
  if (input.toUserId && !roomState.members.some((member) => member.user.id === input.toUserId)) throw Object.assign(new Error("Handoff recipient is not a member of this Mission."), { status: 400 });
  if (input.toAgentId) {
    const agentExists = pool
      ? Boolean((await pool.query("SELECT 1 FROM agents WHERE id=$1 AND mission_id=$2", [input.toAgentId, missionId])).rowCount)
      : false;
    if (!agentExists) throw Object.assign(new Error("Handoff Agent is not registered for this Mission."), { status: 400 });
  }
  let handoff: TaskHandoff;
  if (!pool) {
    const room = await memoryRoom(missionId, scope);
    handoff = { id: randomUUID(), taskId: input.taskId, fromUserId: scope.userId, toUserId: input.toUserId, toAgentId: input.toAgentId, reason: input.reason, checkpoint: input.checkpoint, status: "offered", createdAt: now() };
    room.handoffs.unshift(handoff);
  } else {
    const result = await pool.query(
      `INSERT INTO task_handoffs (id,mission_id,task_id,from_user_id,to_user_id,to_agent_id,reason,checkpoint,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'offered') RETURNING *`,
      [randomUUID(), missionId, input.taskId, scope.userId, input.toUserId ?? null, input.toAgentId ?? null, input.reason, JSON.stringify(input.checkpoint)],
    );
    const row = result.rows[0];
    handoff = { id: row.id, taskId: row.task_id, fromUserId: row.from_user_id ?? undefined, toUserId: row.to_user_id ?? undefined, toAgentId: row.to_agent_id ?? undefined, reason: row.reason, checkpoint: row.checkpoint ?? {}, status: row.status, createdAt: toIso(row.created_at)! };
  }
  await recordCollaborationEvent({ missionId, actor: { type: "human", id: scope.userId, name: scope.actorName }, eventType: "task.handoff_offered", entityType: "handoff", entityId: handoff.id, summary: `${scope.actorName} handed off a task with its checkpoint.`, data: { taskId: input.taskId, toUserId: input.toUserId, toAgentId: input.toAgentId, reason: input.reason } });
  return handoff;
}

export async function createMissionInvite(
  missionId: string,
  scope: Extract<StoreScope, { kind: "session" }>,
  input: { email: string; name: string; title?: string; department?: string; workspaceRole: "admin" | "member" | "viewer"; missionRole: MissionMember["role"] },
) {
  await initializeMissionRoom(missionId, scope);
  await assertDecisionAuthority(missionId, scope, 2);
  const rawToken = secureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
  if (!pool) {
    memoryInvites.set(tokenHash, { tokenHash, workspaceId: scope.workspaceId, missionId, email: input.email, name: input.name, title: input.title, department: input.department, workspaceRole: input.workspaceRole, missionRole: input.missionRole, invitedByName: scope.actorName, expiresAt });
  } else {
    await pool.query(
      `INSERT INTO workspace_invites (id,workspace_id,mission_id,email,name,title,department,workspace_role,mission_role,token_hash,invited_by,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [randomUUID(), scope.workspaceId, missionId, input.email.toLowerCase(), input.name, input.title || null, input.department || null, input.workspaceRole, input.missionRole, tokenHash, scope.userId, expiresAt],
    );
  }
  await recordCollaborationEvent({ missionId, actor: { type: "human", id: scope.userId, name: scope.actorName }, eventType: "member.invited", entityType: "invite", summary: `${input.name} was invited as ${input.department || "team"} ${input.missionRole}.`, data: { name: input.name, department: input.department, missionRole: input.missionRole } });
  return { token: rawToken, expiresAt, invitee: { name: input.name, email: input.email, title: input.title, department: input.department, missionRole: input.missionRole } };
}

export async function previewMissionInvite(rawToken: string): Promise<MissionInvitePreview> {
  const tokenHash = hashToken(rawToken);
  const invite = !pool
    ? memoryInvites.get(tokenHash)
    : (await pool.query(
        `SELECT wi.*, COALESCE(u.name, 'A teammate') AS invited_by_name
         FROM workspace_invites wi
         LEFT JOIN users u ON u.id=wi.invited_by
         WHERE wi.token_hash=$1 AND wi.accepted_at IS NULL AND wi.revoked_at IS NULL AND wi.expires_at>now()`,
        [tokenHash],
      )).rows[0];
  if (!invite || invite.acceptedAt || invite.accepted_at) throw Object.assign(new Error("Invite is invalid or expired."), { status: 410 });
  const missionId = invite.missionId ?? invite.mission_id;
  const mission = await store.getMission(missionId, { kind: "share", missionId, actorName: "Invited teammate", canWrite: false });
  const missionRole = (invite.missionRole ?? invite.mission_role) as MissionMember["role"];
  const openConflicts = mission.conflicts.filter((conflict) => conflict.status === "open");
  const waitingAgentTasks = mission.currentPlan?.tasks.filter((task) => task.ownerType === "agent" && task.status !== "completed" && task.status !== "failed").length ?? 0;
  const action = missionRole === "owner" || missionRole === "decision_maker"
    ? {
        en: openConflicts.length ? `Review ${openConflicts.length} open ${openConflicts.length === 1 ? "decision" : "decisions"} and choose the instruction the team should follow.` : "Review any exact external action that needs your authority.",
        zhTW: openConflicts.length ? `確認 ${openConflicts.length} 項待決定問題，選出團隊真正要採用的指令。` : "檢查需要你權限的精確外部操作。",
      }
    : missionRole === "observer"
      ? { en: "Read the recap and follow progress. Relay will ask only if your context is needed.", zhTW: "先看完整摘要並追蹤進度；只有需要你的脈絡時 Relay 才會找你。" }
      : { en: "Check that Relay understood your area, then add any missing constraint or evidence.", zhTW: "確認 Relay 是否理解你的範圍，再補上缺少的限制或證據。" };
  const voices = mission.sources.slice(0, 4).map((source) => ({
    author: source.author,
    sourceType: source.type,
    statement: mission.assertions.find((assertion) => assertion.sourceId === source.id)?.statement ?? source.content.slice(0, 320),
  }));
  return {
    expiresAt: toIso(invite.expiresAt ?? invite.expires_at)!,
    inviterName: invite.invitedByName ?? invite.invited_by_name ?? "A teammate",
    invitee: {
      name: invite.name,
      email: invite.email,
      title: invite.title ?? undefined,
      department: invite.department ?? undefined,
      missionRole,
    },
    mission: {
      id: mission.id,
      title: mission.title,
      objective: mission.objective,
      successMetric: mission.successMetric,
      status: mission.status,
      currentPlanVersion: mission.currentPlanVersion,
      openConflicts: mission.openConflicts,
      pendingApprovals: mission.pendingApprovals,
      waitingAgentTasks,
    },
    recap: {
      whatHappened: {
        en: `Relay reconciled ${mission.sources.length} sources, found ${openConflicts.length} open decisions and paused ${waitingAgentTasks} Agent tasks safely.`,
        zhTW: `Relay 已整理 ${mission.sources.length} 個來源、找出 ${openConflicts.length} 項待決定問題，並安全暫停 ${waitingAgentTasks} 個 Agent 任務。`,
      },
      whatYouNeedToDo: action,
      voices,
      decisions: openConflicts.slice(0, 3).map((conflict) => ({ title: conflict.title, summary: conflict.summary, decisionOwner: conflict.decisionOwner })),
    },
  };
}

export async function acceptMissionInvite(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  if (!pool) {
    const invite = memoryInvites.get(tokenHash);
    if (!invite || invite.acceptedAt || new Date(invite.expiresAt).getTime() <= Date.now()) throw Object.assign(new Error("Invite is invalid or expired."), { status: 410 });
    const userId = randomUUID();
    invite.acceptedAt = now();
    const session = await createSessionForIdentity({ userId, workspaceId: invite.workspaceId, workspaceRole: invite.workspaceRole, allowedMissionIds: [invite.missionId], actorName: invite.name, email: invite.email, title: invite.title, department: invite.department, identityVerified: true });
    const room = memoryRooms.get(invite.missionId);
    if (room) {
      const user: RelayUser = { id: userId, name: invite.name, email: invite.email, title: invite.title, department: invite.department, identitySource: "invite", identityVerified: true };
      room.memberById.set(userId, { user, role: invite.missionRole, responsibility: `${invite.department ?? "Team"} collaborator`, joinedAt: now() });
      room.members = [...room.memberById.values()];
      if (invite.missionRole === "decision_maker" || invite.missionRole === "owner") room.authorityGraph.push({ id: randomUUID(), subjectUserId: userId, subjectName: invite.name, scopeType: "mission", scopeValue: invite.missionId, authorityLevel: invite.missionRole === "owner" ? 5 : 4, canApproveRisk: invite.missionRole === "owner" ? 4 : 3, validFrom: now() });
    }
    await recordCollaborationEvent({ missionId: invite.missionId, actor: { type: "human", id: userId, name: invite.name }, eventType: "member.joined", entityType: "mission_member", summary: `${invite.name} joined the live mission room.`, data: { department: invite.department, missionRole: invite.missionRole } });
    return { ...session, missionId: invite.missionId };
  }
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const inviteResult = await client.query("SELECT * FROM workspace_invites WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE", [tokenHash]);
    if (!inviteResult.rowCount) throw Object.assign(new Error("Invite is invalid or expired."), { status: 410 });
    const invite = inviteResult.rows[0];
    const userResult = await client.query(
      `INSERT INTO users (id,name,email,title,department,identity_source,identity_verified_at)
       VALUES ($1,$2,$3,$4,$5,'invite',now())
       ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name,title=EXCLUDED.title,department=EXCLUDED.department,identity_source='invite',identity_verified_at=now()
       RETURNING *`,
      [randomUUID(), invite.name, invite.email, invite.title, invite.department],
    );
    const user = userResult.rows[0];
    await client.query("INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,$2,$3) ON CONFLICT (workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role", [invite.workspace_id, user.id, invite.workspace_role]);
    await client.query("INSERT INTO mission_members (mission_id,user_id,role,responsibility) VALUES ($1,$2,$3,$4) ON CONFLICT (mission_id,user_id) DO UPDATE SET role=EXCLUDED.role", [invite.mission_id, user.id, invite.mission_role, `${invite.department ?? "Team"} collaborator`]);
    if (invite.mission_role === "decision_maker" || invite.mission_role === "owner") {
      await client.query(
        `INSERT INTO authority_edges (id,workspace_id,subject_user_id,scope_type,scope_value,authority_level,can_approve_risk)
         VALUES ($1,$2,$3,'mission',$4,$5,$6)
         ON CONFLICT DO NOTHING`,
        [randomUUID(), invite.workspace_id, user.id, invite.mission_id, invite.mission_role === "owner" ? 5 : 4, invite.mission_role === "owner" ? 4 : 3],
      );
    }
    await client.query("UPDATE workspace_invites SET accepted_at=now() WHERE id=$1", [invite.id]);
    await client.query("COMMIT");
    committed = true;
    const session = await createSessionForIdentity({ userId: user.id, workspaceId: invite.workspace_id, workspaceRole: invite.workspace_role, allowedMissionIds: [invite.mission_id], actorName: user.name, email: user.email, title: user.title ?? undefined, department: user.department ?? undefined, identityVerified: true });
    await recordCollaborationEvent({ missionId: invite.mission_id, actor: { type: "human", id: user.id, name: user.name }, eventType: "member.joined", entityType: "mission_member", summary: `${user.name} joined the live mission room.`, data: { department: user.department, missionRole: invite.mission_role } });
    return { ...session, missionId: invite.mission_id };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getRoomState(missionId: string, scope: StoreScope, eventLimit = 80): Promise<RoomState> {
  const mission = pool ? await ensurePostgresRoom(missionId, scope) : await store.getMission(missionId, scope);
  if (!pool) {
    const room = await memoryRoom(missionId, scope);
    room.presence = [...room.presenceByConnection.values()].filter((item) => Date.now() - new Date(item.lastSeenAt).getTime() < 45_000);
    return { revision: room.revision, members: room.members, presence: room.presence, comments: room.comments, handoffs: room.handoffs, events: room.events.slice(0, eventLimit).reverse(), authorityGraph: room.authorityGraph };
  }
  const [revision, memberRows, presenceRows, commentRows, handoffRows, eventRows, authorityRows] = await Promise.all([
    pool.query("SELECT revision FROM missions WHERE id=$1", [missionId]),
    pool.query(`SELECT mm.role,mm.responsibility,mm.joined_at,u.id,u.name,u.email,u.title,u.department,u.identity_source,u.identity_verified_at
      FROM mission_members mm JOIN users u ON u.id=mm.user_id WHERE mm.mission_id=$1 ORDER BY mm.joined_at`, [missionId]),
    pool.query("SELECT * FROM mission_presence WHERE mission_id=$1 AND last_seen_at > now() - interval '45 seconds' ORDER BY last_seen_at DESC", [missionId]),
    pool.query(`SELECT mc.*,u.name,u.email,u.title,u.department,u.identity_source,u.identity_verified_at
      FROM mission_comments mc JOIN users u ON u.id=mc.author_user_id WHERE mc.mission_id=$1 ORDER BY mc.created_at DESC LIMIT 100`, [missionId]),
    pool.query("SELECT * FROM task_handoffs WHERE mission_id=$1 ORDER BY created_at DESC LIMIT 100", [missionId]),
    pool.query("SELECT * FROM collaboration_events WHERE mission_id=$1 ORDER BY sequence DESC LIMIT $2", [missionId, eventLimit]),
    pool.query(`SELECT ae.*,u.name FROM authority_edges ae JOIN users u ON u.id=ae.subject_user_id
      WHERE ae.workspace_id=(SELECT workspace_id FROM missions WHERE id=$1)
      AND (ae.scope_type='workspace' OR (ae.scope_type='mission' AND ae.scope_value=$1::text)) AND ae.superseded_by IS NULL
      AND (ae.valid_until IS NULL OR ae.valid_until>now()) ORDER BY ae.authority_level DESC`, [missionId]),
  ]);
  const members: MissionMember[] = memberRows.rows.map((row) => ({
    user: { id: row.id, name: row.name, email: row.email, title: row.title ?? undefined, department: row.department ?? undefined, identitySource: row.identity_source, identityVerified: Boolean(row.identity_verified_at) },
    role: row.role,
    responsibility: row.responsibility,
    joinedAt: toIso(row.joined_at)!,
  }));
  const memberById = new Map(members.map((member) => [member.user.id, member.user]));
  return {
    revision: Number(revision.rows[0]?.revision ?? 1),
    members,
    presence: presenceRows.rows.map((row) => ({ userId: row.user_id, connectionId: row.connection_id, state: row.state, cursorContext: row.cursor_context ?? undefined, lastSeenAt: toIso(row.last_seen_at)! })),
    comments: commentRows.rows.map((row) => ({ id: row.id, missionId, author: memberById.get(row.author_user_id) ?? { id: row.author_user_id, name: row.name, email: row.email, title: row.title ?? undefined, department: row.department ?? undefined, identitySource: row.identity_source, identityVerified: Boolean(row.identity_verified_at) }, body: row.body, mentions: row.mentions ?? [], taskId: row.task_id ?? undefined, conflictId: row.conflict_id ?? undefined, parentId: row.parent_id ?? undefined, resolvedAt: toIso(row.resolved_at), createdAt: toIso(row.created_at)!, updatedAt: toIso(row.updated_at)! })),
    handoffs: handoffRows.rows.map((row) => ({ id: row.id, taskId: row.task_id, fromUserId: row.from_user_id ?? undefined, fromAgentId: row.from_agent_id ?? undefined, toUserId: row.to_user_id ?? undefined, toAgentId: row.to_agent_id ?? undefined, reason: row.reason, checkpoint: row.checkpoint ?? {}, status: row.status, createdAt: toIso(row.created_at)! })),
    events: eventRows.rows.reverse().map(mapEvent),
    authorityGraph: authorityRows.rows.map((row) => ({ id: row.id, subjectUserId: row.subject_user_id, subjectName: row.name, scopeType: row.scope_type, scopeValue: row.scope_value, authorityLevel: row.authority_level, canApproveRisk: row.can_approve_risk, budgetCeiling: row.budget_ceiling == null ? undefined : Number(row.budget_ceiling), validFrom: toIso(row.valid_from)!, validUntil: toIso(row.valid_until) })),
  };
}

export async function recordLearningSignal(input: {
  missionId: string;
  scope: StoreScope;
  type: "accepted_conflict" | "false_positive" | "human_correction" | "approval_rejected" | "rollback" | "outcome";
  label: string;
  value?: number;
  assertionId?: string;
  conflictId?: string;
  context?: Record<string, unknown>;
}) {
  if (!pool || input.scope.kind !== "session") return;
  const mission = await store.getMission(input.missionId, input.scope);
  await pool.query(
    `INSERT INTO outcome_learning_signals (id,workspace_id,mission_id,assertion_id,conflict_id,plan_version_id,signal_type,label,value,context,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [randomUUID(), input.scope.workspaceId, input.missionId, input.assertionId ?? null, input.conflictId ?? null, mission.currentPlan?.id ?? null, input.type, input.label, input.value ?? null, JSON.stringify(input.context ?? {}), input.scope.userId],
  );
}
