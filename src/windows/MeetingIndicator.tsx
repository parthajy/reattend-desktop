import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Mic, Square } from "lucide-react";

/**
 * Meeting Indicator — small floating pill shown during recording.
 * Always-on-top, bottom-right. Shows red dot + timer + stop button.
 */
export function MeetingIndicator() {
  const [elapsed, setElapsed] = useState(0);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    // Poll meeting status for elapsed time
    const interval = setInterval(async () => {
      try {
        const status = await invoke<{
          is_recording: boolean;
          recording_id: string | null;
          elapsed_secs: number | null;
        }>("get_meeting_status");

        if (status.is_recording && status.elapsed_secs != null) {
          setElapsed(status.elapsed_secs);
        } else if (!status.is_recording) {
          // Recording stopped externally (tray menu or shortcut)
          getCurrentWindow().close();
        }
      } catch {
        // ignore
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleStop = async () => {
    setStopping(true);
    try {
      await invoke("stop_meeting");
    } catch (e) {
      console.error("Failed to stop meeting:", e);
    }
    setTimeout(() => getCurrentWindow().close(), 300);
  };

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="h-screen flex items-center justify-center select-none bg-transparent" data-tauri-drag-region>
      <div className="flex items-center gap-2.5 px-4 py-2 bg-gray-900/95 backdrop-blur-xl rounded-full shadow-2xl border border-gray-700 cursor-grab active:cursor-grabbing" data-tauri-drag-region>
        {/* Pulsing red dot */}
        <div className="relative flex items-center justify-center">
          <span className="absolute w-3 h-3 rounded-full bg-red-500 animate-ping opacity-40" />
          <span className="relative w-2.5 h-2.5 rounded-full bg-red-500" />
        </div>

        <Mic className="w-3.5 h-3.5 text-red-400" />

        <span className="text-white text-xs font-mono font-medium tracking-wide min-w-[40px]">
          {timeStr}
        </span>

        <button
          onClick={handleStop}
          disabled={stopping}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-[10px] font-medium transition-colors disabled:opacity-50"
        >
          <Square className="w-2.5 h-2.5" />
          Stop
        </button>
      </div>
    </div>
  );
}
