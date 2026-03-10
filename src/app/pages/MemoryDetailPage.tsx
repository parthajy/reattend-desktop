import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getRecord,
  getRecordEntities,
  getRecordLinks,
  updateRecord,
  deleteRecord,
  getProjects,
  getRecordProject,
  addRecordToProject,
  removeRecordFromProject,
  createShareLink,
  sendShareEmail,
} from "@/lib/tauri-api";
import type {
  Record as MemoryRecord,
  Entity,
  RecordLink,
  Project,
} from "@/types";
import { parseTags } from "@/types";
import {
  ArrowLeft,
  Loader2,
  Tag,
  User,
  Network,
  ChevronRight,
  Save,
  PenLine,
  Trash2,
  Calendar,
  Gauge,
  FolderKanban,
  Lightbulb,
  MessageSquare,
  Zap,
  FileText,
  Target,
  StickyNote,
  ChevronsUpDown,
  ListTodo,
  Clock,
  Sparkles,
  Link2,
  X,
  Mic,
  Users,
  ListChecks,
  CheckCircle2,
  Share2,
  Mail,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const typeConfig: {
  [key: string]: {
    icon: typeof FileText;
    color: string;
    textColor: string;
    bg: string;
    gradient: string;
    gradientSubtle: string;
    borderColor: string;
    label: string;
  };
} = {
  decision: {
    icon: Target,
    color: "text-blue-500",
    textColor: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
    gradient: "from-blue-500 to-indigo-600",
    gradientSubtle: "from-blue-500/20 via-indigo-500/10 to-transparent",
    borderColor: "border-blue-500/30",
    label: "Decision",
  },
  meeting: {
    icon: MessageSquare,
    color: "text-emerald-500",
    textColor: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    gradient: "from-emerald-500 to-teal-600",
    gradientSubtle: "from-emerald-500/20 via-teal-500/10 to-transparent",
    borderColor: "border-emerald-500/30",
    label: "Meeting",
  },
  idea: {
    icon: Zap,
    color: "text-violet-500",
    textColor: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/10",
    gradient: "from-violet-500 to-purple-600",
    gradientSubtle: "from-violet-500/20 via-purple-500/10 to-transparent",
    borderColor: "border-violet-500/30",
    label: "Idea",
  },
  insight: {
    icon: Lightbulb,
    color: "text-amber-500",
    textColor: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    gradient: "from-amber-500 to-orange-600",
    gradientSubtle: "from-amber-500/20 via-orange-500/10 to-transparent",
    borderColor: "border-amber-500/30",
    label: "Insight",
  },
  context: {
    icon: FileText,
    color: "text-cyan-500",
    textColor: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-500/10",
    gradient: "from-cyan-500 to-blue-600",
    gradientSubtle: "from-cyan-500/20 via-blue-500/10 to-transparent",
    borderColor: "border-cyan-500/30",
    label: "Context",
  },
  tasklike: {
    icon: ListTodo,
    color: "text-rose-500",
    textColor: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10",
    gradient: "from-rose-500 to-pink-600",
    gradientSubtle: "from-rose-500/20 via-pink-500/10 to-transparent",
    borderColor: "border-rose-500/30",
    label: "Task",
  },
  transcript: {
    icon: Mic,
    color: "text-pink-500",
    textColor: "text-pink-600 dark:text-pink-400",
    bg: "bg-pink-500/10",
    gradient: "from-pink-500 to-rose-600",
    gradientSubtle: "from-pink-500/20 via-rose-500/10 to-transparent",
    borderColor: "border-pink-500/30",
    label: "Transcript",
  },
  note: {
    icon: StickyNote,
    color: "text-slate-400",
    textColor: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-500/10",
    gradient: "from-slate-500 to-slate-600",
    gradientSubtle: "from-slate-500/20 via-slate-500/10 to-transparent",
    borderColor: "border-slate-500/30",
    label: "Note",
  },
};

function parseMeta(meta: string | null): {
  action_items?: string[];
  decisions?: string[];
  key_points?: string[];
} {
  if (!meta) return {};
  try {
    return JSON.parse(meta);
  } catch {
    return {};
  }
}

export default function MemoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<MemoryRecord | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [links, setLinks] = useState<[RecordLink, MemoryRecord][]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  // Editing
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [saving, setSaving] = useState(false);

  // Share state (must be before any early returns — React hooks rules)
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getRecord(id)
      .then((r) => {
        setRecord(r);
        setEditTitle(r.title);
        setEditSummary(r.summary || "");
        getRecordEntities(id).then(setEntities).catch(() => {});
        getRecordLinks(id).then(setLinks).catch(() => {});
        getProjects().then(setProjects).catch(() => {});
        getRecordProject(id).then(setCurrentProject).catch(() => {});
      })
      .catch(() => navigate("/memories"))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleSave = async () => {
    if (!record) return;
    setSaving(true);
    try {
      await updateRecord({
        id: record.id,
        title: editTitle,
        summary: editSummary || undefined,
      });
      setRecord({
        ...record,
        title: editTitle,
        summary: editSummary || null,
      });
      setIsEditing(false);
    } catch {}
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!record || !confirm("Delete this memory?")) return;
    try {
      await deleteRecord(record.id);
      navigate("/memories");
    } catch {}
  };

  const handleMoveToProject = async (projectId: string | null) => {
    if (!record) return;
    try {
      if (currentProject) {
        await removeRecordFromProject(currentProject.id, record.id);
      }
      if (projectId) {
        await addRecordToProject(projectId, record.id);
        const matched = projects.find((p) => p.id === projectId) ?? null;
        setCurrentProject(matched);
      } else {
        setCurrentProject(null);
      }
    } catch {}
  };

  if (loading || !record) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tags = parseTags(record.tags);
  const tc = typeConfig[record.type] || typeConfig.note;
  const TypeIcon = tc.icon;
  const isMeeting = record.type === "meeting" || record.type === "transcript";
  const meta = parseMeta(record.meta);
  const people = entities.filter((e) => e.kind === "person");

  return (
    <div className="flex-1 overflow-auto relative">
      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className={cn(
            "absolute -top-40 -right-20 w-[600px] h-[600px] rounded-full blur-3xl opacity-30",
            `bg-gradient-to-br ${tc.gradientSubtle}`
          )}
        />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-pink-300/5 to-violet-300/5 blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto p-6 relative z-10">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground -ml-2 hover:text-foreground"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-muted"
              onClick={() => {
                if (isEditing) {
                  setIsEditing(false);
                  setEditTitle(record.title);
                  setEditSummary(record.summary || "");
                } else {
                  setIsEditing(true);
                }
              }}
            >
              {isEditing ? (
                <X className="h-4 w-4" />
              ) : (
                <PenLine className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Hero Card ── */}
        <div
          className={cn(
            "relative rounded-2xl border overflow-hidden mb-6",
            tc.borderColor
          )}
        >
          {/* Gradient strip */}
          <div
            className={cn(
              "h-1 bg-gradient-to-r",
              tc.gradient
            )}
          />

          {/* Glass inner */}
          <div className="relative bg-card/80 backdrop-blur-xl">
            {/* Subtle glow behind icon */}
            <div
              className={cn(
                "absolute top-6 left-6 w-20 h-20 rounded-full blur-2xl opacity-20",
                `bg-gradient-to-br ${tc.gradient}`
              )}
            />

            <div className="relative p-6 sm:p-8">
              <div className="flex items-start gap-5">
                {/* Type icon */}
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-2xl shrink-0 bg-gradient-to-br text-white shadow-lg",
                    tc.gradient
                  )}
                >
                  <TypeIcon className="h-6 w-6" />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Badge row */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
                        tc.bg,
                        tc.textColor
                      )}
                    >
                      <TypeIcon className="h-3 w-3" />
                      {tc.label}
                    </span>
                    {record.confidence != null && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted/60 text-muted-foreground">
                        <Sparkles className="h-3 w-3" />
                        {Math.round(record.confidence * 100)}% confidence
                      </span>
                    )}
                  </div>

                  {/* Title + Summary */}
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="text-2xl font-bold h-auto py-2 bg-background/50"
                      />
                      <textarea
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        placeholder="Summary..."
                        rows={3}
                        className="w-full px-3 py-2.5 rounded-xl border bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none leading-relaxed"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleSave}
                          disabled={saving}
                          className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white"
                        >
                          {saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          ) : (
                            <Save className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Save changes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-lg"
                          onClick={() => {
                            setIsEditing(false);
                            setEditTitle(record.title);
                            setEditSummary(record.summary || "");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-2xl font-bold tracking-tight leading-tight">
                        {record.title}
                      </h1>
                      {record.summary && (
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-2xl">
                          {record.summary}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Content Card */}
            {record.content && (
              <div className="rounded-2xl border bg-card/80 backdrop-blur-sm overflow-hidden">
                <div className="px-6 pt-5 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Content
                  </h3>
                </div>
                <div className="px-6 pb-6">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {record.content.split("\n").map((line, i) => (
                      <p
                        key={i}
                        className="text-[13px] leading-relaxed text-foreground/80 my-1"
                      >
                        {line || <br />}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Meeting-specific sections */}
            {isMeeting && people.length > 0 && (
              <div className="rounded-2xl border bg-card/80 backdrop-blur-sm overflow-hidden">
                <div className="px-6 pt-5 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Participants
                  </h3>
                </div>
                <div className="px-6 pb-5 flex flex-wrap gap-2">
                  {people.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium border border-blue-500/20"
                    >
                      <User className="h-3 w-3" />
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {isMeeting && (meta.action_items?.length ?? 0) > 0 && (
              <div className="rounded-2xl border bg-card/80 backdrop-blur-sm overflow-hidden">
                <div className="px-6 pt-5 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <ListChecks className="h-3.5 w-3.5" />
                    Action Items
                    <span className="ml-auto text-[10px] font-medium tabular-nums bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full">
                      {meta.action_items!.length}
                    </span>
                  </h3>
                </div>
                <div className="px-6 pb-5 space-y-2.5">
                  {meta.action_items!.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-1 w-4 h-4 rounded border-2 border-rose-300 dark:border-rose-600 shrink-0" />
                      <span className="text-sm text-foreground/80 leading-relaxed">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isMeeting && (meta.decisions?.length ?? 0) > 0 && (
              <div className="rounded-2xl border bg-card/80 backdrop-blur-sm overflow-hidden">
                <div className="px-6 pt-5 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Lightbulb className="h-3.5 w-3.5" />
                    Decisions
                    <span className="ml-auto text-[10px] font-medium tabular-nums bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
                      {meta.decisions!.length}
                    </span>
                  </h3>
                </div>
                <div className="px-6 pb-5 space-y-2.5">
                  {meta.decisions!.map((d, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                      <span className="text-sm text-foreground/80 leading-relaxed">{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isMeeting && (meta.key_points?.length ?? 0) > 0 && (
              <div className="rounded-2xl border bg-card/80 backdrop-blur-sm overflow-hidden">
                <div className="px-6 pt-5 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Key Points
                    <span className="ml-auto text-[10px] font-medium tabular-nums bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full">
                      {meta.key_points!.length}
                    </span>
                  </h3>
                </div>
                <div className="px-6 pb-5 space-y-2.5">
                  {meta.key_points!.map((k, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-2 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                      <span className="text-sm text-foreground/80 leading-relaxed">{k}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Share section for meetings */}
            {isMeeting && (
              <div className="rounded-2xl border bg-card/80 backdrop-blur-sm overflow-hidden">
                <div className="px-6 pt-5 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </h3>
                </div>
                <div className="px-6 pb-5 space-y-4">
                  {/* In-app email send */}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="email"
                          placeholder="Email address..."
                          value={emailTo}
                          onChange={(e) => { setEmailTo(e.target.value); setEmailError(null); setEmailSent(false); }}
                          onKeyDown={(e) => { if (e.key === "Enter" && emailTo) document.getElementById("send-email-btn")?.click(); }}
                          className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background/80 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/30 transition-all"
                        />
                      </div>
                      <button
                        id="send-email-btn"
                        disabled={emailSending || !emailTo}
                        onClick={async () => {
                          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)) {
                            setEmailError("Invalid email address");
                            return;
                          }
                          setEmailSending(true);
                          setEmailError(null);
                          try {
                            // Create share link first if we don't have one
                            let url = shareUrl;
                            if (!url) {
                              const entitiesForShare = entities.map((ent) => ({ kind: ent.kind, name: ent.name }));
                              const result = await createShareLink({
                                title: record.title,
                                summary: record.summary || undefined,
                                content: record.content || undefined,
                                record_type: record.type,
                                tags: parseTags(record.tags),
                                meta,
                                entities: entitiesForShare,
                              });
                              url = result.shareUrl;
                              setShareUrl(url);
                            }
                            await sendShareEmail({
                              to: emailTo,
                              title: record.title,
                              summary: record.summary || undefined,
                              shareUrl: url,
                            });
                            setEmailSent(true);
                            setEmailTo("");
                            setTimeout(() => setEmailSent(false), 3000);
                          } catch (err: any) {
                            setEmailError(err.message || "Failed to send");
                          }
                          setEmailSending(false);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-semibold hover:shadow-lg hover:shadow-indigo-500/20 transition-all disabled:opacity-50"
                      >
                        {emailSending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : emailSent ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Mail className="h-3.5 w-3.5" />
                        )}
                        {emailSent ? "Sent!" : "Send"}
                      </button>
                    </div>
                    {emailError && (
                      <p className="text-[11px] text-destructive">{emailError}</p>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        let text = `Meeting: ${record.title}\n`;
                        if (record.summary) text += `\n${record.summary}\n`;
                        if (meta.action_items?.length) {
                          text += `\nAction Items:\n${meta.action_items.map((a) => `- ${a}`).join("\n")}\n`;
                        }
                        if (meta.decisions?.length) {
                          text += `\nDecisions:\n${meta.decisions.map((d) => `- ${d}`).join("\n")}\n`;
                        }
                        if (meta.key_points?.length) {
                          text += `\nKey Points:\n${meta.key_points.map((k) => `- ${k}`).join("\n")}\n`;
                        }
                        text += `\n— Shared from Reattend`;
                        navigator.clipboard.writeText(text);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-muted transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy Notes
                        </>
                      )}
                    </button>
                    <button
                      disabled={sharing}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (shareUrl) {
                          navigator.clipboard.writeText(shareUrl);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                          return;
                        }
                        setSharing(true);
                        try {
                          const entitiesForShare = entities.map((ent) => ({ kind: ent.kind, name: ent.name }));
                          const result = await createShareLink({
                            title: record.title,
                            summary: record.summary || undefined,
                            content: record.content || undefined,
                            record_type: record.type,
                            tags: parseTags(record.tags),
                            meta,
                            entities: entitiesForShare,
                          });
                          setShareUrl(result.shareUrl);
                          navigator.clipboard.writeText(result.shareUrl);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        } catch {}
                        setSharing(false);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-muted transition-colors"
                    >
                      {sharing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Share2 className="h-3.5 w-3.5" />
                      )}
                      {shareUrl ? "Link Copied!" : "Copy Link"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Linked Memories */}
            {links.length > 0 && (
              <div className="rounded-2xl border bg-card/80 backdrop-blur-sm overflow-hidden">
                <div className="px-6 pt-5 pb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5" />
                    Linked Memories
                  </h3>
                  <span className="text-xs text-muted-foreground font-medium tabular-nums">
                    {links.length}
                  </span>
                </div>
                <div className="px-3 pb-3 space-y-0.5">
                  {links.map(([link, linkedRecord]) => {
                    const linkTc =
                      typeConfig[linkedRecord.type] || typeConfig.note;
                    const LinkIcon = linkTc.icon;
                    return (
                      <button
                        key={link.id}
                        onClick={() =>
                          navigate(`/memories/${linkedRecord.id}`)
                        }
                        className="flex items-center gap-3.5 rounded-xl px-3.5 py-3 hover:bg-muted/50 transition-all group w-full text-left"
                      >
                        <div
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-xl shrink-0",
                            linkTc.bg
                          )}
                        >
                          <LinkIcon
                            className={cn("h-4 w-4", linkTc.color)}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                            {linkedRecord.title}
                          </p>
                          {link.explanation && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {link.explanation}
                            </p>
                          )}
                        </div>
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-medium shrink-0",
                          link.kind === "depends_on" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                          link.kind === "followup" || link.kind === "follow_up" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                          link.kind === "contradicts" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                          link.kind === "supports" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                          link.kind === "related_to" ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" :
                          "bg-muted/60 text-muted-foreground"
                        )}>
                          {link.kind.replace(/_/g, " ")}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Details Glass Card */}
            <div className="rounded-2xl border bg-card/80 backdrop-blur-sm overflow-hidden">
              <div
                className={cn(
                  "px-5 py-4 bg-gradient-to-r border-b",
                  tc.gradientSubtle,
                  tc.borderColor
                )}
              >
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Details
                </h3>
              </div>
              <div className="p-5 space-y-4">
                {/* Confidence */}
                {record.confidence != null && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Gauge className="h-3.5 w-3.5" />
                        Confidence
                      </span>
                      <span className="text-xs font-bold tabular-nums">
                        {Math.round(record.confidence * 100)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full bg-gradient-to-r transition-all",
                          tc.gradient
                        )}
                        style={{
                          width: `${Math.round(record.confidence * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Divider */}
                {record.confidence != null && (
                  <div className="border-t" />
                )}

                {/* Created */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Created
                  </span>
                  <span className="text-xs font-medium">
                    {new Date(record.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>

                {/* Updated */}
                {record.updated_at !== record.created_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Updated
                    </span>
                    <span className="text-xs font-medium">
                      {new Date(record.updated_at).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }
                      )}
                    </span>
                  </div>
                )}

                {/* Created by */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Created by
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold",
                      record.created_by === "agent"
                        ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {record.created_by === "agent" ? (
                      <>
                        <Sparkles className="h-2.5 w-2.5" />
                        AI Agent
                      </>
                    ) : (
                      "You"
                    )}
                  </span>
                </div>

                <div className="border-t" />

                {/* Project */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <FolderKanban className="h-3.5 w-3.5" />
                    Project
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition-opacity">
                        {currentProject ? (
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: currentProject.color,
                              }}
                            />
                            {currentProject.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                        <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => handleMoveToProject(null)}
                        className="text-xs cursor-pointer"
                      >
                        <span className="text-muted-foreground">
                          No project
                        </span>
                      </DropdownMenuItem>
                      {projects.map((p) => (
                        <DropdownMenuItem
                          key={p.id}
                          onClick={() => handleMoveToProject(p.id)}
                          className={cn(
                            "text-xs cursor-pointer gap-2",
                            currentProject?.id === p.id && "font-semibold"
                          )}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: p.color }}
                          />
                          {p.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            {/* Tags Glass Card */}
            {tags.length > 0 && (
              <div className="rounded-2xl border bg-card/80 backdrop-blur-sm overflow-hidden">
                <div className="px-5 pt-5 pb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5" />
                    Tags
                  </h3>
                </div>
                <div className="px-5 pb-5 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                        tc.bg,
                        tc.textColor,
                        tc.borderColor
                      )}
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Entities Glass Card */}
            {entities.length > 0 && (
              <div className="rounded-2xl border bg-card/80 backdrop-blur-sm overflow-hidden">
                <div className="px-5 pt-5 pb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Network className="h-3.5 w-3.5" />
                    Entities
                  </h3>
                </div>
                <div className="px-3 pb-3 space-y-1">
                  {entities.map((entity) => (
                    <div
                      key={entity.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors"
                    >
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/60 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                        {entity.kind}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {entity.name}
                      </span>
                      {entity.mention_count > 1 && (
                        <span className="text-[10px] text-muted-foreground ml-auto shrink-0 tabular-nums">
                          {entity.mention_count}x
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
