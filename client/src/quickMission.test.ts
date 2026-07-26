import { describe, expect, it } from "vitest";
import { parseQuickMission } from "./quickMission";

describe("parseQuickMission", () => {
  it("turns a labeled Chinese launch brief into structured mission evidence", () => {
    const mission = parseQuickMission(`
      Mission：推出高雄活動
      目標：7 月 29 日前上線，取得 24 筆付費報名
      Slack｜Growth：不得向既有會員推廣
      Email｜客戶：公開發布前必須先完成品牌核准
      Calendar｜營運：品牌審查排在 7 月 30 日
      成功指標：24 筆付費報名，CPA 不高於 NT$1,250
    `);

    expect(mission.title).toBe("推出高雄活動");
    expect(mission.sources).toHaveLength(3);
    expect(mission.sources.map((source) => source.type)).toEqual(["Slack", "Email", "Calendar"]);
    expect(mission.successMetric).toContain("24 筆付費報名");
  });

  it("keeps an unlabeled brief valid with two evidence sources", () => {
    const mission = parseQuickMission("Launch by July 29. Brand review happens July 30. Budget must stay under NT$30,000.");
    expect(mission.sources.length).toBeGreaterThanOrEqual(2);
    expect(mission.objective.length).toBeGreaterThanOrEqual(10);
    expect(mission.successMetric.length).toBeGreaterThanOrEqual(3);
  });
});

