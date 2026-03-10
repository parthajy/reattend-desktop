import { useCallback } from "react";
import {
  MousePointer2,
  Hand,
  StickyNote,
  Type,
  Square,
  Circle,
  Diamond,
  Pencil,
  Maximize,
  Minimize,
  PanelRightOpen,
  Filter,
  Image,
  Link2,
  MessageCircle,
  Download,
  Map,
} from "lucide-react";
import {
  useBoardStore,
  STICKY_COLORS,
  SHAPE_COLORS,
  type BoardTool,
} from "@/stores/board-store";
import { cn } from "@/lib/utils";

interface BoardToolbarProps {
  onImageUpload?: () => void;
  onDownload?: () => void;
}

const POINTER_TOOLS: {
  tool: BoardTool;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}[] = [
  { tool: "select", icon: MousePointer2, label: "Select (V)" },
  { tool: "pan", icon: Hand, label: "Pan (H)" },
];

const CONTENT_TOOLS: {
  tool: BoardTool;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}[] = [
  { tool: "sticky", icon: StickyNote, label: "Sticky Note (S)" },
  { tool: "text", icon: Type, label: "Text (T)" },
  { tool: "comment", icon: MessageCircle, label: "Comment (C)" },
];

const SHAPE_TOOLS: {
  tool: BoardTool;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}[] = [
  { tool: "rectangle", icon: Square, label: "Rectangle" },
  { tool: "circle", icon: Circle, label: "Circle" },
  { tool: "diamond", icon: Diamond, label: "Diamond" },
];

const MEDIA_TOOLS: {
  tool: BoardTool;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  action?: boolean;
}[] = [
  { tool: "image", icon: Image, label: "Upload Image", action: true },
  { tool: "link", icon: Link2, label: "Add Link" },
  { tool: "draw", icon: Pencil, label: "Freehand Draw (D)" },
];

function ToolButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  tool?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "p-2 rounded-lg transition-all relative group/btn",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="w-4 h-4" />
      {/* Tooltip */}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-foreground text-background text-[10px] font-medium whitespace-nowrap opacity-0 group-hover/btn:opacity-100 pointer-events-none transition-opacity">
        {label}
      </span>
    </button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-border mx-0.5" />;
}

export function BoardToolbar({ onImageUpload, onDownload }: BoardToolbarProps) {
  const {
    activeTool,
    setTool,
    stickyColor,
    setStickyColor,
    shapeColor,
    setShapeColor,
    fullscreen,
    toggleFullscreen,
    toggleSidebar,
    toggleFilters,
    filtersOpen,
    toggleLegend,
    legendOpen,
  } = useBoardStore();

  const handleToolClick = useCallback(
    (tool: BoardTool) => {
      if (tool === "image" && onImageUpload) {
        onImageUpload();
        return;
      }
      setTool(tool);
    },
    [setTool, onImageUpload]
  );

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 bg-background/95 backdrop-blur-xl border rounded-2xl px-2 py-1.5 shadow-xl">
      {/* Pointer tools */}
      {POINTER_TOOLS.map(({ tool, icon, label }) => (
        <ToolButton
          key={tool}
          tool={tool}
          icon={icon}
          label={label}
          active={activeTool === tool}
          onClick={() => handleToolClick(tool)}
        />
      ))}

      <Divider />

      {/* Content tools */}
      {CONTENT_TOOLS.map(({ tool, icon, label }) => (
        <ToolButton
          key={tool}
          tool={tool}
          icon={icon}
          label={label}
          active={activeTool === tool}
          onClick={() => handleToolClick(tool)}
        />
      ))}

      <Divider />

      {/* Shape tools */}
      {SHAPE_TOOLS.map(({ tool, icon, label }) => (
        <ToolButton
          key={tool}
          tool={tool}
          icon={icon}
          label={label}
          active={activeTool === tool}
          onClick={() => handleToolClick(tool)}
        />
      ))}

      <Divider />

      {/* Media tools */}
      {MEDIA_TOOLS.map(({ tool, icon, label }) => (
        <ToolButton
          key={tool}
          tool={tool}
          icon={icon}
          label={label}
          active={activeTool === tool}
          onClick={() => handleToolClick(tool)}
        />
      ))}

      {/* Color pickers */}
      {activeTool === "sticky" && (
        <>
          <Divider />
          {STICKY_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setStickyColor(color)}
              title={color}
              className={cn(
                "w-5 h-5 rounded-full border-2 transition-transform",
                stickyColor === color
                  ? "border-foreground scale-110"
                  : "border-transparent hover:scale-110"
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </>
      )}

      {["rectangle", "circle", "diamond"].includes(activeTool) && (
        <>
          <Divider />
          {SHAPE_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setShapeColor(color)}
              title={color}
              className={cn(
                "w-5 h-5 rounded-full border-2 transition-transform",
                shapeColor === color
                  ? "border-foreground scale-110"
                  : "border-transparent hover:scale-110"
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </>
      )}

      <Divider />

      {/* Action buttons */}
      <ToolButton
        tool="filters"
        icon={Filter}
        label="Filters"
        active={filtersOpen}
        onClick={toggleFilters}
      />

      <ToolButton
        tool="legend"
        icon={Map}
        label="Legend"
        active={legendOpen}
        onClick={toggleLegend}
      />

      <ToolButton
        tool="sidebar"
        icon={PanelRightOpen}
        label="Show Memories"
        active={false}
        onClick={toggleSidebar}
      />

      <Divider />

      <ToolButton
        tool="download"
        icon={Download}
        label="Download as PNG"
        active={false}
        onClick={() => onDownload?.()}
      />

      <ToolButton
        tool="fullscreen"
        icon={fullscreen ? Minimize : Maximize}
        label={fullscreen ? "Exit Fullscreen" : "Fullscreen"}
        active={fullscreen}
        onClick={toggleFullscreen}
      />
    </div>
  );
}
