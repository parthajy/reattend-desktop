import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-shell";
import {
  Mic,
  X,
  CheckCircle2,
  ListChecks,
  Lightbulb,
  Users,
  ChevronDown,
  ChevronUp,
  Mail,
  MessageSquare,
  Sparkles,
  Share2,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { createShareLink } from "@/lib/tauri-api";

interface MeetingEntity {
  kind: string;
  name: string;
}

interface MeetingData {
  record_id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  entities: MeetingEntity[];
  record_type: string;
  action_items: string[];
  decisions: string[];
  key_points: string[];
}

function Section({
  title,
  icon: Icon,
  iconColor,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: typeof Mic;
  iconColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50/80 hover:bg-gray-50 transition-colors"
      >
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <span className="text-[12px] font-semibold text-gray-700 flex-1 text-left">
          {title}
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        )}
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}

export function MeetingResult() {
  const params = new URLSearchParams(window.location.search);
  const dataJson = params.get("data") || "{}";

  const [data] = useState<MeetingData>(() => {
    try {
      return JSON.parse(decodeURIComponent(dataJson));
    } catch {
      return {} as MeetingData;
    }
  });

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleClose() {
    getCurrentWindow().close();
  }

  function handleEmail() {
    const people = data.entities?.filter((e) => e.kind === "person") || [];
    const participantNames = people.map((p) => p.name).join(", ");

    let body = `Meeting: ${data.title}\n\n`;
    if (data.summary) body += `Summary:\n${data.summary}\n\n`;
    if (data.action_items?.length > 0) {
      body += `Action Items:\n${data.action_items.map((a) => `  • ${a}`).join("\n")}\n\n`;
    }
    if (data.decisions?.length > 0) {
      body += `Decisions:\n${data.decisions.map((d) => `  • ${d}`).join("\n")}\n\n`;
    }
    if (data.key_points?.length > 0) {
      body += `Key Points:\n${data.key_points.map((k) => `  • ${k}`).join("\n")}\n\n`;
    }
    if (participantNames) body += `Participants: ${participantNames}\n\n`;
    body += `---\nCaptured by Reattend — reattend.com`;

    const subject = encodeURIComponent(`Meeting Notes: ${data.title}`);
    const encodedBody = encodeURIComponent(body);
    open(`mailto:?subject=${subject}&body=${encodedBody}`);
  }

  if (!data.title) {
    return (
      <div className="h-screen flex items-center justify-center bg-white text-gray-400 text-sm">
        No meeting data available.
      </div>
    );
  }

  const people = data.entities?.filter((e) => e.kind === "person") || [];
  const topics = data.entities?.filter(
    (e) => e.kind === "topic" || e.kind === "project" || e.kind === "org"
  ) || [];

  return (
    <div className="h-screen bg-white flex flex-col">
      {/* Header — Reattend branding + Meeting Recorded */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <img
              src="/logo.svg"
              alt="Reattend"
              className="h-5 w-5"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <span className="text-[11px] font-semibold text-gray-400 tracking-wide">
              REATTEND
            </span>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-gray-900">Meeting Recorded</h1>
            <p className="text-[12px] text-gray-400">Your meeting has been transcribed and saved</p>
          </div>
        </div>
      </div>

      {/* Content — scrollable sections */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {/* Title */}
        <h2 className="text-[14px] font-semibold text-gray-900 leading-snug">
          {data.title}
        </h2>

        {/* Participants */}
        {people.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            {people.map((p, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium"
              >
                {p.name}
              </span>
            ))}
          </div>
        )}

        {/* Summary */}
        {data.summary && (
          <Section title="Summary" icon={Sparkles} iconColor="text-indigo-500">
            <p className="text-[13px] text-gray-700 leading-relaxed">
              {data.summary}
            </p>
          </Section>
        )}

        {/* Action Items / To-Do */}
        {data.action_items?.length > 0 && (
          <Section title={`Action Items (${data.action_items.length})`} icon={ListChecks} iconColor="text-rose-500">
            <ul className="space-y-2">
              {data.action_items.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="mt-1 w-4 h-4 rounded border-2 border-gray-300 shrink-0" />
                  <span className="text-[12px] text-gray-700 leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Decisions */}
        {data.decisions?.length > 0 && (
          <Section title={`Decisions (${data.decisions.length})`} icon={Lightbulb} iconColor="text-amber-500">
            <ul className="space-y-2">
              {data.decisions.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                  <span className="text-[12px] text-gray-700 leading-relaxed">{d}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Key Points */}
        {data.key_points?.length > 0 && (
          <Section title={`Key Points (${data.key_points.length})`} icon={MessageSquare} iconColor="text-violet-500">
            <ul className="space-y-2">
              {data.key_points.map((k, i) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                  <span className="text-[12px] text-gray-700 leading-relaxed">{k}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Transcript */}
        {data.content && (
          <Section title="Full Transcript" icon={Mic} iconColor="text-pink-500" defaultOpen={false}>
            <p className="text-[12px] text-gray-600 leading-relaxed whitespace-pre-wrap">
              {data.content}
            </p>
          </Section>
        )}

        {/* Topics & Tags */}
        {(topics.length > 0 || (data.tags?.length > 0)) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {topics.map((t, i) => (
              <span
                key={`t-${i}`}
                className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 text-[10px] font-medium"
              >
                {t.name}
              </span>
            ))}
            {data.tags?.map((tag, i) => (
              <span
                key={`tag-${i}`}
                className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer — Share actions + Done */}
      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleEmail}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-[11px] font-medium hover:bg-gray-50 transition-colors"
          >
            <Mail className="w-3 h-3" />
            Email
          </button>
          <button
            onClick={() => {
              let text = `Meeting: ${data.title}\n`;
              if (data.summary) text += `\n${data.summary}\n`;
              if (data.action_items?.length) {
                text += `\nAction Items:\n${data.action_items.map((a) => `- ${a}`).join("\n")}\n`;
              }
              if (data.decisions?.length) {
                text += `\nDecisions:\n${data.decisions.map((d) => `- ${d}`).join("\n")}\n`;
              }
              text += `\n— Shared from Reattend`;
              navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-[11px] font-medium hover:bg-gray-50 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            disabled={sharing}
            onClick={async () => {
              if (shareUrl) {
                navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
                return;
              }
              setSharing(true);
              try {
                const ents = (data.entities || []).map((e) => ({ kind: e.kind, name: e.name }));
                const result = await createShareLink({
                  title: data.title,
                  summary: data.summary || undefined,
                  content: data.content || undefined,
                  record_type: data.record_type || "transcript",
                  tags: data.tags,
                  meta: {
                    action_items: data.action_items,
                    decisions: data.decisions,
                    key_points: data.key_points,
                  },
                  entities: ents,
                });
                setShareUrl(result.shareUrl);
                navigator.clipboard.writeText(result.shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {}
              setSharing(false);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500 text-white text-[11px] font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50"
          >
            {sharing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
            {shareUrl ? "Link Copied!" : "Share Link"}
          </button>
        </div>
        <button
          onClick={handleClose}
          className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-800 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
