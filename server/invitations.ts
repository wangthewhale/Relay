import { createHash } from "node:crypto";
import type { InviteDelivery, MissionInvitePreview } from "../shared/domain";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function invitationHtml(preview: MissionInvitePreview, inviteUrl: string, locale: "en" | "zh-TW") {
  const zh = locale === "zh-TW";
  const voices = preview.recap.voices.slice(0, 4).map((voice) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #e8e8e8">
      <div style="font-size:12px;color:#6b6b6f;margin-bottom:5px">${escapeHtml(voice.sourceType)} · ${escapeHtml(voice.author)}</div>
      <div style="font-size:15px;line-height:1.55;color:#171719">${escapeHtml(voice.statement)}</div>
    </td></tr>`).join("");
  const decisions = preview.recap.decisions.slice(0, 3).map((decision) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #e8e8e8">
      <div style="font-size:15px;font-weight:700;color:#171719">${escapeHtml(decision.title)}</div>
      <div style="font-size:13px;line-height:1.55;color:#666;margin-top:5px">${escapeHtml(decision.summary)}</div>
    </td></tr>`).join("");

  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#171719">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5"><tr><td align="center" style="padding:32px 14px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e1e1e1;border-radius:24px;overflow:hidden">
        <tr><td style="padding:28px 30px 22px;border-bottom:1px solid #e8e8e8">
          <div style="font-size:22px;font-weight:800;letter-spacing:-.5px">relay</div>
          <div style="font-size:12px;color:#65656a;margin-top:8px">${escapeHtml(preview.inviterName)} ${zh ? "邀請你加入一個 Mission" : "invited you to a Mission"}</div>
        </td></tr>
        <tr><td style="padding:32px 30px 10px">
          <div style="font-size:12px;font-weight:700;color:#666;letter-spacing:.08em">${zh ? "30 秒看懂" : "30-SECOND RECAP"}</div>
          <h1 style="font-size:32px;line-height:1.15;letter-spacing:-1.2px;margin:14px 0 12px">${escapeHtml(preview.mission.title)}</h1>
          <p style="font-size:16px;line-height:1.65;color:#555;margin:0">${escapeHtml(preview.mission.objective)}</p>
        </td></tr>
        <tr><td style="padding:20px 30px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#111;border-radius:18px;color:#fff"><tr><td style="padding:22px">
            <div style="font-size:12px;color:#aaa;margin-bottom:7px">${zh ? "RELAY 現在需要你" : "RELAY NEEDS YOU TO"}</div>
            <div style="font-size:19px;font-weight:700;line-height:1.45">${escapeHtml(zh ? preview.recap.whatYouNeedToDo.zhTW : preview.recap.whatYouNeedToDo.en)}</div>
          </td></tr></table>
        </td></tr>
        ${voices ? `<tr><td style="padding:8px 30px 12px"><div style="font-size:12px;font-weight:700;color:#666;letter-spacing:.08em">${zh ? "大家說了什麼" : "WHAT THE TEAM SAID"}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${voices}</table></td></tr>` : ""}
        ${decisions ? `<tr><td style="padding:10px 30px 12px"><div style="font-size:12px;font-weight:700;color:#666;letter-spacing:.08em">${zh ? "目前待決定" : "OPEN DECISIONS"}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${decisions}</table></td></tr>` : ""}
        <tr><td style="padding:24px 30px 34px">
          <a href="${escapeHtml(inviteUrl)}" style="display:block;padding:17px 20px;border-radius:999px;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:16px;font-weight:750">${zh ? "查看完整 Recap 並加入" : "See the full recap and join"}</a>
          <p style="font-size:12px;line-height:1.55;color:#777;text-align:center;margin:14px 0 0">${zh ? "連結為一次性、僅限此 Mission；你的 AI 搭檔不能替你核准。" : "Single-use and mission-scoped. Your AI counterpart cannot approve for you."}</p>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

function invitationText(preview: MissionInvitePreview, inviteUrl: string, locale: "en" | "zh-TW") {
  const zh = locale === "zh-TW";
  return [
    `${preview.inviterName} ${zh ? "邀請你加入 Relay Mission" : "invited you to a Relay Mission"}: ${preview.mission.title}`,
    "",
    preview.mission.objective,
    "",
    `${zh ? "Relay 現在需要你" : "Relay needs you to"}: ${zh ? preview.recap.whatYouNeedToDo.zhTW : preview.recap.whatYouNeedToDo.en}`,
    "",
    ...(preview.recap.voices.length ? [zh ? "大家說了什麼：" : "What the team said:", ...preview.recap.voices.slice(0, 4).map((voice) => `- ${voice.author}: ${voice.statement}`), ""] : []),
    `${zh ? "查看完整 Recap 並加入" : "See the full recap and join"}: ${inviteUrl}`,
  ].join("\n");
}

export async function sendMissionInviteEmail(input: {
  preview: MissionInvitePreview;
  inviteUrl: string;
  locale: "en" | "zh-TW";
  fetchImpl?: typeof fetch;
}): Promise<InviteDelivery> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || (process.env.NODE_ENV === "test" && !input.fetchImpl)) {
    return { status: "not_configured", provider: "none", detail: "Transactional email is not configured." };
  }
  const senderEmail = process.env.RELAY_INVITE_FROM_EMAIL || "business@the-wknd.club";
  const senderName = process.env.RELAY_INVITE_FROM_NAME || "Relay";
  const subject = input.locale === "zh-TW"
    ? `${input.preview.inviterName} 邀請你加入：${input.preview.mission.title}`
    : `${input.preview.inviterName} invited you: ${input.preview.mission.title}`;
  const idempotencyKey = createHash("sha256").update(`${input.preview.invitee.email}:${input.inviteUrl}`).digest("hex");
  try {
    const response = await (input.fetchImpl ?? fetch)("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "api-key": apiKey, idempotencyKey },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: input.preview.invitee.email, name: input.preview.invitee.name }],
        replyTo: { email: senderEmail, name: senderName },
        subject,
        htmlContent: invitationHtml(input.preview, input.inviteUrl, input.locale),
        textContent: invitationText(input.preview, input.inviteUrl, input.locale),
        tags: ["relay-mission-invite"],
      }),
    });
    const payload = await response.json().catch(() => ({})) as { messageId?: string; message?: string; code?: string };
    if (!response.ok || !payload.messageId) {
      return { status: "failed", provider: "brevo", detail: payload.message || payload.code || `Brevo returned HTTP ${response.status}.` };
    }
    return { status: "sent", provider: "brevo", messageId: payload.messageId };
  } catch (error) {
    return { status: "failed", provider: "brevo", detail: error instanceof Error ? error.message : "Email provider request failed." };
  }
}
