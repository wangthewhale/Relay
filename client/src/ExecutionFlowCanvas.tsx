import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  AlertOctagon,
  Bot,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Mail,
  MessageSquareWarning,
  MousePointer2,
  ShieldCheck,
  Target,
  UserRound,
} from "lucide-react";
import { useMemo } from "react";
import { localizeLabel } from "./i18n";
import "@xyflow/react/dist/style.css";

export type MissionFlowData = {
  variant: "intent" | "conflict" | "human" | "agent" | "outcome" | "cursor";
  title: string;
  meta?: string;
  detail?: string;
  status?: string;
  sourceType?: string;
  conflictId?: string;
  progress?: number;
  accent?: "red" | "violet" | "blue" | "lime" | "amber";
};

export type MissionFlowNode = Node<MissionFlowData, "missionNode">;

function FlowSourceIcon({ type }: { type?: string }) {
  if (type === "Calendar" || type === "Google Calendar" || type === "Deadline") return <CalendarDays size={17} />;
  if (type === "Email" || type === "Gmail") return <Mail size={17} />;
  if (type === "Slack" || type === "Meeting note") return <MessageSquareWarning size={17} />;
  if (type === "Budget") return <CircleDollarSign size={17} />;
  if (type === "Policy" || type === "Approval requirement") return <ShieldCheck size={17} />;
  return <FileText size={17} />;
}

function MissionFlowNodeCard({ data }: NodeProps<MissionFlowNode>) {
  if (data.variant === "cursor") return <div className={`flow-cursor ${data.accent ?? "violet"}`}><MousePointer2 size={19} fill="currentColor" /><span>{data.title}</span></div>;
  return <div className={`flow-node flow-node-${data.variant} ${data.accent ?? ""}`}>
    {data.variant !== "intent" && <Handle type="target" position={Position.Left} className="flow-handle" />}
    <div className="flow-node-top">
      <span className="flow-node-icon">{data.variant === "intent" ? <FlowSourceIcon type={data.sourceType} /> : data.variant === "conflict" ? <AlertOctagon size={18} /> : data.variant === "human" ? <UserRound size={18} /> : data.variant === "agent" ? <Bot size={18} /> : <Target size={19} />}</span>
      <div><small>{data.meta}</small><b>{data.title}</b></div>
      {data.status && <span className={`flow-node-status status-${data.status.replaceAll("_", "-")}`}>{localizeLabel(data.status)}</span>}
    </div>
    {data.detail && <p>{data.detail}</p>}
    {typeof data.progress === "number" && <div className="flow-progress"><span style={{ width: `${data.progress}%` }} /><small>{data.progress}%</small></div>}
    {data.variant !== "outcome" && <Handle type="source" position={Position.Right} className="flow-handle" />}
  </div>;
}

export default function ExecutionFlowCanvas({ nodes, edges, onConflictSelect }: { nodes: MissionFlowNode[]; edges: Edge[]; onConflictSelect: (id: string) => void }) {
  const nodeTypes = useMemo(() => ({ missionNode: MissionFlowNodeCard }), []);
  const compact = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  const defaultViewport = compact ? { x: 8, y: 35, zoom: 0.32 } : { x: 12, y: 100, zoom: 0.88 };
  return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} defaultViewport={defaultViewport} fitView={compact} fitViewOptions={{ padding: .16, minZoom: .2, maxZoom: .42 }} minZoom={0.2} maxZoom={1.45} nodesConnectable={false} onNodeClick={(_, node) => { if (node.data.conflictId) onConflictSelect(String(node.data.conflictId)); }} proOptions={{ hideAttribution: true }}>
    <Background color="#d7d8d2" gap={24} size={1} />
    <Controls position="bottom-left" showInteractive={false} />
    <MiniMap position="bottom-left" pannable zoomable nodeStrokeWidth={2} nodeColor={(node) => node.data.variant === "conflict" ? "#ef5b55" : node.data.variant === "human" ? "#7659e8" : node.data.variant === "agent" ? "#4175d6" : "#baff39"} />
  </ReactFlow>;
}
