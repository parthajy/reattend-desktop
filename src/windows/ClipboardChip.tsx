// Tiny "Captured" toast that floats above everything for ~2.4s after a
// clipboard capture lands. Replaces the Tauri-2 system notification, which
// is unreliable in `tauri dev` because the dev binary doesn't have a real
// app bundle identity (CFBundleIdentifier mismatch → macOS suppresses or
// misroutes the banner).
//
// The window opens once per capture with the preview encoded in the URL,
// fades in, slides out after the timeout, and self-closes. No data
// fetching, no stores — keep the whole bundle for this window tiny.

import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check } from "lucide-react";

const VISIBLE_MS = 2400;
const FADE_MS = 220;

export function ClipboardChip() {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");
  const closeTimer = useRef<number | null>(null);
  const fadeTimer = useRef<number | null>(null);

  useEffect(() => {
    // Suppress the host-page scrollbar that the global stylesheet renders
    // by default — at 64px tall the chip can't actually scroll, but the
    // gutter still shows up as a 16px ridge on the right edge.
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    const inT = window.setTimeout(() => setPhase("hold"), 30);
    fadeTimer.current = window.setTimeout(() => setPhase("out"), VISIBLE_MS);
    closeTimer.current = window.setTimeout(() => {
      getCurrentWindow().close();
    }, VISIBLE_MS + FADE_MS);
    return () => {
      window.clearTimeout(inT);
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  const opacity = phase === "in" ? 0 : phase === "hold" ? 1 : 0;
  const translateY = phase === "in" ? -4 : phase === "hold" ? 0 : -2;

  return (
    <div
      className="h-screen w-screen flex items-stretch select-none cursor-default overflow-hidden bg-white dark:bg-zinc-900"
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
      }}
    >
      <div className="flex-1 flex items-center gap-3 px-4 rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-800">
        <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.75} />
        </div>
        <div className="text-[13px] font-medium text-zinc-800 dark:text-zinc-100 truncate">
          Captured to memory successfully
        </div>
      </div>
    </div>
  );
}
