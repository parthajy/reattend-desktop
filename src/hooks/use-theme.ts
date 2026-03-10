import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { getConfig, saveConfig } from "@/lib/tauri-api";
import type { AppConfig } from "@/types";

export function useTheme() {
  const { theme, setTheme } = useAppStore();

  // Load theme from config on mount
  useEffect(() => {
    getConfig()
      .then((config) => {
        if (config.theme === "dark" || config.theme === "light") {
          setTheme(config.theme);
        }
      })
      .catch(() => {});
  }, [setTheme]);

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = async () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    try {
      const config = await getConfig();
      await saveConfig({ ...config, theme: newTheme });
    } catch {
      // Theme still applied locally even if save fails
    }
  };

  return { theme, setTheme, toggleTheme };
}
