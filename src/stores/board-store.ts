import { create } from "zustand";

export type BoardTool =
  | "select"
  | "pan"
  | "sticky"
  | "text"
  | "rectangle"
  | "circle"
  | "diamond"
  | "draw"
  | "image"
  | "link"
  | "comment";

export const STICKY_COLORS = [
  "#fef08a", // yellow
  "#fda4af", // pink
  "#93c5fd", // blue
  "#86efac", // green
  "#d8b4fe", // purple
  "#fdba74", // orange
] as const;

export const EDGE_KIND_COLORS: { [key: string]: string } = {
  same_topic: "#8b5cf6",
  depends_on: "#3b82f6",
  contradicts: "#ef4444",
  supports: "#22c55e",
  continuation_of: "#06b6d4",
  causes: "#f97316",
  temporal: "#f59e0b",
  followup: "#f59e0b",
  default: "#94a3b8",
};

export const SHAPE_COLORS = [
  "#94a3b8", // slate
  "#3b82f6", // blue
  "#22c55e", // green
  "#ef4444", // red
  "#a855f7", // purple
  "#f59e0b", // amber
  "#ec4899", // pink
] as const;

interface BoardState {
  activeTool: BoardTool;
  stickyColor: string;
  shapeColor: string;
  fullscreen: boolean;
  sidebarOpen: boolean;

  // Filters
  typeFilters: { [key: string]: boolean };
  edgeFilters: { [key: string]: boolean };
  filtersOpen: boolean;

  // Legend
  legendOpen: boolean;

  setTool: (tool: BoardTool) => void;
  setStickyColor: (color: string) => void;
  setShapeColor: (color: string) => void;
  toggleFullscreen: () => void;
  toggleSidebar: () => void;
  toggleTypeFilter: (type: string) => void;
  toggleEdgeFilter: (kind: string) => void;
  toggleFilters: () => void;
  toggleLegend: () => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  activeTool: "select",
  stickyColor: STICKY_COLORS[0],
  shapeColor: SHAPE_COLORS[0],
  fullscreen: false,
  sidebarOpen: false,

  typeFilters: {},
  edgeFilters: {},
  filtersOpen: false,
  legendOpen: false,

  setTool: (tool) => set({ activeTool: tool }),
  setStickyColor: (color) => set({ stickyColor: color }),
  setShapeColor: (color) => set({ shapeColor: color }),
  toggleFullscreen: () => set((s) => ({ fullscreen: !s.fullscreen })),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleTypeFilter: (type) =>
    set((s) => ({
      typeFilters: { ...s.typeFilters, [type]: !s.typeFilters[type] },
    })),
  toggleEdgeFilter: (kind) =>
    set((s) => ({
      edgeFilters: { ...s.edgeFilters, [kind]: !s.edgeFilters[kind] },
    })),
  toggleFilters: () => set((s) => ({ filtersOpen: !s.filtersOpen })),
  toggleLegend: () => set((s) => ({ legendOpen: !s.legendOpen })),
}));
