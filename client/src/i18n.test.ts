import { describe, expect, it } from "vitest";
import { localizeDomainText, localizeLabel } from "./i18n";

describe("Traditional Chinese localization", () => {
  it("localizes canonical mission and status labels", () => {
    expect(localizeDomainText("Launch Kaohsiung campaign", "zh-TW")).toBe("推出高雄活動行銷專案");
    expect(localizeLabel("not_connected", "zh-TW")).toBe("尚未連線");
    expect(localizeLabel("Version conflict", "zh-TW")).toBe("版本衝突");
  });

  it("localizes generated conflict text including nested assertions", () => {
    expect(localizeDomainText(
      "Sources state NT$20,000 and NT$30,000. The plan cannot safely allocate spend until one value supersedes the other.",
      "zh-TW",
    )).toBe("來源分別提出 NT$20,000 與 NT$30,000。在確認由哪個數值取代另一個前，計畫無法安全分配支出。");
    expect(localizeDomainText(
      "Use the most recent, highest-authority limit (currently Budget limit stated as NT$30,000.) and explicitly supersede the older assertion.",
      "zh-TW",
    )).toBe("採用最新且權威最高的上限（目前為 NT$30,000），並明確取代舊主張。");
  });

  it("localizes capability and audit output while preserving unknown user text", () => {
    expect(localizeDomainText("Gmail: read selected resources", "zh-TW")).toBe("Gmail：讀取指定資源");
    expect(localizeDomainText("18 assertions compiled into 5 conflicts and Plan v1.", "zh-TW")).toBe("已將 18 項意圖主張編譯為 5 項衝突與計畫 v1。");
    expect(localizeDomainText("Customer-specific wording stays unchanged", "zh-TW")).toBe("Customer-specific wording stays unchanged");
    expect(localizeDomainText("Launch Kaohsiung campaign", "en")).toBe("Launch Kaohsiung campaign");
  });
});
