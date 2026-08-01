import { afterEach, describe, expect, it, vi } from "vitest";
import type { MissionInvitePreview } from "../shared/domain";
import { sendMissionInviteEmail } from "./invitations";

const preview: MissionInvitePreview = {
  expiresAt: "2026-08-08T04:44:00.000Z",
  inviterName: "Launch owner",
  invitee: { name: "Mina Finance", email: "mina@example.com", department: "Finance", missionRole: "decision_maker" },
  mission: {
    id: "mission-1",
    title: "September launch",
    objective: "Launch the approved campaign before September 15.",
    successMetric: "24 paid registrations",
    status: "conflicts",
    currentPlanVersion: 1,
    openConflicts: 1,
    pendingApprovals: 0,
    waitingAgentTasks: 3,
  },
  recap: {
    whatHappened: { en: "Relay found one decision.", zhTW: "Relay 找到一項待決定問題。" },
    whatYouNeedToDo: { en: "Confirm the approved budget.", zhTW: "確認核准預算。" },
    voices: [{ author: "Growth lead", sourceType: "Slack", statement: "Budget is NT$30,000." }],
    decisions: [{ title: "Budget conflict", summary: "Two limits disagree.", decisionOwner: "Finance" }],
  },
};

describe("mission invitation email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports a real Brevo receipt and includes the mission recap", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");
    vi.stubEnv("RELAY_INVITE_FROM_EMAIL", "business@the-wknd.club");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ messageId: "<message-123@relay>" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;

    const delivery = await sendMissionInviteEmail({ preview, inviteUrl: "https://relay.example/join/token", locale: "zh-TW", fetchImpl });

    expect(delivery).toEqual({ status: "sent", provider: "brevo", messageId: "<message-123@relay>" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, request] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(request.headers["api-key"]).toBe("test-api-key");
    expect(request.headers.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      sender: { email: "business@the-wknd.club", name: "Relay" },
      to: [{ email: "mina@example.com", name: "Mina Finance" }],
      tags: ["relay-mission-invite"],
    });
    expect(body.subject).toContain("September launch");
    expect(body.htmlContent).toContain("確認核准預算");
    expect(body.htmlContent).toContain("Growth lead");
    expect(body.textContent).toContain("https://relay.example/join/token");
  });

  it("never claims delivery when Brevo rejects the request", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: "sender not verified" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;

    await expect(sendMissionInviteEmail({ preview, inviteUrl: "https://relay.example/join/token", locale: "en", fetchImpl }))
      .resolves.toEqual({ status: "failed", provider: "brevo", detail: "sender not verified" });
  });
});
