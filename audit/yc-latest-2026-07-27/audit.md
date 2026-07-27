# Relay × YC 最新方向產品稽核

日期：2026-07-27（Asia/Taipei）

## 結論

Relay 的核心方向明確符合 YC Fall 2026 Request for Startups 的 **Multiplayer AI**：讓團隊成員進入同一個 Agent 工作空間，查看、修正並接手長時間任務。Relay 的差異化不是多人聊天，而是把人工修正轉成可追溯的意圖、衝突、版本、核准與執行限制。

但方向符合不等於已具投資說服力。修改前最大缺口是：首頁說「人與 AI 共工」，真實產品主要仍是單人查看的 Canvas；Demo 唯讀；沒有可見的共同活動與具名修正。外部 Connector、租戶隔離與真實 Agent 執行仍未完成，因此不能宣稱為完整多人即時執行平台。

## 本次依據

- YC Fall 2026 RFS — Multiplayer AI：要求團隊能進入同一個 live agent session，觀看、重新導向與交接。https://www.ycombinator.com/rfs/
- YC Software：YC 說其內部已部署 Agent 處理重要任務，並重申接近使用者、快速發布。https://www.ycombinator.com/software
- YC 2026 Startup Directory：Shepherd 與 Cerenovus 已在做跨工具公司記憶與知識圖譜；Relay 不能只成為另一個 company brain。https://www.ycombinator.com/companies/industry/Search

## 流程稽核

| Step | 畫面／任務 | 修改前 | 修改後 | 證據 |
|---|---|---|---|---|
| 1 | 首頁：理解誰用、何時用、如何開始 | 健康，但主要強調 conflict compiler；多人價值不明顯 | 健康：Hero 明確標示多人 AI Mission Room，保留 Launch wedge 與單一 CTA | `01-home-before.png`, `04-home-after.png` |
| 2 | Mission Intake：貼入真實 Launch Brief | 健康：一份 Brief、清楚的分析邊界與隱私提醒 | 維持健康；未增加註冊或 Connector 摩擦 | `02-intake-before.png` |
| 3 | Demo：看見人與 Agent 如何共同工作 | 有風險：唯讀 Canvas 看得到角色，但看不到共同活動 | 改善：新增已保存活動、具名角色、共同狀態與真實同步說明 | `03-demo-before.png`, `05-demo-after.png` |
| 4 | 真實 Mission：人工修正 | 有風險：修正者硬編碼為 Jennifer，無多人可辨識性 | 健康：修正者可具名，事件寫入 Audit，舊 Plan 與核准立即失效 | 瀏覽器驗證：Alice 修正後 conflict 5→6、audit 2→3、Plan v1 superseded |
| 5 | 共用 Mission 狀態 | 缺口：只有手動 Refresh，沒有可驗證的同步節奏或分享入口 | 改善：每 10 秒讀取持久化狀態、可複製同一 Mission URL；文案明確說不是 WebSocket presence | `05-demo-after.png` |
| 6 | 行動版首次理解與控制室 | 首頁健康；控制室資訊密度高 | 健康但仍偏密集：CTA、Canvas、具名修正可用；Inspector 需向下捲動 | `06-mobile-home-after.png`, `08-mobile-demo-after.png` |

## 直接完成的改善

1. 新增首頁「Multiplayer by default」區塊，把共同 Mission 狀態、具名修正、版本失效與 Agent 停止串成一條可理解的流程。
2. Mission 頁每 10 秒同步已保存狀態，並顯示共同控制室狀態；不假裝即時游標或在線 Agent。
3. 新增「複製控制室連結」，讓同一 Mission URL 可以分享。
4. 人工修正增加修正者姓名，事件會進入既有 Audit Trail。
5. Mission Inspector 顯示最近三筆已保存活動，讓人與 Agent 的行動有可見脈絡。
6. 產品真實狀態更新：目前可用的是持久化 10 秒同步；OAuth、Credential Vault、真實外部執行仍明列 Design Partner rollout。

## YC 仍可能拒絕的理由（不能用 UI 假裝補齊）

1. **沒有使用者拉力證據。** 需要 5–10 個 Design Partner 的真實 weekly missions、首個衝突接受率、避免返工案例與願付費證據。
2. **還沒有完整的外部執行閉環。** 下一個工程里程碑不是再加十個 Connector，而是一個完整 Provider：OAuth → resource verification → scoped tool call → exact approval → execution receipt → revoke。
3. **多人安全模型尚未成立。** Public URL 目前適合遮蔽資料的公開 MVP，不適合公司機密；必須完成 Workspace identity、tenant isolation、RBAC 與分享權限。
4. **同步還不是即時協作。** 10 秒 polling 是可驗證的第一步；WebSocket presence、pause、handoff 與 concurrent correction resolution 應在身分與權限完成後再做。
5. **衝突偵測品質尚無 benchmark。** 必須累積 false positive / false negative、使用者接受／改寫決策與 mission outcome，證明 Relay 不只是漂亮規則 Demo。

## 驗證限制

本次以桌面與 390×844 行動版真實瀏覽器畫面、DOM、API 流程與自動測試驗證。畫面檢查可發現排版、裁切、資訊層級與可操作性問題，但不能單靠截圖證明 WCAG 合規；完整 accessibility audit 仍需鍵盤、螢幕閱讀器、對比與焦點順序測試。
