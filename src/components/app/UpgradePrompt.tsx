import { useAppStore } from "@/stores/app-store";
import { open } from "@tauri-apps/plugin-shell";
import { X } from "lucide-react";

export function UpgradePrompt() {
  const { showUpgradePrompt, setShowUpgradePrompt } = useAppStore();

  if (!showUpgradePrompt) return null;

  const handleAction = () => {
    open("https://www.reattend.com/app/billing");
    setShowUpgradePrompt(false);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[420px] animate-in slide-in-from-bottom-4 duration-300">
      <div className="relative rounded-xl border border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/50 dark:to-violet-950/50 p-4 shadow-lg">
        <button
          onClick={() => setShowUpgradePrompt(false)}
          className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-white/50 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="pr-6">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Your free trial has ended
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Upgrade to Pro for unlimited AI capture, meeting transcription, semantic search, and more. Or keep using Reattend free as a notetaker.
          </p>
          <button
            onClick={handleAction}
            className="mt-3 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-medium shadow-sm transition-colors"
          >
            Upgrade to Pro — $20/mo
          </button>
        </div>
      </div>
    </div>
  );
}
