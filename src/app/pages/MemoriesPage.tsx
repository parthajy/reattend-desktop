import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getRecords,
  createRecord,
  getProjects,
  deleteRecord,
  addRecordToProject,
} from "@/lib/tauri-api";
import type { Record, Project } from "@/types";
import { RECORD_TYPES, parseTags } from "@/types";
import { useAppStore } from "@/stores/app-store";
import {
  Brain,
  Grid3X3,
  List,
  Loader2,
  Search,
  Plus,
  X,
  FileText,
  Sparkles,
  FolderKanban,
  ChevronDown,
  Trash2,
  MoreVertical,
  Target,
  Lightbulb,
  MessageSquare,
  Mic,
  Zap,
  ListTodo,
  StickyNote,
  Clock,
  Tag,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Type config ───────────────────────────────────────────────────────

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
  transcript: {
    icon: Mic,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    label: "Transcript",
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

export default function MemoriesPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [typeFilter, setTypeFilter] = useState<string | null>(() => {
    const pending = useAppStore.getState().pendingNavFilter;
    if (pending) useAppStore.getState().setPendingNavFilter(null);
    return pending;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
  }, []);

  const handleDeleteRecord = async (id: string) => {
    if (!confirm("Delete this memory?")) return;
    try {
      await deleteRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch {}
  };

  const handleAssignToProject = async (
    recordId: string,
    projectId: string
  ) => {
    try {
      await addRecordToProject(projectId, recordId);
    } catch {}
  };

  function loadRecords() {
    setLoading(true);
    getRecords({
      limit: 100,
      type_filter: typeFilter ?? undefined,
    })
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRecords();
  }, [typeFilter]);

  const filtered = searchQuery
    ? records.filter(
        (r) =>
          r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.summary?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : records;

  return (
    <div className="flex-1 overflow-auto relative">
      {/* Halo gradient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/3 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-violet-400/8 via-indigo-400/8 to-blue-400/5 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-pink-300/6 to-violet-300/6 blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto p-6 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Memories</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {filtered.length} {filtered.length === 1 ? "memory" : "memories"}
              {typeFilter ? ` filtered by ${typeFilter}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-shadow"
            >
              <Plus className="w-4 h-4" />
              New Memory
            </button>
            <div className="flex bg-muted/60 rounded-lg p-0.5 border">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === "grid"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === "list"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border bg-background/80 backdrop-blur-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/30 transition-all"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setTypeFilter(null)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                !typeFilter
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              All
            </button>
            {RECORD_TYPES.map((t) => {
              const config = TYPE_CONFIG[t.value];
              return (
                <button
                  key={t.value}
                  onClick={() =>
                    setTypeFilter(typeFilter === t.value ? null : t.value)
                  }
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                    typeFilter === t.value
                      ? "bg-foreground text-background shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {config && (
                    <config.icon
                      className={cn(
                        "w-3 h-3",
                        typeFilter === t.value
                          ? "text-background"
                          : config.color
                      )}
                    />
                  )}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center mx-auto mb-4">
              <Brain className="h-7 w-7 text-violet-400" />
            </div>
            <p className="text-base font-semibold text-foreground">
              No memories found
            </p>
            <p className="text-sm mt-1">
              {searchQuery || typeFilter
                ? "Try adjusting your filters."
                : "Create your first memory to get started."}
            </p>
            {!searchQuery && !typeFilter && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Memory
              </button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((r) => (
              <MemoryCard
                key={r.id}
                record={r}
                projects={projects}
                onClick={() => navigate(`/memories/${r.id}`)}
                onDelete={() => handleDeleteRecord(r.id)}
                onAssign={(projectId) =>
                  handleAssignToProject(r.id, projectId)
                }
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <MemoryRow
                key={r.id}
                record={r}
                onClick={() => navigate(`/memories/${r.id}`)}
                onDelete={() => handleDeleteRecord(r.id)}
              />
            ))}
          </div>
        )}

        {/* Create dialog */}
        {showCreate && (
          <CreateMemoryDialog
            onClose={() => setShowCreate(false)}
            onCreate={() => {
              setShowCreate(false);
              loadRecords();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Create Memory Dialog ──────────────────────────────────────────────

function CreateMemoryDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: () => void;
}) {
  const [content, setContent] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      const trimmed = content.trim();
      const title =
        trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed;
      await createRecord({
        title,
        content: trimmed,
        record_type: "note",
      });
      setDone(true);
      setTimeout(() => onCreate(), 1200);
    } catch {
      setSaving(false);
    }
  }

  const selectedProject = projects.find((p) => p.id === projectId);

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
          <div className="flex flex-col items-center py-10">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center mb-3">
              <Sparkles className="h-6 w-6 text-indigo-500" />
            </div>
            <p className="text-sm font-semibold">Memory captured!</p>
            <p className="text-xs text-muted-foreground mt-1">
              AI is enriching it in the background...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={handleCreate}
        onClick={(e) => e.stopPropagation()}
        className="bg-background border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-semibold">New Memory</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="e.g., Decided to use React Flow for the memory graph. It supports custom nodes and has great performance for 500+ nodes..."
            rows={6}
            className="w-full bg-transparent text-sm resize-none focus:outline-none placeholder:text-muted-foreground/50 leading-relaxed"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleCreate(e);
              }
              if (e.key === "Escape") {
                onClose();
              }
            }}
          />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowProjectMenu(!showProjectMenu)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors border"
              >
                <FolderKanban className="h-3 w-3" />
                {selectedProject ? (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: selectedProject.color }}
                    />
                    {selectedProject.name}
                  </span>
                ) : (
                  "No project"
                )}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showProjectMenu && (
                <div className="absolute bottom-full left-0 mb-1 w-48 bg-background border rounded-lg shadow-lg py-1 z-10">
                  <button
                    type="button"
                    onClick={() => {
                      setProjectId(null);
                      setShowProjectMenu(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                      !projectId && "bg-muted font-medium"
                    )}
                  >
                    No project
                  </button>
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setProjectId(p.id);
                        setShowProjectMenu(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2",
                        projectId === p.id && "bg-muted font-medium"
                      )}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              AI will extract title, tags, entities
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              {"\u2318"}Enter
            </span>
            <button
              type="submit"
              disabled={!content.trim() || saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Capture
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Memory Card (Grid view) ───────────────────────────────────────────

function MemoryCard({
  record,
  projects,
  onClick,
  onDelete,
  onAssign,
}: {
  record: Record;
  projects: Project[];
  onClick: () => void;
  onDelete: () => void;
  onAssign: (projectId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const tags = parseTags(record.tags);
  const config = TYPE_CONFIG[record.type] || TYPE_CONFIG.note;
  const Icon = config.icon;

  return (
    <div
      onClick={onClick}
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
          {record.confidence !== null && (
            <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
              {Math.round(record.confidence * 100)}%
            </span>
          )}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="p-1 rounded-lg hover:bg-muted/80 opacity-0 group-hover:opacity-100 transition-all"
            >
              <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-48 bg-background border rounded-xl shadow-lg py-1 z-20"
                onClick={(e) => e.stopPropagation()}
              >
                {projects.length > 0 && (
                  <>
                    <p className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Assign to project
                    </p>
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          onAssign(p.id);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        {p.name}
                      </button>
                    ))}
                    <div className="my-1 border-t" />
                  </>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete memory
                </button>
              </div>
            )}
          </div>
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
        <div
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          Open
          <ArrowUpRight className="h-3 w-3" />
        </div>
      </div>
    </div>
  );
}

// ── Memory Row (List view) ────────────────────────────────────────────

function MemoryRow({
  record,
  onClick,
  onDelete,
}: {
  record: Record;
  onClick: () => void;
  onDelete: () => void;
}) {
  const config = TYPE_CONFIG[record.type] || TYPE_CONFIG.note;
  const Icon = config.icon;
  const tags = parseTags(record.tags);

  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-4 px-5 py-4 rounded-xl border bg-card hover:shadow-md hover:shadow-black/5 dark:hover:shadow-black/20 hover:border-border/80 cursor-pointer transition-all duration-200"
    >
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
          config.bgColor
        )}
      >
        <Icon className={cn("h-4 w-4", config.color)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wide",
              config.color
            )}
          >
            {config.label}
          </span>
          {record.confidence !== null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {Math.round(record.confidence * 100)}%
            </span>
          )}
        </div>
        <p className="text-sm font-medium truncate">{record.title}</p>
        {record.summary && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {record.summary}
          </p>
        )}
      </div>
      {tags.length > 0 && (
        <div className="hidden lg:flex gap-1.5 shrink-0">
          {tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <span className="text-[11px] text-muted-foreground shrink-0 min-w-[60px] text-right">
        {timeAgo(record.created_at)}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 rounded-lg hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </button>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}
