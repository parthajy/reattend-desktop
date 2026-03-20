import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboardStats, getRecords, getTodayBriefing, getConfigValue } from "@/lib/tauri-api";
import type { DashboardStats, Record as MemoryRecord, TodayBriefing } from "@/types";
import {
  Brain,
  Lightbulb,
  Users,
  Target,
  ArrowRight,
  Loader2,
  Scale,
  Flame,
  FileText,
  CircleCheckBig,
  PenLine,
  Network,
  Link2,
  Tag,
  Sparkles,
  Send,
  Sun,
  Moon,
  Sunset,
  Bell,
  Mic,
  ChevronDown,
  ChevronUp,
  Calendar,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const typeConfig: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bg: string;
    label: string;
  }
> = {
  decision: { icon: Scale, color: "text-violet-500", bg: "bg-violet-500/10", label: "Decisions" },
  insight: { icon: Lightbulb, color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Insights" },
  meeting: { icon: Users, color: "text-blue-500", bg: "bg-blue-500/10", label: "Meetings" },
  transcript: { icon: Mic, color: "text-pink-500", bg: "bg-pink-500/10", label: "Transcripts" },
  idea: { icon: Flame, color: "text-amber-500", bg: "bg-amber-500/10", label: "Ideas" },
  context: { icon: FileText, color: "text-slate-500", bg: "bg-slate-500/10", label: "Context" },
  tasklike: { icon: CircleCheckBig, color: "text-red-500", bg: "bg-red-500/10", label: "Tasks" },
  note: { icon: PenLine, color: "text-gray-500", bg: "bg-gray-500/10", label: "Notes" },
};

const PIE_COLORS = ["#8b5cf6", "#10b981", "#3b82f6", "#f59e0b", "#64748b", "#ef4444", "#6b7280", "#ec4899"];

function formatDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function BriefingSection({
  title,
  icon: Icon,
  iconColor,
  records,
  navigate,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  records: MemoryRecord[];
  navigate: (path: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (records.length === 0) return null;

  return (
    <div className="rounded-xl border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-accent/30 hover:bg-accent/50 transition-colors"
      >
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <span className="text-[13px] font-semibold flex-1 text-left">
          {title}
        </span>
        <span className="text-[11px] text-muted-foreground font-medium mr-1">
          {records.length}
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="divide-y divide-border/50">
          {records.map((record) => (
            <button
              key={record.id}
              onClick={() => navigate(`/memories/${record.id}`)}
              className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors text-left group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">
                  {record.title}
                </p>
                {record.summary && (
                  <p className="text-[12px] text-muted-foreground line-clamp-2 mt-0.5">
                    {record.summary}
                  </p>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                {formatRelativeTime(record.created_at)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [briefing, setBriefing] = useState<TodayBriefing | null>(null);
  const [recent, setRecent] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [askInput, setAskInput] = useState("");
  const [hasToken, setHasToken] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    Promise.all([getDashboardStats(), getRecords({ limit: 8 }), getTodayBriefing(), getConfigValue("auth_token")])
      .then(([s, r, b, token]) => {
        setStats(s);
        setRecent(r);
        setBriefing(b);
        setHasToken(!!token);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAsk = (_question: string) => {
    navigate("/");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const GreetingIcon = hour < 12 ? Sun : hour < 17 ? Sunset : Moon;

  const typeChartData = (stats?.type_counts || []).map((tc) => ({
    name: typeConfig[tc.record_type]?.label || tc.record_type,
    value: tc.count,
    type: tc.record_type,
  }));

  const activityData = stats?.daily_activity || [];
  const hasBriefingData = briefing && briefing.total_recent > 0;

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-5">
      {/* Connect banner — shown only when no token is set */}
      {!hasToken && !bannerDismissed && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <Brain className="w-4 h-4 text-violet-400 shrink-0" />
          <p className="text-sm text-violet-300 flex-1">
            Connect your account to sync memories to the web and unlock AI features.
          </p>
          <button
            onClick={() => navigate("/settings")}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-600 text-white transition-colors shrink-0"
          >
            Connect <ArrowRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-violet-400 hover:text-violet-200 transition-colors text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2">
            <GreetingIcon className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {hasBriefingData
              ? `${briefing.total_recent} memories captured in the last 24 hours.`
              : "Here's your memory workspace overview."}
          </p>
        </div>
        {stats && stats.records_today > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{stats.records_today}</span> new today
            {" / "}
            <span className="font-semibold text-foreground">{stats.records_this_week}</span> this week
          </div>
        )}
      </div>

      {/* Start Today Briefing */}
      {hasBriefingData && (
        <div className="rounded-2xl bg-gradient-to-br from-primary/[0.03] to-primary/[0.01] border border-primary/10 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold">Start Today</h2>
              <span className="text-[11px] text-muted-foreground">Last 24 hours</span>
            </div>
            {briefing.pending_notifications > 0 && (
              <button
                onClick={() => navigate("/inbox")}
                className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600 hover:text-amber-700 transition-colors"
              >
                <Bell className="w-3.5 h-3.5" />
                {briefing.pending_notifications} pending
              </button>
            )}
          </div>

          <BriefingSection
            title="Decisions"
            icon={Scale}
            iconColor="text-violet-500"
            records={briefing.decisions}
            navigate={navigate}
          />
          <BriefingSection
            title="Action Items"
            icon={CircleCheckBig}
            iconColor="text-red-500"
            records={briefing.tasks}
            navigate={navigate}
          />
          <BriefingSection
            title="Meeting Transcripts"
            icon={Mic}
            iconColor="text-pink-500"
            records={briefing.transcripts}
            navigate={navigate}
          />
          <BriefingSection
            title="Meetings"
            icon={Users}
            iconColor="text-blue-500"
            records={briefing.meetings}
            navigate={navigate}
          />
          <BriefingSection
            title="Insights"
            icon={Lightbulb}
            iconColor="text-emerald-500"
            records={briefing.insights}
            navigate={navigate}
            defaultOpen={false}
          />
          {briefing.other.length > 0 && (
            <BriefingSection
              title="Other"
              icon={FileText}
              iconColor="text-slate-500"
              records={briefing.other}
              navigate={navigate}
              defaultOpen={false}
            />
          )}
        </div>
      )}

      {/* Ask AI Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAsk(askInput);
        }}
      >
        <div className="relative flex items-center rounded-2xl bg-card border shadow-sm hover:shadow-md transition-shadow">
          <Sparkles className="absolute left-4 h-4 w-4 text-primary/60" />
          <input
            type="text"
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            placeholder="Ask your memory anything..."
            className="w-full py-3.5 pl-11 pr-12 bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none rounded-2xl"
          />
          <button
            type="submit"
            disabled={!askInput.trim()}
            className="absolute right-3 p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-30 hover:bg-primary/90 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex gap-2 mt-2 pl-1">
          {[
            "What decisions did I make this week?",
            "Summarize my meeting notes",
            "What are my open tasks?",
          ].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => handleAsk(q)}
              className="text-[11px] px-3 py-1 rounded-full border text-muted-foreground hover:text-primary hover:border-primary/25 transition-all"
            >
              {q}
            </button>
          ))}
        </div>
      </form>

      {/* Primary Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "Memories", value: stats.total_records, icon: Brain, gradient: "from-violet-500 to-purple-600", href: "/memories" },
            { label: "Decisions", value: stats.total_decisions, icon: Scale, gradient: "from-blue-500 to-cyan-500", href: "/memories" },
            { label: "Entities", value: stats.total_entities, icon: Network, gradient: "from-emerald-500 to-teal-500", href: "/search" },
            { label: "Connections", value: stats.total_links, icon: Link2, gradient: "from-amber-500 to-orange-500", href: "/board" },
            { label: "Today", value: stats.records_today, icon: Target, gradient: "from-rose-500 to-pink-500", href: "/memories" },
          ].map((s) => (
            <button
              key={s.label}
              onClick={() => navigate(s.href)}
              className={`group relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br ${s.gradient} text-left hover:scale-[1.02] transition-all shadow-sm hover:shadow-md`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white">
                  <s.icon className="h-4 w-4" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-white/50 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs mt-0.5 font-medium text-white/70">{s.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Type Breakdown Cards */}
      {stats && stats.type_counts.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {Object.entries(typeConfig).map(([type, config]) => {
            const count = stats.type_counts.find((tc) => tc.record_type === type)?.count || 0;
            const Icon = config.icon;
            return (
              <div
                key={type}
                className={`rounded-xl bg-card border shadow-sm p-3 text-center ${count === 0 ? "opacity-40" : ""}`}
              >
                <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${config.bg} ${config.color} mb-1.5`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="text-lg font-bold">{count}</div>
                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  {config.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity Chart */}
        <div className="lg:col-span-2 rounded-2xl bg-card border shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Activity — Last 14 Days</h3>
            <span className="text-xs text-muted-foreground">Memories created</span>
          </div>
          {activityData.length > 0 && activityData.some((d) => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={activityData} barCategoryGap="25%">
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDay}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                  labelFormatter={(v) =>
                    new Date(v + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Memories" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
              <Brain className="h-8 w-8 opacity-20 mb-2" />
              <p className="text-xs">No activity yet</p>
              <button
                onClick={() => navigate("/memories")}
                className="text-xs text-primary hover:underline mt-1"
              >
                Create your first memory
              </button>
            </div>
          )}
        </div>

        {/* Type Distribution Pie */}
        <div className="rounded-2xl bg-card border shadow-sm p-5">
          <h3 className="text-sm font-semibold mb-4">Memory Types</h3>
          {typeChartData.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={typeChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {typeChartData.map((entry, index) => (
                      <Cell key={entry.type} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
                {typeChartData.map((entry, i) => (
                  <div key={entry.type} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    {entry.name}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
              <div className="h-8 w-8 mb-2 rounded-full border-4 border-primary/20" />
              <p className="text-xs">No data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Memories + Tags */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Memories */}
        <div className="lg:col-span-2 rounded-2xl bg-card border shadow-sm">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <h3 className="text-sm font-semibold">Recent Memories</h3>
            <button
              onClick={() => navigate("/memories")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="px-2 pb-2">
            {recent.length > 0 ? (
              recent.map((record) => {
                const tc = typeConfig[record.type];
                return (
                  <button
                    key={record.id}
                    onClick={() => navigate(`/memories/${record.id}`)}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors text-left group"
                  >
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-md shrink-0 ${tc?.bg || "bg-muted"} ${tc?.color || ""}`}
                    >
                      {tc ? <tc.icon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {record.title}
                      </p>
                      {record.summary && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {record.summary}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] px-1.5 py-0 rounded ${tc?.bg || "bg-muted"} ${tc?.color || ""} font-medium`}
                      >
                        {tc?.label || record.type}
                      </span>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(record.created_at)}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-center py-10">
                <Brain className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm text-muted-foreground">No memories yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Reattend will automatically capture and organize your knowledge as you work.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Tags sidebar */}
        <div className="space-y-4">
          {/* Top Tags */}
          <div className="rounded-2xl bg-card border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Top Tags</h3>
            </div>
            {stats && stats.top_tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {stats.top_tags.map((t) => (
                  <span
                    key={t.tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/[0.06] text-primary hover:bg-primary/[0.1] transition-colors cursor-default"
                  >
                    {t.tag}
                    <span className="text-[10px] opacity-60">{t.count}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No tags yet. Tags are extracted automatically from memories.
              </p>
            )}
          </div>

          {/* Quick Navigation */}
          <div className="rounded-2xl bg-card border shadow-sm p-5">
            <h3 className="text-sm font-semibold mb-3">Quick Links</h3>
            <div className="space-y-1">
              {[
                { label: "Board", href: "/board", icon: PenLine },
                { label: "Projects", href: "/projects", icon: Network },
                { label: "Search", href: "/search", icon: Sparkles },
              ].map((link) => (
                <button
                  key={link.label}
                  onClick={() => navigate(link.href)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors text-left group"
                >
                  <link.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm group-hover:text-primary transition-colors">
                    {link.label}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/50 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
