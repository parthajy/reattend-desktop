import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getBoard, saveBoard, getGraphData } from "@/lib/tauri-api";
import type {
  Record as MemoryRecord,
  BoardNode as DBBoardNode,
  BoardEdge as DBBoardEdge,
  GraphNode as GNode,
  GraphEdge as GEdge,
} from "@/types";
import { RECORD_TYPES } from "@/types";
import { useBoardStore, EDGE_KIND_COLORS } from "@/stores/board-store";
import { StickyNode } from "@/components/board/StickyNode";
import { TextNode } from "@/components/board/TextNode";
import { MemoryNode } from "@/components/board/MemoryNode";
import {
  RectangleNode,
  CircleNode,
  DiamondNode,
} from "@/components/board/ShapeNodes";
import { DrawingNode } from "@/components/board/DrawingNode";
import { ImageNode } from "@/components/board/ImageNode";
import { LinkNode } from "@/components/board/LinkNode";
import { CommentNode } from "@/components/board/CommentNode";
import { BoardToolbar } from "@/components/board/BoardToolbar";
import { MemorySidebar } from "@/components/board/MemorySidebar";
import { FiltersPanel } from "@/components/board/FiltersPanel";
import { LegendPanel } from "@/components/board/LegendPanel";
import { EdgeTypeDialog } from "@/components/board/EdgeTypeDialog";
import { MemoryDetailSidebar } from "@/components/board/MemoryDetailSidebar";
import { LinkMemoryDialog } from "@/components/board/LinkMemoryDialog";
import { Loader2, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  toBlob,
} from "html-to-image";

// ── Type colors for graph nodes ──────────────────────────────────────

const TYPE_COLORS: { [k: string]: { bg: string; border: string; text: string } } = {
  decision: { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  insight:  { bg: "#f3e8ff", border: "#a855f7", text: "#6b21a8" },
  meeting:  { bg: "#dcfce7", border: "#22c55e", text: "#166534" },
  idea:     { bg: "#fef9c3", border: "#eab308", text: "#854d0e" },
  context:  { bg: "#e0e7ff", border: "#6366f1", text: "#3730a3" },
  tasklike: { bg: "#ffe4e6", border: "#f43f5e", text: "#9f1239" },
  note:     { bg: "#f1f5f9", border: "#94a3b8", text: "#334155" },
};

const GRAPH_EDGE_COLORS: { [k: string]: string } = {
  same_topic: "#94a3b8",
  contradicts: "#ef4444",
  depends_on: "#3b82f6",
  continuation_of: "#22c55e",
  same_people: "#a855f7",
  causes: "#f97316",
  temporal: "#06b6d4",
  supports: "#10b981",
};

// ── Force-directed layout (Fruchterman-Reingold) ────────────────────

function forceLayout(
  graphNodes: GNode[],
  graphEdges: GEdge[],
  onContentChange: (id: string, content: string) => void,
): Node[] {
  const count = graphNodes.length;
  if (count === 0) return [];

  const positions = new Map<string, { x: number; y: number }>();
  const spread = Math.max(600, Math.sqrt(count) * 120);
  graphNodes.forEach((n, i) => {
    const angle = i * 2.399963;
    const r = Math.sqrt(i + 1) * (spread / Math.sqrt(count));
    positions.set(n.id, { x: r * Math.cos(angle), y: r * Math.sin(angle) });
  });

  const iterations = Math.min(300, Math.max(80, count * 3));
  const idealDistance = Math.max(180, 2500 / Math.sqrt(count));

  for (let iter = 0; iter < iterations; iter++) {
    const temp = Math.max(0.1, 1 - iter / iterations);
    const forces = new Map<string, { fx: number; fy: number }>();
    for (const n of graphNodes) forces.set(n.id, { fx: 0, fy: 0 });

    for (let i = 0; i < graphNodes.length; i++) {
      const posA = positions.get(graphNodes[i].id)!;
      for (let j = i + 1; j < graphNodes.length; j++) {
        const posB = positions.get(graphNodes[j].id)!;
        let dx = posA.x - posB.x;
        let dy = posA.y - posB.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = 1; }
        const repulsion = (idealDistance * idealDistance) / dist;
        const fx = (dx / dist) * repulsion;
        const fy = (dy / dist) * repulsion;
        forces.get(graphNodes[i].id)!.fx += fx;
        forces.get(graphNodes[i].id)!.fy += fy;
        forces.get(graphNodes[j].id)!.fx -= fx;
        forces.get(graphNodes[j].id)!.fy -= fy;
      }
    }

    for (const e of graphEdges) {
      const posA = positions.get(e.source);
      const posB = positions.get(e.target);
      if (!posA || !posB) continue;
      let dx = posA.x - posB.x;
      let dy = posA.y - posB.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;
      const attraction = (dist * dist) / idealDistance;
      const fx = (dx / dist) * attraction;
      const fy = (dy / dist) * attraction;
      forces.get(e.source)!.fx -= fx;
      forces.get(e.source)!.fy -= fy;
      forces.get(e.target)!.fx += fx;
      forces.get(e.target)!.fy += fy;
    }

    const maxDisplacement = idealDistance * temp;
    for (const n of graphNodes) {
      const f = forces.get(n.id)!;
      const pos = positions.get(n.id)!;
      const magnitude = Math.sqrt(f.fx * f.fx + f.fy * f.fy);
      if (magnitude > 0) {
        const scale = Math.min(magnitude, maxDisplacement) / magnitude;
        pos.x += f.fx * scale * temp;
        pos.y += f.fy * scale * temp;
      }
    }
  }

  return graphNodes.map((gn) => {
    const pos = positions.get(gn.id)!;
    return {
      id: `graph-${gn.id}`,
      type: "memory",
      position: { x: pos.x, y: pos.y },
      data: {
        title: gn.title,
        summary: gn.summary || "",
        recordType: gn.record_type,
        recordId: gn.id,
        content: gn.title,
        fromGraph: true,
        onContentChange,
      },
    };
  });
}

