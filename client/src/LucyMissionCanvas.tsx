import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDot,
  FileCheck2,
  HeartHandshake,
  KeyRound,
  MessageCircle,
  Maximize2,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { CreateMissionInput, Department } from "@shared/domain";
import { hasRequiredLucyInputs } from "@shared/lucy";
import { api } from "./api";
import { tr, useLocale } from "./i18n";
import "@xyflow/react/dist/style.css";

type LucyPhase = "identity" | "objective" | "context" | "success" | "ready";

type LucyMemory = {
  name: string;
  title: string;
  department: Department;
  objective: string;
  constraints: string;
  collaborators: string[];
  successMetric: string;
};

type LucyReply = {
  reply: string;
  nextPhase: LucyPhase;
  memory: LucyMemory;
  modelUsed: boolean;
};

type LucyMessage = { id: string; role: "lucy" | "human"; body: string };

type LucyNodeData = {
  variant: "start" | "lucy" | "human" | "goal" | "team" | "agent" | "outcome";
  eyebrow: string;
  title: string;
  detail: string;
  status?: string;
  onStart?: () => void;
};

type LucyNode = Node<LucyNodeData, "lucyNode">;

export type LucyMissionDraft = {
  input: CreateMissionInput;
  owner: { name: string; email: string; title: string; department: Department };
};

const emptyMemory: LucyMemory = {
  name: "",
  title: "",
  department: "Other",
  objective: "",
  constraints: "",
  collaborators: [],
  successMetric: "",
};

function nodeIcon(variant: LucyNodeData["variant"]) {
  if (variant === "start") return <CircleDot size={19} />;
  if (variant === "lucy" || variant === "agent") return <Bot size={18} />;
  if (variant === "human") return <UserRound size={18} />;
  if (variant === "goal") return <Target size={18} />;
  if (variant === "team") return <UsersRound size={18} />;
  return <BadgeCheck size={19} />;
}

function LucyNodeCard({ data }: NodeProps<LucyNode>) {
  return <article className={`lucy-node lucy-node-${data.variant}`}>
    {data.variant !== "start" && <Handle type="target" position={Position.Left} className="lucy-handle" />}
    <div className="lucy-node-head"><span>{nodeIcon(data.variant)}</span><div><small>{data.eyebrow}</small><b>{data.title}</b></div>{data.status && <em>{data.status}</em>}</div>
    <p>{data.detail}</p>
    {data.variant === "start" && <button type="button" className="nodrag nowheel" onClick={data.onStart}>{tr("Start with Lucy", "和 Lucy 開始")}<ArrowRight size={16} /></button>}
    {!(["outcome", "start"] as LucyNodeData["variant"][]).includes(data.variant) && <Handle type="source" position={Position.Right} className="lucy-handle" />}
  </article>;
}

function phaseNumber(phase: LucyPhase) {
  return { identity: 1, objective: 2, context: 3, success: 4, ready: 4 }[phase];
}

function phaseLabel(phase: LucyPhase) {
  return {
    identity: tr("MEETING YOU", "正在認識你"),
    objective: tr("HOLDING THE GOAL", "正在記住目標"),
    context: tr("FORMING THE TEAM", "正在組隊"),
    success: tr("DEFINING DONE", "正在確認終點"),
    ready: tr("READY TO TAKE OVER", "準備接手"),
  }[phase];
}

