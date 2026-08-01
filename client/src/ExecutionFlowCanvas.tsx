import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
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
  Plus,
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
  addable?: boolean;
  actionHref?: string;
  actionLabel?: string;
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
  const statusClass = data.status ? `status-${data.status.replaceAll("_", "-")}` : "";
  return <div className={`flow-node flow-node-${data.variant} ${data.accent ?? ""} ${statusClass}`}>
    {data.variant !== "intent" && <Handle type="target" position={Position.Left} className="flow-handle" />}
    <div className="flow-node-top">
      <span className="flow-node-icon">{data.variant === "intent" ? <FlowSourceIcon type={data.sourceType} /> : data.variant === "conflict" ? <AlertOctagon size={18} /> : data.variant === "human" ? <UserRound size={18} /> : data.variant === "agent" ? <Bot size={18} /> : <Target size={19} />}</span>
      <div><small>{data.meta}</small><b>{data.title}</b></div>
      {data.status && <span className={`flow-node-status status-${data.status.replaceAll("_", "-")}`}>{localizeLabel(data.status)}</span>}
    </div>
    {data.detail && <p>{data.detail}</p>}
    {typeof data.progress === "number" && <div className="flow-progress"><span style={{ width: `${data.progress}%` }} /><small>{data.progress}%</small></div>}
    {data.actionHref && <button className="flow-node-primary-action" type="button" onClick={(event) => { event.stopPropagation(); window.location.assign(data.actionHref!); }}>{data.actionLabel ?? "Open"}</button>}
    {data.addable !== false && <span className="flow-node-add" title="Add to this block"><Plus size={13}/></span>}
    {data.variant !== "outcome" && <Handle type="source" position={Position.Right} className="flow-handle" />}
  </div>;
}

function CanvasOverviewControl({ compact }: { compact: boolean }) {
  const { fitView } = useReactFlow();
  if (!compact) return null;
  return <Panel position="top-left" className="canvas-overview-control"><button type="button" onClick={() => { void fitView({ padding: .12, minZoom: .28, maxZoom: .5, duration: 320 }); }}><Target size={16}/><span>Fit</span></button></Panel>;
}

export default function ExecutionFlowCanvas({ nodes, edges, onConflictSelect, onNodeAction, presentation = false }: { nodes: MissionFlowNode[]; edges: Edge[]; onConflictSelect: (id: string) => void; onNodeAction?: (node: MissionFlowNode) => void; presentation?: boolean }) {
  const nodeTypes = useMemo(() => ({ missionNode: MissionFlowNodeCard }), []);
  const compact = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  // A full-graph fit makes every card unreadably tiny on a phone. Start on the
  // human → counterpart → Agent Council handoff; the Fit View control remains
  // available when someone wants the whole mission map.
  const defaultViewport = presentation
    ? compact ? { x: -95, y: 120, zoom: 0.52 } : { x: 24, y: 104, zoom: 0.64 }
    : compact ? { x: 18, y: 105, zoom: 0.84 } : { x: 12, y: 100, zoom: 0.88 };
  return <ReactFlow className={presentation ? "presentation-flow" : undefined} nodes={nodes} edges={edges} nodeTypes={nodeTypes} defaultViewport={defaultViewport} fitViewOptions={{ padding: .16, minZoom: .2, maxZoom: .72 }} minZoom={0.2} maxZoom={1.45} nodesConnectable={false} panOnScroll={false} zoomOnPinch zoomOnScroll={!compact} preventScrolling={!compact} onNodeClick={(_, node) => { if (node.data.conflictId) onConflictSelect(String(node.data.conflictId)); onNodeAction?.(node); }} proOptions={{ hideAttribution: true }}>
    <Background color="#dedede" gap={28} size={1} />
    <CanvasOverviewControl compact={compact}/>
    <Controls position="bottom-left" showInteractive={false} showZoom={!compact} showFitView={!compact}/>
    {!presentation && !compact && <MiniMap position="bottom-left" pannable zoomable nodeStrokeWidth={2} nodeColor={(node) => node.data.variant === "conflict" ? "#c2211a" : node.data.variant === "agent" ? "#1d65b5" : "#8f8f8f"} />}
  </ReactFlow>;
}
