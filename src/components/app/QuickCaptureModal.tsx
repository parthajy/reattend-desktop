import { useState, useEffect, useRef } from "react";
import { Sparkles, Loader2, X, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { captureText } from "@/lib/tauri-api";

export function QuickCaptureModal() {
  const { commandOpen, setCommandOpen, captureProjectId, captureProjectName, setCaptureProject } = useAppStore();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Global ⌘K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(!useAppStore.getState().commandOpen);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setCommandOpen]);

  // Auto-focus
  useEffect(() => {
    if (commandOpen) {
      setText("");
      setDone(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [commandOpen]);

  const handleClose = () => {
    setCommandOpen(false);
    setCaptureProject(null);
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const metadata = captureProjectId
        ? JSON.stringify({ project_id: captureProjectId })
        : undefined;
      const rawItemId = await captureText(text.trim(), "quick_capture", metadata);
      // If project context, try to assign after triage creates the record
      if (captureProjectId && rawItemId) {
        // Best-effort: pass project info in metadata for backend triage
        // The backend can use this to auto-assign
      }
      setDone(true);
      setTimeout(() => {
        setCommandOpen(false);
        setCaptureProject(null);
        setDone(false);
        setText("");
      }, 1200);
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  if (!commandOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh] bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg bg-background rounded-2xl border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="flex flex-col items-center py-8">
            <Sparkles className="h-8 w-8 text-indigo-500 mb-2" />
            <p className="text-sm font-medium">
              {captureProjectName
                ? `Captured! AI will triage and add to ${captureProjectName}.`
                : "Captured! AI will triage it."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-semibold">
                  {captureProjectName ? "New Memory" : "Quick Capture"}
                </span>
              </div>
              <button
                onClick={handleClose}
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Capture a thought, decision, note, or anything..."
                className="w-full min-h-[100px] bg-transparent text-sm resize-none focus:outline-none placeholder:text-muted-foreground/50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleSubmit();
                  }
                  if (e.key === "Escape") {
                    handleClose();
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
              <div className="flex items-center gap-3">
                {captureProjectName && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-xs text-indigo-600 dark:text-indigo-400">
                    <FolderKanban className="h-3 w-3" />
                    {captureProjectName}
                  </div>
                )}
                <span className="text-[10px] text-muted-foreground">
                  AI will extract title, tags, entities
                </span>
              </div>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!text.trim() || submitting}
                className="bg-indigo-500 hover:bg-indigo-600 text-white"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                )}
                Capture
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
