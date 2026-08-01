import { afterEach, describe, expect, it } from "vitest";
import { beginOAuth } from "./connectors";
import type { StoreScope } from "./security";

const scope: Extract<StoreScope, { kind: "session" }> = {
  kind: "session",
  authType: "browser_session",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceRole: "owner",
  allowedMissionIds: [],
  actorName: "Connector tester",
  identityVerified: true,
  canWrite: true,
};

const original = {
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  vault: process.env.RELAY_VAULT_KEY,
};

afterEach(() => {
  if (original.clientId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID; else process.env.GOOGLE_OAUTH_CLIENT_ID = original.clientId;
  if (original.clientSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET; else process.env.GOOGLE_OAUTH_CLIENT_SECRET = original.clientSecret;
  if (original.vault === undefined) delete process.env.RELAY_VAULT_KEY; else process.env.RELAY_VAULT_KEY = original.vault;
});

describe("connector capability consent", () => {
  it("asks Google only for the selected Gmail read capability", async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret";
    process.env.RELAY_VAULT_KEY = "test-vault-key";

    const result = await beginOAuth({
      provider: "google",
      requestedCapabilities: ["Gmail: read selected threads"],
      redirectAfter: "/missions/test?view=access",
      baseUrl: "https://relay.example",
      scope,
    });
    const authorizeUrl = new URL(result.authorizeUrl);
    const granted = authorizeUrl.searchParams.get("scope")?.split(" ") ?? [];

    expect(result.requestedCapabilities).toEqual(["Gmail: read selected threads"]);
    expect(granted).toEqual(expect.arrayContaining(["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"]));
    expect(granted).not.toContain("https://www.googleapis.com/auth/gmail.compose");
    expect(granted).not.toContain("https://www.googleapis.com/auth/drive.readonly");
    expect(granted).not.toContain("https://www.googleapis.com/auth/calendar.events");
  });

  it("rejects a capability that the provider adapter does not implement", async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret";
    process.env.RELAY_VAULT_KEY = "test-vault-key";

    await expect(beginOAuth({
      provider: "google",
      requestedCapabilities: ["Gmail: send email"],
      baseUrl: "https://relay.example",
      scope,
    })).rejects.toMatchObject({ status: 400 });
  });
});