function layoutGraphEdges(graphEdges: GEdge[], allNodeIds: Set<string>): Edge[] {
  return graphEdges
    .map((ge) => {
      const sourceId = allNodeIds.has(`graph-${ge.source}`) ? `graph-${ge.source}` : ge.source;
      const targetId = allNodeIds.has(`graph-${ge.target}`) ? `graph-${ge.target}` : ge.target;
      if (!allNodeIds.has(sourceId) || !allNodeIds.has(targetId)) return null;
      const color = GRAPH_EDGE_COLORS[ge.kind] || GRAPH_EDGE_COLORS.same_topic;
      return {
        id: `graph-edge-${ge.id}`,
        source: sourceId,
        target: targetId,
        label: ge.kind.replace(/_/g, " "),
        type: "default",
        animated: ge.kind === "causes" || ge.kind === "depends_on",
        style: {
          stroke: color,
          strokeWidth: ge.kind === "contradicts" ? 2.5 : 1.5,
          strokeDasharray: ge.kind === "contradicts" ? "6,4" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color,
        },
        labelStyle: { fontSize: 9, fill: "#64748b", fontWeight: 500 },
        labelBgStyle: { fill: "var(--background, #fff)", fillOpacity: 0.85 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        data: { fromGraph: true, kind: ge.kind },
      } as Edge;
    })
    .filter(Boolean) as Edge[];
}

const nodeTypes = {
  sticky: StickyNode,
  text: TextNode,
  memory: MemoryNode,
  rectangle: RectangleNode,
  circle: CircleNode,
  diamond: DiamondNode,
  drawing: DrawingNode,
  image: ImageNode,
  link: LinkNode,
  comment: CommentNode,
};

// Convert DB board nodes → React Flow nodes
function dbToFlowNodes(
  dbNodes: DBBoardNode[],
  onContentChange: (id: string, content: string) => void
): Node[] {
  return dbNodes.map((n) => ({
    id: n.id,
    type: n.node_type,
    position: { x: n.x, y: n.y },
    data: {
      content: n.content || "",
      color: n.color || "#fef08a",
      label: n.content || "",
      title: n.content || "",
      summary: "",
      recordType: "note",
      ...(n.data ? tryParse(n.data) : {}),
      onContentChange,
    },
  }));
}

// Convert DB board edges → React Flow edges (with kind/color restoration)
function dbToFlowEdges(dbEdges: DBBoardEdge[]): Edge[] {
  return dbEdges.map((e) => {
    const edgeData = e.data ? tryParse(e.data) : {};
    const kind =
      (edgeData as { kind?: string })?.kind || e.kind || "default";
    const color = EDGE_KIND_COLORS[kind] || EDGE_KIND_COLORS.default;
    return {
      id: e.id,
      source: e.from_node_id,
      target: e.to_node_id,
      label: e.label || kind.replace(/_/g, " "),
      type: "default",
      style: {
        stroke: color,
        strokeDasharray: kind === "contradicts" ? "5 5" : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 12,
        height: 12,
        color,
      },
      data: { ...edgeData, kind },
    };
  });
}

function flowToDbNodes(nodes: Node[], boardId: string): string {
  const dbNodes = nodes
    .filter((n) => !(n.data as { fromGraph?: boolean })?.fromGraph)
    .map((n) => ({
      id: n.id,
      board_id: boardId,
      node_type: n.type || "sticky",
      record_id:
        (n.data as { recordId?: string })?.recordId || null,
      content:
        (n.data as { content?: string })?.content ||
        (n.data as { title?: string })?.title ||
        "",
      x: n.position.x,
      y: n.position.y,
      width: n.measured?.width || null,
      height: n.measured?.height || null,
      color: (n.data as { color?: string })?.color || null,
      data: JSON.stringify({
        title: (n.data as { title?: string })?.title,
        summary: (n.data as { summary?: string })?.summary,
        recordType: (n.data as { recordType?: string })?.recordType,
        recordId: (n.data as { recordId?: string })?.recordId,
        linkedMemory: (n.data as { linkedMemory?: unknown })?.linkedMemory,
        path: (n.data as { path?: string })?.path,
        strokeWidth: (n.data as { strokeWidth?: number })?.strokeWidth,
        // Image node data
        src: (n.data as { src?: string })?.src,
        alt: (n.data as { alt?: string })?.alt,
        // Link node data
        url: (n.data as { url?: string })?.url,
        // Comment node data
        author: (n.data as { author?: string })?.author,
      }),
      style: null,
    }));
  return JSON.stringify(dbNodes);
}

function flowToDbEdges(edges: Edge[], boardId: string): string {
  const dbEdges = edges
    .filter((e) => !(e.data as { fromGraph?: boolean })?.fromGraph)
    .map((e) => ({
      id: e.id,
      board_id: boardId,
      from_node_id: e.source,
      to_node_id: e.target,
      kind: (e.data as { kind?: string })?.kind || "default",
      label: typeof e.label === "string" ? e.label : null,
      style: e.style ? JSON.stringify(e.style) : null,
      data: e.data ? JSON.stringify(e.data) : null,
    }));
  return JSON.stringify(dbEdges);
}

function tryParse(json: string): { [key: string]: unknown } {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function genId(): string {
  return crypto.randomUUID();
}

function pointsToSvgPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

// ── Inner Board ─────────────────────────────────────────────────────

function BoardInner() {
  const { activeTool, stickyColor, shapeColor, fullscreen, typeFilters, edgeFilters } =
    useBoardStore();
  const [boardId, setBoardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactFlow = useReactFlow();
  const allNodesRef = useRef<Node[]>([]);
  const allEdgesRef = useRef<Edge[]>([]);

  // Graph data for filters/legend
  const [rawGraphNodes, setRawGraphNodes] = useState<GNode[]>([]);
  const [rawGraphEdges, setRawGraphEdges] = useState<GEdge[]>([]);
  const [layouting, setLayouting] = useState(false);
  const [graphTypeFilter, setGraphTypeFilter] = useState<string | null>(null);

  // Edge type dialog
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(
    null
  );

  // Memory detail sidebar
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Link memory to node dialog
  const [linkMemoryNodeId, setLinkMemoryNodeId] = useState<string | null>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([]);

  // Image upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image upload handler
  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        const img = new window.Image();
        img.onload = () => {
          const maxW = 400;
          const scale = img.width > maxW ? maxW / img.width : 1;
          const position = reactFlow.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          });
          const newNode: Node = {
            id: genId(),
            type: "image",
            position,
            data: {
              src,
              alt: file.name,
              width: Math.round(img.width * scale),
              height: Math.round(img.height * scale),
            },
          };
          setNodes((nds) => [...nds, newNode]);
          allNodesRef.current = [...allNodesRef.current, newNode];
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
      // Reset so the same file can be re-uploaded
      e.target.value = "";
    },
    [reactFlow, setNodes]
  );

  // Download as PNG with watermark
  const handleDownload = useCallback(async () => {
    const viewport = document.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!viewport) return;
    try {
      const blob = await toBlob(viewport, {
        backgroundColor: "white",
        pixelRatio: 2,
        filter: (node: HTMLElement) => {
          // Filter out controls, minimap, toolbar overlays
          const cls = node.classList;
          if (!cls) return true;
          if (
            cls.contains("react-flow__controls") ||
            cls.contains("react-flow__minimap") ||
            cls.contains("react-flow__attribution")
          )
            return false;
          return true;
        },
      });
      if (!blob) return;

      // Add watermark
      const img = new window.Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        // Watermark
        const fontSize = Math.max(14, Math.round(img.width * 0.015));
        ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText("Made with Reattend", img.width - 20, img.height - 16);

        canvas.toBlob((finalBlob) => {
          if (!finalBlob) return;
          const a = document.createElement("a");
          a.href = URL.createObjectURL(finalBlob);
          a.download = `reattend-board-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(a.href);
        }, "image/png");
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (err) {
      console.error("Download failed:", err);
    }
  }, []);

  const onContentChange = useCallback(
    (nodeId: string, content: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: { ...n.data, content, title: content, label: content },
              }
            : n
        )
      );
    },
    [setNodes]
  );

  // Load board + graph data
  useEffect(() => {
    Promise.all([getBoard(), getGraphData()])
      .then(([boardData, graphData]) => {
        setBoardId(boardData.board.id);

        // Board nodes (user-created)
        const boardNodes = dbToFlowNodes(boardData.nodes, onContentChange);
        const boardEdges = dbToFlowEdges(boardData.edges);

        // Store raw graph data for filters/legend
        setRawGraphNodes(graphData.nodes);
        setRawGraphEdges(graphData.edges);

        // Filter out graph nodes already on the board
        const existingByRecordId = new Set(
          boardNodes
            .map((n) => (n.data as { recordId?: string })?.recordId)
            .filter(Boolean)
        );
        const uniqueGraphNodes = graphData.nodes.filter(
          (gn) => !existingByRecordId.has(gn.id)
        );

        // Force-directed layout for graph nodes
        setLayouting(true);
        requestAnimationFrame(() => {
          const graphFlowNodes = forceLayout(uniqueGraphNodes, graphData.edges, onContentChange);

          // Build graph edges with proper node IDs
          const allNodeIds = new Set([
            ...boardNodes.map((n) => n.id),
            ...graphFlowNodes.map((n) => n.id),
          ]);
          const graphFlowEdges = layoutGraphEdges(graphData.edges, allNodeIds);

          const combined = [...boardNodes, ...graphFlowNodes];
          const combinedEdges = [...boardEdges, ...graphFlowEdges];
          allNodesRef.current = combined;
          allEdgesRef.current = combinedEdges;
          setNodes(combined);
          setEdges(combinedEdges);
          setLayouting(false);
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Apply filters (board-store type/edge filters + graph type filter)
  useEffect(() => {
    if (loading) return;

    const filteredNodes = allNodesRef.current.filter((n) => {
      const rt = (n.data as { recordType?: string })?.recordType;
      if (rt && typeFilters[rt]) return false;
      // Graph type filter (single select)
      const isGraph = (n.data as { fromGraph?: boolean })?.fromGraph;
      if (isGraph && graphTypeFilter && rt !== graphTypeFilter) return false;
      return true;
    });

    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = allEdgesRef.current.filter((e) => {
      const kind = (e.data as { kind?: string })?.kind;
      if (kind && edgeFilters[kind]) return false;
      if (!visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target))
        return false;
      return true;
    });

    setNodes(filteredNodes);
    setEdges(filteredEdges);
  }, [typeFilters, edgeFilters, graphTypeFilter, loading]);

  // Graph stats
  const graphStats = useMemo(() => ({
    nodes: rawGraphNodes.length,
    edges: rawGraphEdges.length,
  }), [rawGraphNodes, rawGraphEdges]);

  // Auto-save (debounced 2s) — only save non-graph nodes/edges
  useEffect(() => {
    if (!boardId || loading) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveBoard({
        board_id: boardId,
        nodes: flowToDbNodes(nodes, boardId),
        edges: flowToDbEdges(edges, boardId),
      }).catch(() => {});
    }, 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [nodes, edges, boardId, loading]);

  // onConnect → show edge type dialog
  const onConnect = useCallback((_connection: Connection) => {
    setPendingConnection(_connection);
  }, []);

  const handleEdgeConfirm = useCallback(
    (kind: string, label: string) => {
      if (!pendingConnection) return;
      const color = EDGE_KIND_COLORS[kind] || EDGE_KIND_COLORS.default;
      setEdges((eds) =>
        addEdge(
          {
            ...pendingConnection,
            id: genId(),
            label: label || kind.replace(/_/g, " "),
            style: {
              stroke: color,
              strokeDasharray: kind === "contradicts" ? "5 5" : undefined,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 12,
              height: 12,
              color,
            },
            data: { kind },
          },
          eds
        )
      );
      setPendingConnection(null);
    },
    [pendingConnection, setEdges]
  );

  const handleEdgeCancel = useCallback(() => {
    setPendingConnection(null);
  }, []);

  // Node click → memory detail sidebar
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const recordId = (node.data as { recordId?: string })?.recordId;
      if (recordId && node.type === "memory") {
        setSelectedRecordId(recordId);
      }
    },
    []
  );

  // Right-click non-memory nodes → link memory dialog
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      if (node.type !== "memory") {
        setLinkMemoryNodeId(node.id);
      }
    },
    []
  );

  // Handle linking a memory to a custom node
  const handleLinkMemory = useCallback(
    (record: MemoryRecord) => {
      if (!linkMemoryNodeId) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === linkMemoryNodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  linkedMemory: {
                    id: record.id,
                    title: record.title,
                    type: record.type,
                  },
                },
              }
            : n
        )
      );
      setLinkMemoryNodeId(null);
    },
    [linkMemoryNodeId, setNodes]
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      // Close memory detail sidebar
      setSelectedRecordId(null);

      if (activeTool === "select" || activeTool === "pan" || activeTool === "draw" || activeTool === "image") return;

      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let newNode: Node;

      if (activeTool === "link") {
        newNode = {
          id: genId(),
          position,
          type: "link",
          data: {
            url: "",
            title: "",
            content: "",
            onContentChange,
          },
        };
      } else if (activeTool === "comment") {
        newNode = {
          id: genId(),
          position,
          type: "comment",
          data: {
            content: "",
            onContentChange,
          },
        };
      } else {
        newNode = {
          id: genId(),
          position,
          type: activeTool,
          data: {
            content: "",
            color:
              activeTool === "sticky"
                ? stickyColor
                : ["rectangle", "circle", "diamond"].includes(activeTool)
                  ? shapeColor
                  : "#94a3b8",
            label: "",
            title: "",
            summary: "",
            recordType: "note",
            onContentChange,
          },
        };
      }

      setNodes((nds) => [...nds, newNode]);
      allNodesRef.current = [...allNodesRef.current, newNode];
    },
    [activeTool, stickyColor, shapeColor, reactFlow, setNodes, onContentChange]
  );

  const addMemoryNode = useCallback(
    (record: MemoryRecord) => {
      const position = reactFlow.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      position.x += (Math.random() - 0.5) * 100;
      position.y += (Math.random() - 0.5) * 100;

      const newNode: Node = {
        id: genId(),
        type: "memory",
        position,
        data: {
          title: record.title,
          summary: record.summary || "",
          recordType: record.type,
          recordId: record.id,
          content: record.title,
          onContentChange,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      allNodesRef.current = [...allNodesRef.current, newNode];
    },
    [reactFlow, setNodes, onContentChange]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const data = event.dataTransfer.getData("application/reattend-memory");
      if (!data) return;

      try {
        const record = JSON.parse(data) as MemoryRecord;
        const position = reactFlow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        const newNode: Node = {
          id: genId(),
          type: "memory",
          position,
          data: {
            title: record.title,
            summary: record.summary || "",
            recordType: record.type,
            recordId: record.id,
            content: record.title,
            onContentChange,
          },
        };

        setNodes((nds) => [...nds, newNode]);
        allNodesRef.current = [...allNodesRef.current, newNode];
      } catch {}
    },
    [reactFlow, setNodes, onContentChange]
  );

  // Delete — protect graph memory nodes from deletion
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Backspace" || event.key === "Delete") {
        setNodes((nds) =>
          nds.filter(
            (n) =>
              !n.selected ||
              (n.data as { fromGraph?: boolean })?.fromGraph === true
          )
        );
        setEdges((eds) =>
          eds.filter(
            (e) =>
              !e.selected ||
              (e.data as { fromGraph?: boolean })?.fromGraph === true
          )
        );
      }
    },
    [setNodes, setEdges]
  );

  // Drawing handlers
  const handleDrawMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDrawing(true);
      setDrawPoints([{ x: e.clientX, y: e.clientY }]);
    },
    []
  );

  const handleDrawMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing) return;
      setDrawPoints((prev) => [...prev, { x: e.clientX, y: e.clientY }]);
    },
    [isDrawing]
  );

  const handleDrawMouseUp = useCallback(() => {
    if (drawPoints.length > 2) {
      const origin = drawPoints[0];
      const flowPos = reactFlow.screenToFlowPosition({
        x: origin.x,
        y: origin.y,
      });
      const path = pointsToSvgPath(
        drawPoints.map((p) => ({
          x: p.x - origin.x,
          y: p.y - origin.y,
        }))
      );

      const newNode: Node = {
        id: genId(),
        type: "drawing",
        position: flowPos,
        data: { path, color: "#1a1a1a", strokeWidth: 2 },
      };
      setNodes((nds) => [...nds, newNode]);
      allNodesRef.current = [...allNodesRef.current, newNode];
    }
    setIsDrawing(false);
    setDrawPoints([]);
  }, [drawPoints, reactFlow, setNodes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "h-full relative",
        fullscreen && "fixed inset-0 z-50 bg-background"
      )}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {/* Layouting overlay */}
      {layouting && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 bg-background border rounded-lg px-4 py-2 shadow-md">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm font-medium">Computing layout...</span>
          </div>
        </div>
      )}

      {/* Graph type filter bar */}
      {graphStats.nodes > 0 && (
        <div className="absolute top-3 left-14 z-10 flex items-center gap-1 bg-background/95 backdrop-blur rounded-xl border p-1 shadow-md">
          <button
            onClick={() => setGraphTypeFilter(null)}
            className={cn(
              "px-2 py-1 rounded-lg text-[11px] font-medium transition-colors",
              !graphTypeFilter
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            All ({graphStats.nodes})
          </button>
          {RECORD_TYPES.map((t) => {
            const count = rawGraphNodes.filter((n) => n.record_type === t.value).length;
            if (count === 0) return null;
            const colors = TYPE_COLORS[t.value];
            return (
              <button
                key={t.value}
                onClick={() => setGraphTypeFilter(graphTypeFilter === t.value ? null : t.value)}
                className={cn(
                  "px-2 py-1 rounded-lg text-[11px] font-medium transition-all",
                  graphTypeFilter === t.value
                    ? "text-white shadow-sm"
                    : "text-muted-foreground hover:bg-accent"
                )}
                style={graphTypeFilter === t.value ? { backgroundColor: colors?.border || "#94a3b8" } : undefined}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Graph stats badge */}
      {graphStats.nodes > 0 && (
        <div className="absolute top-3 right-3 z-10">
          <div className="bg-background/95 backdrop-blur-xl rounded-xl border px-3 py-2 shadow-md text-[11px] text-muted-foreground font-medium">
            {graphStats.nodes} memories &middot; {graphStats.edges} links
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
        minZoom={0.05}
        maxZoom={3}
        panOnDrag={activeTool === "pan" || activeTool === "select"}
        selectionOnDrag={activeTool === "select"}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
      >
        <Background gap={24} size={1.5} color="var(--border)" />
        <Controls
          showInteractive={false}
          className="!bg-background/95 !backdrop-blur !border !rounded-xl !shadow-md"
        />
        <MiniMap
          nodeColor={(node) => {
            const type = (node.data as { recordType?: string })?.recordType || "note";
            return TYPE_COLORS[type]?.border || "#94a3b8";
          }}
          maskColor="rgba(0,0,0,0.08)"
          style={{ borderRadius: 12, border: "1px solid var(--border)" }}
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Drawing overlay */}
      {activeTool === "draw" && (
        <svg
          className="absolute inset-0 z-10 cursor-crosshair"
          onMouseDown={handleDrawMouseDown}
          onMouseMove={handleDrawMouseMove}
          onMouseUp={handleDrawMouseUp}
        >
          {drawPoints.length > 1 && (
            <path
              d={pointsToSvgPath(
                drawPoints.map((p) => ({
                  x: p.x - (drawPoints[0]?.x || 0),
                  y: p.y - (drawPoints[0]?.y || 0),
                }))
              )}
              stroke="#1a1a1a"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              transform={`translate(${drawPoints[0]?.x || 0}, ${drawPoints[0]?.y || 0})`}
            />
          )}
        </svg>
      )}

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <BoardToolbar onImageUpload={handleImageUpload} onDownload={handleDownload} />
      <MemorySidebar onDragMemory={addMemoryNode} />
      <FiltersPanel />
      <LegendPanel />

      {/* Memory detail sidebar on node click */}
      <MemoryDetailSidebar
        recordId={selectedRecordId}
        onClose={() => setSelectedRecordId(null)}
      />

      {/* Edge type dialog */}
      <EdgeTypeDialog
        open={pendingConnection !== null}
        onConfirm={handleEdgeConfirm}
        onCancel={handleEdgeCancel}
      />

      {/* Link memory dialog */}
      <LinkMemoryDialog
        open={linkMemoryNodeId !== null}
        onSelect={handleLinkMemory}
        onCancel={() => setLinkMemoryNodeId(null)}
      />

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
          <div className="text-center">
            <LayoutGrid className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground/50">
              Click anywhere to add nodes, or open the memories panel
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Wrapper ─────────────────────────────────────────────────────────

export default function BoardPage() {
  return (
    <ReactFlowProvider>
      <BoardInner />
    </ReactFlowProvider>
  );
}