function short(value: string, fallback: string, max = 74) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export default function LucyMissionCanvas({ onLaunch, busy, stage, error }: { onLaunch: (draft: LucyMissionDraft) => Promise<void> | void; busy: boolean; stage: string; error: string }) {
  const { locale } = useLocale();
  const [seedGoal] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem("relay_lucy_goal")?.trim() ?? "";
  });
  const [started, setStarted] = useState(Boolean(seedGoal));
  const [phase, setPhase] = useState<LucyPhase>("identity");
  const [memory, setMemory] = useState<LucyMemory>(() => ({ ...emptyMemory, objective: seedGoal }));
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [modelUsed, setModelUsed] = useState<boolean>();
  const [localError, setLocalError] = useState("");
  const [selectedNode, setSelectedNode] = useState(seedGoal ? "goal" : "start");
  const [chatOpen, setChatOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    if (seedGoal) return true;
    return window.localStorage.getItem("relay-lucy-chat") !== "collapsed";
  });
  const [messages, setMessages] = useState<LucyMessage[]>(() => seedGoal ? [
    { id: "seed-goal", role: "human", body: seedGoal },
    { id: "seed-reply", role: "lucy", body: tr("I’ll hold that outcome for the whole mission. Before I bring in the team, what should I call you—and what do you own here?", "這個目標我會替整個 Mission 守住。開始找團隊加入之前，我該怎麼稱呼你？你在這裡負責什麼？") },
  ] : [{
    id: "hello",
    role: "lucy",
    body: tr("Hi, I’m Lucy—your counterpart for this mission. I’ll remember your point of view, bring in the right people, and let the Agents do the meeting. What should I call you, and what do you own here?", "嗨，我是 Lucy，這個 Mission 裡專門替你守住目標的 AI 搭檔。我會記住你的立場、找對的人加入，也會讓 Agents 代替大家開會。你希望我怎麼稱呼你？你在這裡負責什麼？"),
  }]);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (started) window.setTimeout(() => inputRef.current?.focus(), 120); }, [started, phase]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages, thinking]);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("relay-lucy-chat", chatOpen ? "open" : "collapsed");
  }, [chatOpen]);
  useEffect(() => {
    if (seedGoal && typeof window !== "undefined") window.sessionStorage.removeItem("relay_lucy_goal");
  }, [seedGoal]);

  const start = () => { setStarted(true); setChatOpen(true); setSelectedNode("lucy"); };
  const reset = () => {
    setStarted(false); setPhase("identity"); setMemory(emptyMemory); setInput(""); setThinking(false); setModelUsed(undefined); setLocalError(""); setSelectedNode("start");
    setMessages([{ id: `hello-${Date.now()}`, role: "lucy", body: tr("Hi, I’m Lucy—your counterpart for this mission. I’ll remember your point of view, bring in the right people, and let the Agents do the meeting. What should I call you, and what do you own here?", "嗨，我是 Lucy，這個 Mission 裡專門替你守住目標的 AI 搭檔。我會記住你的立場、找對的人加入，也會讓 Agents 代替大家開會。你希望我怎麼稱呼你？你在這裡負責什麼？") }]);
  };

  const suggestions = useMemo(() => {
    if (phase === "identity") return locale === "zh-TW" ? ["我是執行長，負責最後決策", "我負責 Growth 與社群", "我是工程師，負責技術交付", "我是財務，負責預算核准"] : ["I’m the CEO and final decision maker", "I own Growth and social", "I’m the engineer shipping it", "I own finance approval"];
    if (phase === "objective") return locale === "zh-TW" ? ["兩週內推出新產品", "月底前完成行銷活動", "把新客戶安全上線"] : ["Launch the product in two weeks", "Ship the campaign by month-end", "Onboard the new client safely"];
    if (phase === "context") return locale === "zh-TW" ? ["需要財務核准預算，不能超支", "需要工程與設計，發布前 CEO 要核准", "不能寄給現有客戶，社群要先看文案"] : ["Finance must approve; never exceed budget", "Engineering and Design contribute; CEO approves launch", "Exclude current customers; Social reviews the copy"];
    if (phase === "success") return locale === "zh-TW" ? ["準時發布且所有負責人 sign off", "完成 100 筆註冊，CPA 低於目標", "通過驗收並交付可查證的成果"] : ["Launch on time with every owner signed off", "Reach 100 signups under target CPA", "Pass acceptance with verifiable proof"];
    return [];
  }, [locale, phase]);

  const send = async (value: string) => {
    const message = value.trim();
    if (!message || thinking || phase === "ready") return;
    setInput(""); setLocalError(""); setThinking(true);
    setMessages((current) => [...current, { id: `human-${Date.now()}`, role: "human", body: message }]);
    try {
      const response = await api<LucyReply>("/api/lucy/turn", { method: "POST", body: JSON.stringify({ locale, phase, message, memory }) });
      const goalWasAlreadyCaptured = phase === "identity" && memory.objective.trim().length >= 3 && response.nextPhase === "objective";
      const nextPhase = goalWasAlreadyCaptured ? "context" : response.nextPhase;
      const reply = goalWasAlreadyCaptured
        ? tr("I know your role and I’m still holding the goal you gave me. Who must be involved, what approval or file cannot be missing, and what must never go wrong?", "你的角色我記住了，剛才的目標也還在。這件事一定要找誰加入、不能少哪個授權或檔案，以及有什麼絕對不能出錯？")
        : response.reply;
      setMemory(response.memory); setPhase(nextPhase); setModelUsed(response.modelUsed);
      setMessages((current) => [...current, { id: `lucy-${Date.now()}`, role: "lucy", body: reply }]);
      setSelectedNode(nextPhase === "objective" ? "identity" : nextPhase === "context" ? "goal" : nextPhase === "success" ? "team" : nextPhase === "ready" ? "outcome" : "lucy");
    } catch (requestError) {
      setLocalError((requestError as Error).message);
    } finally { setThinking(false); }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void send(input); };
  const canLaunch = phase === "ready" && hasRequiredLucyInputs(memory);
  const launch = () => {
    if (!canLaunch || busy) return;
    const ownerName = memory.name.trim() || tr("Mission owner", "Mission 負責人");
    const collaborators = memory.collaborators.length ? `\n${tr("People or roles to involve", "需要加入的人或角色")}：${memory.collaborators.join("、")}` : "";
    void onLaunch({
      owner: { name: ownerName, email: "", title: short(memory.title, tr("Mission owner", "Mission 負責人"), 120), department: memory.department },
      input: {
        title: short(memory.objective, tr("Lucy-guided mission", "Lucy 引導任務"), 120),
        objective: memory.objective,
        successMetric: memory.successMetric,
        executionMode: "launch_readiness",
        createdBy: ownerName,
        sources: [
          { type: "Manual", title: tr("Lucy interview · owner and goal", "Lucy 訪談 · 負責人與目標"), author: ownerName, content: `${memory.title}\n${memory.objective}`, authorityLevel: 5 },
          { type: "Meeting note", title: tr("Lucy interview · team and boundaries", "Lucy 訪談 · 團隊與邊界"), author: ownerName, content: `${memory.constraints}${collaborators}`, authorityLevel: 4 },
        ],
      },
    });
  };

  const nodes = useMemo<LucyNode[]>(() => {
    const values: LucyNode[] = [{ id: "start", type: "lucyNode", position: { x: 20, y: 280 }, data: { variant: "start", eyebrow: tr("START", "開始"), title: tr("Tell Lucy what you need", "告訴 Lucy 你需要什麼"), detail: tr("One conversation becomes the shared mission.", "一段對話會長成團隊共用的 Mission。"), status: started ? tr("done", "完成") : tr("ready", "準備好"), onStart: start } }];
    if (!started) return values;
    values.push({ id: "lucy", type: "lucyNode", position: { x: 300, y: 250 }, data: { variant: "lucy", eyebrow: tr("MISSION LEAD", "MISSION 主理 AGENT"), title: "Agent Lucy", detail: short(messages.filter((item) => item.role === "lucy").at(-1)?.body ?? "", tr("Listening…", "正在聽…"), 110), status: thinking || busy ? tr("working", "執行中") : phase === "ready" ? tr("contract ready", "合約就緒") : tr("listening", "聆聽中") } });
    if (memory.title) values.push({ id: "identity", type: "lucyNode", position: { x: 600, y: 40 }, data: { variant: "human", eyebrow: tr("HUMAN + COUNTERPART", "人類＋專屬 AI"), title: memory.name || tr("Mission owner", "Mission 負責人"), detail: `${short(memory.title, tr("Role captured", "已記下角色"), 62)} · ${tr("paired with Lucy", "由 Lucy 代表")}`, status: tr("represented", "已被代表") } });
    if (memory.objective) values.push({ id: "goal", type: "lucyNode", position: { x: 600, y: 245 }, data: { variant: "goal", eyebrow: tr("SHARED GOAL", "共同目標"), title: short(memory.objective, tr("Mission goal", "Mission 目標"), 52), detail: tr("Lucy turns this into owned, checkable work.", "Lucy 會把它拆成有人負責、可以驗收的工作。"), status: tr("captured", "已記錄") } });
    if (memory.constraints) values.push({ id: "team", type: "lucyNode", position: { x: 600, y: 450 }, data: { variant: "team", eyebrow: tr("TEAM + AI COUNTERPARTS", "團隊＋每人專屬 AI"), title: memory.collaborators.length ? memory.collaborators.join(" · ") : tr("Invite the right decision makers", "邀請正確的決策者"), detail: short(memory.constraints, tr("Every invited person gets an Agent that carries their context into the council.", "每位受邀同事都會有一個 Agent，替他帶著脈絡進入 Council。"), 110), status: tr("ready to invite", "準備邀請") } });
    if (memory.objective) {
      values.push(
        { id: "agent-research", type: "lucyNode", position: { x: 910, y: 105 }, data: { variant: "agent", eyebrow: tr("AI WORKER 01", "AI WORKER 01"), title: tr("Evidence Agent", "證據 Agent"), detail: tr("Collects facts and keeps every claim linked to its source.", "蒐集資料，讓每個結論都能回到來源。"), status: canLaunch ? tr("queued", "待執行") : tr("waiting", "等待中") } },
        { id: "agent-plan", type: "lucyNode", position: { x: 910, y: 300 }, data: { variant: "agent", eyebrow: tr("AI WORKER 02", "AI WORKER 02"), title: tr("Planning Agent", "計畫 Agent"), detail: tr("Builds the task graph, owners, permissions and stop conditions.", "建立任務圖、負責人、權限與停止條件。"), status: canLaunch ? tr("queued", "待執行") : tr("waiting", "等待中") } },
        { id: "agent-execute", type: "lucyNode", position: { x: 910, y: 495 }, data: { variant: "agent", eyebrow: tr("AI WORKER 03", "AI WORKER 03"), title: tr("Execution Agent", "執行 Agent"), detail: tr("Runs safe work and pauses only for the exact person who must approve.", "執行安全工作，只在需要精確核准時找對的人。"), status: canLaunch ? tr("permission-gated", "等待授權") : tr("waiting", "等待中") } },
      );
    }
    if (memory.successMetric) values.push({ id: "outcome", type: "lucyNode", position: { x: 1230, y: 285 }, data: { variant: "outcome", eyebrow: tr("DONE + SIGN-OFF", "完成＋SIGN-OFF"), title: tr("Mission accomplished", "Mission 達成"), detail: short(memory.successMetric, tr("Verifiable outcome", "可驗證成果"), 100), status: tr("finish line", "完成條件") } });
    return values;
  }, [busy, canLaunch, memory, messages, phase, started, thinking]);

  const edges = useMemo<Edge[]>(() => {
    const arrow = { type: MarkerType.ArrowClosed, width: 15, height: 15, color: "#9ca09a" };
    const values: Edge[] = [];
    if (started) values.push({ id: "start-lucy", source: "start", target: "lucy", type: "smoothstep", animated: phase === "identity", markerEnd: arrow });
    if (memory.title) values.push({ id: "lucy-identity", source: "lucy", target: "identity", type: "smoothstep", markerEnd: arrow });
    if (memory.objective) values.push({ id: "lucy-goal", source: "lucy", target: "goal", type: "smoothstep", animated: phase === "context", markerEnd: arrow });
    if (memory.constraints) values.push({ id: "lucy-team", source: "lucy", target: "team", type: "smoothstep", animated: phase === "success", markerEnd: arrow });
    if (memory.objective) ["agent-research", "agent-plan", "agent-execute"].forEach((target, index) => values.push({ id: `goal-${target}`, source: index === 2 && memory.constraints ? "team" : "goal", target, type: "smoothstep", animated: canLaunch && index < 2, markerEnd: { ...arrow, color: canLaunch && index < 2 ? "#4a76d1" : "#b9bcb7" }, style: { stroke: canLaunch && index < 2 ? "#4a76d1" : "#b9bcb7", strokeDasharray: index === 2 ? "5 5" : undefined } }));
    if (memory.successMetric) ["agent-research", "agent-plan", "agent-execute"].forEach((source) => values.push({ id: `${source}-outcome`, source, target: "outcome", type: "smoothstep", markerEnd: { ...arrow, color: "#92b950" }, style: { stroke: "#92b950", strokeDasharray: "5 5" } }));
    return values;
  }, [canLaunch, memory.constraints, memory.objective, memory.successMetric, memory.title, phase, started]);

  const selected = nodes.find((node) => node.id === selectedNode)?.data;
  const progress = phaseNumber(phase);
  const heldContext = phase === "identity"
    ? tr("I’m listening for who you are—not forcing you into fields.", "我先理解你是誰，不把你塞進欄位裡。")
    : phase === "objective"
      ? short(memory.title, tr("Your role is safe with me.", "你的角色我記住了。"), 88)
      : phase === "context"
        ? short(memory.objective, tr("I’m holding the shared goal.", "共同目標我記住了。"), 88)
        : phase === "success"
          ? tr(`${memory.collaborators.length || 1} viewpoints will be represented by counterpart Agents.`, `${memory.collaborators.length || 1} 個角色會由各自的 AI counterpart 代表。`)
          : tr("I can coordinate the Agents and bring humans only the decisions that need them.", "我可以開始協調 Agents，只把真的需要判斷的決策帶回來。" );
  const latestLucyMessage = messages.filter((message) => message.role === "lucy").at(-1)?.body ?? heldContext;
  const mobileSteps = [
    { label: tr("You", "你的角色"), value: memory.title || tr("Lucy is listening", "Lucy 正在認識你"), done: Boolean(memory.title) },
    { label: tr("Goal", "共同目標"), value: memory.objective || tr("Next in the conversation", "接下來聊這件事"), done: Boolean(memory.objective) },
    { label: tr("Team", "需要的同事"), value: memory.collaborators.length ? memory.collaborators.join(" · ") : tr("Lucy will identify who to invite", "Lucy 會找出該邀請誰"), done: Boolean(memory.constraints) },
    { label: tr("Done", "完成條件"), value: memory.successMetric || tr("Define what success looks like", "一起確認什麼才算完成"), done: Boolean(memory.successMetric) },
  ];

  return <section className="lucy-canvas-shell" aria-label={tr("Lucy mission canvas", "Lucy Mission Canvas")}>
    <div className="lucy-canvas-toolbar"><div><span><span /> {tr("LIVE MISSION CANVAS", "即時 MISSION CANVAS")}</span><small>{tr("Every block is part of one versioned mission", "每個區塊都屬於同一份版本化 Mission")}</small></div><div><span><Maximize2 size={14}/>{tr("Pinch or scroll to see the big picture", "縮放即可看全局與細節")}</span>{started && <button type="button" onClick={reset}><RotateCcw size={14}/>{tr("Start over", "重新開始")}</button>}</div></div>
    <div className="lucy-canvas-stage">
      <div className={`lucy-mobile-board ${started ? "started" : ""}`}>
        {!started ? <div className="lucy-mobile-welcome"><span className="lucy-avatar"><HeartHandshake size={22}/><i /></span><small>{tr("YOUR AI MISSION PARTNER", "你的 AI MISSION 搭檔")}</small><h1>{tr("Tell Lucy what needs to get done.", "先跟 Lucy 說，你想完成什麼。")}</h1><p>{tr("No forms. Lucy asks one thing at a time, remembers your answers, and builds the mission with you.", "不用填表。Lucy 一次只問一件事、記住你的答案，再替你把 Mission 長出來。")}</p><button type="button" onClick={start}>{tr("Start talking with Lucy", "開始跟 Lucy 對話")}<ArrowRight size={18}/></button></div> : <div className="lucy-mobile-progress"><header><div><span className="lucy-avatar"><HeartHandshake size={20}/><i /></span><p><small>{tr("MISSION TAKING SHAPE", "MISSION 正在長出來")}</small><b>{phaseLabel(phase)}</b></p></div><strong>{progress}/4</strong></header><ol>{mobileSteps.map((step, index) => <li className={step.done ? "done" : index + 1 === progress ? "current" : ""} key={step.label}><span>{step.done ? <Check size={16}/> : index + 1}</span><p><small>{step.label}</small><b>{short(step.value, step.label, 80)}</b></p></li>)}</ol></div>}
      </div>
      <ReactFlow key={`${started}-${nodes.length}`} nodes={nodes} edges={edges} nodeTypes={{ lucyNode: LucyNodeCard }} fitView fitViewOptions={{ padding: .2, minZoom: .2, maxZoom: 1.02 }} minZoom={.18} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false} panOnScroll zoomOnPinch zoomOnScroll onNodeClick={(_, node) => setSelectedNode(node.id)} proOptions={{ hideAttribution: true }}>
        <Background color="#dfe1dc" gap={25} size={1} />
        <Controls position="bottom-left" showInteractive={false}/>
        <MiniMap position="bottom-left" pannable zoomable nodeStrokeWidth={2} nodeColor={(node) => node.data.variant === "lucy" ? "#baff39" : node.data.variant === "human" ? "#8367e8" : node.data.variant === "agent" ? "#4a76d1" : node.data.variant === "outcome" ? "#2aa981" : "#d7d9d3"}/>
      </ReactFlow>

      {!started && <div className="lucy-empty-hint"><Sparkles size={18}/><span>{tr("Start with one sentence. The canvas grows only when it needs to.", "先說一句話就好；只有需要時，畫布才會長出新區塊。")}</span></div>}
      {started && selected && <aside className="lucy-node-inspector"><small>{selected.eyebrow}</small><b>{selected.title}</b><p>{selected.detail}</p></aside>}

      {started && chatOpen && <section id="lucy-conversation" className="lucy-chat" aria-label={tr("Conversation with Agent Lucy", "與 Agent Lucy 對話")}>
        <header><span className="lucy-avatar"><HeartHandshake size={19}/><i /></span><div><b>Lucy · {tr("your AI counterpart", "你的 AI 搭檔")}</b><small>{thinking || busy ? tr("Thinking with you—not just replying", "正在跟你一起想，不只是回覆") : modelUsed === true ? tr("Remembers your context · guarded by policy", "記得你的脈絡 · 受政策保護") : modelUsed === false ? tr("Always honest about what has and has not run", "誠實說明哪些已執行、哪些尚未執行") : tr("Stays with this mission until the outcome", "會陪這個 Mission 走到成果")}</small></div><span className="lucy-progress">{phaseLabel(phase)}</span><button type="button" className="lucy-chat-collapse" onClick={() => setChatOpen(false)} aria-label={tr("Collapse Lucy conversation", "收起 Lucy 對話")} aria-expanded="true" aria-controls="lucy-conversation"><ChevronDown size={19}/></button></header>
        <div className="lucy-chat-progress"><span style={{ width: `${progress * 25}%` }}/></div>
        <div className="lucy-held-context"><MessageCircle size={15}/><p><small>{tr("WHAT LUCY IS HOLDING", "LUCY 現在替你記住")}</small><b>{heldContext}</b></p></div>
        <div className="lucy-messages" aria-live="polite">{messages.slice(-5).map((message) => <div className={message.role} key={message.id}><span>{message.role === "lucy" ? <Bot size={13}/> : <UserRound size={13}/>}</span><p>{message.body}</p></div>)}{thinking && <div className="lucy thinking"><span><Bot size={13}/></span><p><i/><i/><i/></p></div>}{busy && <div className="lucy executing"><span><Zap size={13}/></span><p><b>{stage || tr("Lucy is creating the mission…", "Lucy 正在建立 Mission…")}</b><small>{tr("Safe Agent work starts automatically; governed actions wait for the right human.", "安全的 Agent 工作會自動開始；受治理操作會等待正確的人核准。")}</small></p></div>}<div ref={endRef}/></div>
        {!busy && phase !== "ready" && <><div className="lucy-suggestions"><span>{tr("IF HELPFUL", "不知道怎麼說，可以從這裡開始")}</span>{suggestions.map((suggestion) => <button type="button" key={suggestion} disabled={thinking} onClick={() => { void send(suggestion); }}>{suggestion}<ArrowRight size={12}/></button>)}</div><form className="lucy-composer" onSubmit={submit}><input ref={inputRef} value={input} disabled={thinking} onChange={(event) => setInput(event.target.value)} aria-label={tr("Reply to Agent Lucy", "回覆 Agent Lucy")} placeholder={tr("Say it the way you would to a trusted teammate", "像跟信任的同事說話一樣，直接說就好")}/><button type="submit" disabled={thinking || input.trim().length < 1} aria-label={tr("Send to Lucy", "傳送給 Lucy")}>{thinking ? <span className="loader small"/> : <Send size={17}/>}</button></form></>}
        {!busy && phase === "ready" && <div className="lucy-ready"><div><ShieldCheck size={17}/><p><b>{tr("Lucy has enough to start safely", "Lucy 已經知道如何安全開始")}</b><small>{tr("2 evidence blocks · 3 Agent roles · exact approvals preserved", "2 個證據區塊 · 3 個 Agent 角色 · 保留精確核准")}</small></p></div><button type="button" disabled={!canLaunch} onClick={launch}><PlayIcon/>{tr("Let Lucy start the mission", "讓 Lucy 開始執行")}<ArrowRight size={16}/></button><button type="button" className="lucy-add-context" onClick={() => { setPhase("context"); setMessages((current) => [...current, { id: `lucy-more-${Date.now()}`, role: "lucy", body: tr("What else should I protect, or who else should I involve?", "還有什麼不能出錯？或還需要邀請誰？") }]); }}>{tr("Add one more constraint", "再補一項限制")}</button></div>}
        {(localError || error) && <p className="lucy-error">{localError || error}</p>}
        <footer><FileCheck2 size={13}/>{tr("Lucy carries your context into the mission. External actions still require scoped access and the right human’s approval.", "Lucy 會把你的脈絡帶進 Mission；外部操作仍需要範圍權限與正確人類的核准。")}</footer>
      </section>}
      {started && !chatOpen && <button type="button" className="lucy-chat-pill" onClick={() => setChatOpen(true)} aria-label={tr("Open Lucy conversation", "展開 Lucy 對話")} aria-expanded="false" aria-controls="lucy-conversation"><span className="lucy-avatar"><HeartHandshake size={18}/><i /></span><p><b>Lucy</b><small>{thinking || busy ? stage || tr("Working on your mission…", "正在處理你的 Mission…") : short(latestLucyMessage, heldContext, 64)}</small></p><span className="lucy-pill-status">{phaseLabel(phase)}</span><ChevronUp size={20}/></button>}
    </div>
  </section>;
}

function PlayIcon() {
  return <Zap size={16} />;
}
