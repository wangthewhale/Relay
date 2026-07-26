import type { CreateMissionInput, SourceInput, SourceType } from "@shared/domain";

const providerAliases: Array<[RegExp, SourceType]> = [
  [/^(slack|teams?)$/i, "Slack"],
  [/^(email|gmail|mail|郵件|信件)$/i, "Email"],
  [/^(notion)$/i, "Notion"],
  [/^(google\s*drive|drive|雲端硬碟)$/i, "Google Drive"],
  [/^(calendar|google\s*calendar|行事曆|日曆)$/i, "Calendar"],
  [/^(crm)$/i, "CRM"],
  [/^(ads?|meta\s*ads?|facebook\s*ads?|廣告平台|廣告)$/i, "Ads"],
  [/^(meeting(?:\s*note)?|會議紀錄|會議)$/i, "Meeting note"],
  [/^(manual|手動|人工)$/i, "Manual"],
];

const clean = (value: string) => value.replace(/^[\s\-*•]+|[\s]+$/g, "").trim();
const hasCjk = (value: string) => /[\u3400-\u9fff]/.test(value);

function sourceTypeFor(value: string): SourceType | undefined {
  const normalized = clean(value);
  return providerAliases.find(([pattern]) => pattern.test(normalized))?.[1];
}

function splitSourcePrefix(prefix: string) {
  const parts = prefix.split(/[|｜·•/]/).map(clean).filter(Boolean);
  const type = sourceTypeFor(parts[0] ?? "");
  if (!type) return undefined;
  return { type, author: parts.slice(1).join(" ") || (type === "Manual" ? "Mission owner" : `${type} source`) };
}

function defaultTitle(objective: string, chinese: boolean) {
  const trimmed = clean(objective).replace(/[.!。！？?]+$/g, "");
  if (trimmed.length >= 3) return trimmed.slice(0, 64);
  return chinese ? "待分析 Mission" : "Untitled mission";
}

function fallbackSegments(raw: string) {
  return raw
    .split(/\n+|(?<=[.!?。！？])\s+/)
    .map(clean)
    .filter((line) => line.length >= 3);
}

export function parseQuickMission(raw: string, createdBy = "Jennifer"): CreateMissionInput {
  const normalized = raw.replace(/\r/g, "").trim();
  if (normalized.length < 10) throw new Error("Mission brief must contain at least 10 characters.");

  const chinese = hasCjk(normalized);
  const lines = normalized.split(/\n+/).map(clean).filter(Boolean);
  let title = "";
  let objective = "";
  let successMetric = "";
  const sources: SourceInput[] = [];

  for (const line of lines) {
    const labeled = line.match(/^([^:：]{1,70})[:：]\s*(.+)$/);
    if (!labeled) continue;
    const label = clean(labeled[1]);
    const content = clean(labeled[2]);
    if (/^(mission|title|任務|專案|標題)$/i.test(label)) { title = content; continue; }
    if (/^(goal|objective|目標|任務目標)$/i.test(label)) { objective = content; continue; }
    if (/^(success|success\s*metric|kpi|成功|成功指標|成功合約)$/i.test(label)) { successMetric = content; continue; }

    const sourcePrefix = splitSourcePrefix(label);
    if (sourcePrefix) {
      sources.push({
        type: sourcePrefix.type,
        title: label.slice(0, 120),
        author: sourcePrefix.author.slice(0, 120),
        content,
        authorityLevel: sourcePrefix.type === "Email" || sourcePrefix.type === "Ads" ? 4 : 3,
      });
    }
  }

  const labeledContent = new Set([
    title,
    objective,
    successMetric,
    ...sources.map((source) => source.content),
  ].filter(Boolean));
  const unlabeled = lines.filter((line) => !labeledContent.has(line) && !line.match(/^([^:：]{1,70})[:：]\s*(.+)$/));
  for (const [index, content] of unlabeled.entries()) {
    sources.push({ type: "Manual", title: chinese ? `Mission 摘要 ${index + 1}` : `Mission note ${index + 1}`, author: createdBy, content, authorityLevel: 3 });
  }

  if (!objective) {
    objective = lines.find((line) => !/^([^:：]{1,70})[:：]\s*(.+)$/.test(line)) ?? sources[0]?.content ?? normalized.slice(0, 500);
  }
  if (!successMetric) {
    successMetric = chinese ? "在不違反已驗證限制的條件下完成這個 Mission。" : "Complete the mission without violating any validated constraint.";
  }
  if (!title) title = defaultTitle(objective, chinese);

  if (sources.length < 2) {
    for (const segment of fallbackSegments(normalized)) {
      if (sources.some((source) => source.content === segment) || [title, objective, successMetric].includes(segment)) continue;
      sources.push({ type: "Manual", title: chinese ? `原始資料 ${sources.length + 1}` : `Source ${sources.length + 1}`, author: createdBy, content: segment, authorityLevel: 3 });
      if (sources.length >= 2) break;
    }
  }
  while (sources.length < 2) {
    sources.push({
      type: "Manual",
      title: chinese ? `Mission 脈絡 ${sources.length + 1}` : `Mission context ${sources.length + 1}`,
      author: createdBy,
      content: sources.length ? objective : normalized.slice(0, 20_000),
      authorityLevel: 3,
    });
  }

  return {
    title: title.slice(0, 160),
    objective: objective.slice(0, 5_000),
    successMetric: successMetric.slice(0, 500),
    createdBy,
    sources: sources.slice(0, 20),
  };
}

