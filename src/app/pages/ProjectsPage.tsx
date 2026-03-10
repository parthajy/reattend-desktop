import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderKanban,
  Plus,
  Brain,
  Loader2,
  Trash2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getProjects, createProject, deleteProject } from "@/lib/tauri-api";
import type { Project } from "@/types";

const PROJECT_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
];

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);
  const [creating, setCreating] = useState(false);

  const fetchProjects = async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createProject({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        color: newColor,
      });
      setNewName("");
      setNewDesc("");
      setNewColor(PROJECT_COLORS[0]);
      setDialogOpen(false);
      await fetchProjects();
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteProject(id);
      await fetchProjects();
    } catch {
      // silent
    }
  };

  return (
    <div className="flex-1 overflow-auto relative">
      {/* Halo gradient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 right-1/4 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-indigo-400/8 via-violet-400/8 to-purple-400/5 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-pink-300/6 to-indigo-300/6 blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto p-6 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Organize and group your memories into projects
            </p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-shadow"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center mx-auto mb-4">
              <FolderKanban className="h-7 w-7 text-indigo-400" />
            </div>
            <p className="text-base font-semibold text-foreground">
              No projects yet
            </p>
            <p className="text-sm mt-1">
              Create your first project to organize memories.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-5"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="group relative flex flex-col rounded-2xl border bg-card hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 hover:border-border/80 transition-all duration-200 cursor-pointer overflow-hidden"
              >
                {/* Top section */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-white font-bold text-base shrink-0 shadow-sm"
                    style={{ backgroundColor: project.color }}
                  >
                    {project.name[0]?.toUpperCase()}
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, project.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {/* Title section */}
                <div className="px-5 pb-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(project.created_at)}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold tracking-tight leading-tight">
                    {project.name}
                  </h3>
                  {project.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {project.description}
                    </p>
                  )}
                </div>

                {/* Stats badges */}
                <div className="px-5 pb-4 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-background text-xs font-medium">
                    <Brain className="h-3 w-3 text-violet-500" />
                    {project.record_count} {project.record_count === 1 ? "Memory" : "Memories"}
                  </span>
                </div>

                {/* Bottom section */}
                <div className="mt-auto border-t px-5 py-3.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {new Date(project.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <button
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/projects/${project.id}`);
                    }}
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}

            {/* Add project card */}
            <button
              onClick={() => setDialogOpen(true)}
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed min-h-[240px] text-muted-foreground hover:text-foreground hover:border-indigo-300 dark:hover:border-indigo-500/30 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 transition-all"
            >
              <div className="h-11 w-11 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                <Plus className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold">New Project</span>
              <span className="text-xs text-muted-foreground mt-0.5">
                Organize your memories
              </span>
            </button>
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderKanban className="h-5 w-5 text-indigo-500" />
                Create Project
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Name</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Product Launch, Research"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Description
                </label>
                <Input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Optional description..."
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {PROJECT_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewColor(color)}
                      className={cn(
                        "h-7 w-7 rounded-full transition-all",
                        newColor === color
                          ? "ring-2 ring-offset-2 ring-primary scale-110"
                          : "hover:scale-105"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="bg-indigo-500 hover:bg-indigo-600 text-white"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
