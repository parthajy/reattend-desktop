import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Brain,
  Loader2,
  Plus,
  Trash2,
  LayoutGrid,
  Lightbulb,
  Target,
  MessageSquare,
  FileText,
  Zap,
  ListTodo,
  StickyNote,
  Clock,
  Tag,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getProject,
  getProjectRecords,
  removeRecordFromProject,
} from "@/lib/tauri-api";
import { useAppStore } from "@/stores/app-store";
import type { Project, Record as MemoryRecord } from "@/types";
import { parseTags } from "@/types";

const TYPE_CONFIG: {
  [key: string]: {
    icon: typeof Brain;
    color: string;
    bgColor: string;
    label: string;
  };
} = {
  decision: {
    icon: Target,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    label: "Decision",
  },
  insight: {
    icon: Lightbulb,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    label: "Insight",
  },
  meeting: {
    icon: MessageSquare,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    label: "Meeting",
  },
  idea: {
    icon: Zap,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    label: "Idea",
  },
  context: {
    icon: FileText,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    label: "Context",
  },
  tasklike: {
    icon: ListTodo,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    label: "Task",
  },
  note: {
    icon: StickyNote,
    color: "text-slate-400",
    bgColor: "bg-slate-500/10",
    label: "Note",
  },
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { setCommandOpen, setCaptureProject } = useAppStore();

  const fetchData = async () => {
    if (!id) return;
    try {
      const [p, r] = await Promise.all([
        getProject(id),
        getProjectRecords(id),
      ]);
      setProject(p);
      setRecords(r);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleRemove = async (recordId: string) => {
    if (!id) return;
    try {
      await removeRecordFromProject(id, recordId);
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
    } catch {
      // silent
    }
  };

  const handleAddMemory = () => {
    if (!project) return;
    setCaptureProject(project.id, project.name);
    setCommandOpen(true);
  };

  // Type breakdown
  const typeCounts: { [key: string]: number } = {};
  records.forEach((r) => {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p>Project not found</p>
        <Button
          variant="ghost"
          className="mt-2"
          onClick={() => navigate("/projects")}
        >
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto relative">
      {/* Halo gradient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 right-1/4 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-indigo-400/8 via-violet-400/8 to-purple-400/5 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-pink-300/6 to-indigo-300/6 blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto p-6 relative z-10">
        {/* Back */}
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2 text-muted-foreground"
          onClick={() => navigate("/projects")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Projects
        </Button>

        {/* Header Card */}
        <div className="rounded-2xl border bg-card p-6 mb-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-xl text-white font-bold text-xl shrink-0 shadow-sm"
              style={{ backgroundColor: project.color }}
            >
              {project.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">
                {project.name}
              </h1>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {project.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Brain className="h-3.5 w-3.5" />
                  <span className="font-medium">
                    {records.length}{" "}
                    {records.length === 1 ? "memory" : "memories"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => navigate("/board")}
              >
                <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
                Board
              </Button>
              <Button
                size="sm"
                onClick={handleAddMemory}
                className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-shadow"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Memory
              </Button>
            </div>
          </div>

          {/* Type breakdown */}
          {Object.keys(typeCounts).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t">
              {Object.entries(typeCounts).map(([type, count]) => {
                const config = TYPE_CONFIG[type];
                const Icon = config?.icon || Brain;
                return (
                  <div
                    key={type}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
                      config?.bgColor || "bg-muted/50"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        config?.color || "text-muted-foreground"
                      )}
                    />
                    <span>{config?.label || type}</span>
                    <span className="text-muted-foreground ml-0.5">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Memories */}
        {records.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center mx-auto mb-4">
              <Brain className="h-7 w-7 text-violet-400" />
            </div>
            <p className="text-base font-semibold text-foreground">
              No memories in this project
            </p>
            <p className="text-sm mt-1">
              Add memories to group them together.
            </p>
            <button
              onClick={handleAddMemory}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Memory
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {records.map((record) => {
              const config = TYPE_CONFIG[record.type] || TYPE_CONFIG.note;
              const Icon = config.icon;
              const tags = parseTags(record.tags);

              return (
                <div
                  key={record.id}
                  onClick={() => navigate(`/memories/${record.id}`)}
                  className="group relative flex flex-col rounded-2xl border bg-card hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 hover:border-border/80 transition-all duration-200 cursor-pointer overflow-hidden"
                >
                  {/* Top bar */}
                  <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg",
                          config.bgColor
                        )}
                      >
                        <Icon className={cn("h-4 w-4", config.color)} />
                      </div>
                      <span
                        className={cn(
                          "text-[11px] font-semibold uppercase tracking-wide",
                          config.color
                        )}
                      >
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {record.confidence != null && (
                        <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
                          {Math.round(record.confidence * 100)}%
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(record.id);
                        }}
                        className="p-1 rounded-lg hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="px-5 pb-3 flex-1">
                    <h3 className="text-sm font-semibold leading-snug line-clamp-2 mb-1.5">
                      {record.title}
                    </h3>
                    {record.summary && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {record.summary}
                      </p>
                    )}
                  </div>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="px-5 pb-3 flex gap-1.5 flex-wrap">
                      {tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {tag}
                        </span>
                      ))}
                      {tags.length > 3 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium">
                          +{tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-auto border-t px-5 py-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {timeAgo(record.created_at)}
                    </span>
                    <div className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      Open
                      <ArrowUpRight className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
