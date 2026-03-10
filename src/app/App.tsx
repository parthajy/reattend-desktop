import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppRoutes } from "./routes";
import { useTheme } from "@/hooks/use-theme";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/app-store";

export function App() {
  // Initialize theme on mount
  useTheme();

  useEffect(() => {
    // Check for cached update info from Rust-side startup check
    invoke<{ available: boolean; version?: string; notes?: string }>("get_update_info")
      .then((info) => {
        if (info.available && info.version) {
          useAppStore.getState().setUpdateAvailable({
            version: info.version,
            notes: info.notes || "",
          });
        }
      })
      .catch(() => {});

    // Also listen for live update_available events (if Rust check finishes after window opens)
    const unlisten = listen<{ version: string; notes: string }>("update_available", (event) => {
      useAppStore.getState().setUpdateAvailable({
        version: event.payload.version,
        notes: event.payload.notes || "",
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <TooltipProvider>
      <MemoryRouter>
        <AppRoutes />
      </MemoryRouter>
    </TooltipProvider>
  );
}
