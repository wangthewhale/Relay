export type RelayAgentControl = "pause" | "resume" | "cancel";

export type RelayRuntimeContract = {
  missionId: string;
  missionRevision: number;
  planVersion: number;
  planVersionId?: string;
  planStatus?: string;
  blockingConflicts: number;
  authority: Array<{ subjectUserId: string; subjectName: string; authorityLevel: number; canApproveRisk: number }>;
  tasks: Array<{ id: string; key: string; ownerType: "human" | "agent"; ownerName: string; status: string; riskLevel: number; capabilities: string[]; forbiddenActions: string[]; stopCondition: string; rollbackStrategy: string }>;
  connectors: Array<{ provider: string; configured: boolean; verifiedConnections: Array<{ id: string; accountLabel: string; verifiedAt?: string }> }>;
  generatedAt: string;
};

type RelayClientOptions = {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
};

/**
 * A thin control-plane client for an Agent runtime. Credentials remain in Relay;
 * callers request capabilities and receive hashes/receipts rather than OAuth tokens.
 */
export class RelayClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(options: RelayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}), ...(init?.headers ?? {}) },
    });
    const payload = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || `Relay request failed with HTTP ${response.status}`);
    return payload;
  }

  getRuntimeContract(missionId: string) {
    return this.request<{ contract: RelayRuntimeContract; contractHash: string }>(`/api/missions/${missionId}/runtime-contract`);
  }

  enqueueAgentRun(taskId: string, agentId?: string) {
    return this.request<{ run: { id: string; status: string; planVersionId: string } }>(`/api/tasks/${taskId}/agent-runs`, { method: "POST", body: JSON.stringify({ agentId }) });
  }

  controlAgentRun(runId: string, action: RelayAgentControl) {
    return this.request<{ run: { id: string; status: string; checkpoint: Record<string, unknown> } }>(`/api/agent-runs/${runId}/${action}`, { method: "POST", body: "{}" });
  }

  callTool(missionId: string, runId: string, input: { connectionId: string; operation: string; resourceId: string; payload?: Record<string, unknown> }) {
    return this.request<{ toolCall: { id: string; status: "succeeded"; requestHash: string; resultHash: string; summary: Record<string, unknown> } }>(`/api/missions/${missionId}/agent-runs/${runId}/tool-calls`, { method: "POST", body: JSON.stringify(input) });
  }

  addCorrection(missionId: string, statement: string, assertionType = "Constraint") {
    return this.request(`/api/missions/${missionId}/corrections`, { method: "POST", body: JSON.stringify({ statement, assertionType }) });
  }

  addComment(missionId: string, body: string, mentions: string[] = []) {
    return this.request(`/api/missions/${missionId}/comments`, { method: "POST", body: JSON.stringify({ body, mentions }) });
  }

  subscribe(missionId: string, onEvent: (event: unknown) => void, onError?: (error: Error) => void) {
    if (!this.apiKey && typeof globalThis.EventSource !== "undefined") {
      const stream = new EventSource(`${this.baseUrl}/api/missions/${missionId}/events`, { withCredentials: true });
      const receive = (message: MessageEvent) => onEvent(JSON.parse(message.data));
      stream.addEventListener("relay", receive as EventListener);
      return () => { stream.removeEventListener("relay", receive as EventListener); stream.close(); };
    }
    const controller = new AbortController();
    void this.fetcher(`${this.baseUrl}/api/missions/${missionId}/events`, {
      credentials: "include",
      signal: controller.signal,
      headers: { Accept: "text/event-stream", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
    }).then(async (response) => {
      if (!response.ok || !response.body) throw new Error(`Relay event stream failed with HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
          if (data) onEvent(JSON.parse(data));
        }
      }
    }).catch((error) => { if (!controller.signal.aborted) onError?.(error instanceof Error ? error : new Error(String(error))); });
    return () => controller.abort();
  }
}
