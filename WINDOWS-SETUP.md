# Reattend Desktop — Windows Build & Debug Guide

## What This Is

Reattend is a Tauri v2 desktop app (Rust backend + React frontend). It runs as a tray app that:
- Captures screen text via OCR (ambient capture)
- Records meetings via microphone
- Sends content through an AI triage pipeline (server proxy)
- Stores everything locally in SQLite (`~/.reattend/reattend.db`)

The server at `reattend.com` is a thin proxy for API keys (Groq for transcription, LLM for triage/embedding). All user data stays local.

---

## Prerequisites

1. **Node.js 18+** — https://nodejs.org
2. **Rust (stable)** — https://rustup.rs
3. **Visual Studio Build Tools** — https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - Install "Desktop development with C++" workload
   - This gives you MSVC compiler + Windows SDK (required by Tauri)
4. **Git** — https://git-scm.com

---

## Setup

```bash
# Clone or copy the project
cd reattend-desktop

# Install JS dependencies
npm install

# Verify Rust toolchain
rustup default stable
rustc --version   # should be 1.75+
```

---

## Development

```bash
# Run in dev mode (hot reload for frontend, rebuilds Rust on change)
npm run tauri dev
```

This opens the app window + tray icon. Check the terminal for Rust logs.

---

## Production Build

```bash
npx tauri build
```

Output: `src-tauri/target/release/bundle/nsis/Reattend_x64-setup.exe`

---

## Architecture Overview

```
src/                    # React frontend (Vite)
  app/pages/            # Main pages: Memories, Transcripts, Settings, etc.
  windows/              # Special windows: MeetingIndicator, MeetingResult, Popup
  lib/tauri-api.ts      # Frontend → Rust command bindings

src-tauri/              # Rust backend
  src/lib.rs            # App setup, tray menu, global shortcuts, capture loops
  src/commands.rs       # Tauri commands (invoked from frontend)
  src/db.rs             # SQLite queries (all tables)
  src/worker.rs         # Background job processor (triage, embed, link, transcribe)
  src/ai.rs             # AI client (calls server proxy for LLM/embedding)
  src/audio.rs          # Mic recording (cpal + hound → WAV)
  src/ocr.rs            # Screen capture + OCR (platform-specific)
  Cargo.toml            # Rust dependencies
  tauri.conf.json       # App config, version, windows, permissions
```

---

## Data Flow

```
Screen/Mic → raw_item (SQLite) → Worker picks up job:
  1. "triage" → POST /api/tray/proxy/triage (AI decides what to keep)
  2. "embed"  → POST /api/tray/proxy/embed (vector embedding)
  3. "link"   → find similar records, create connections
  4. "transcribe" → POST /api/tray/proxy/transcribe (Groq Whisper, meetings only)
```

---

## Key Config

- **Server**: `https://reattend.com` (API base URL, set in lib.rs)
- **Local DB**: `~/.reattend/reattend.db` (SQLite)
- **Auth**: Device ID + API token, stored in DB after login via browser
- **Updater**: Checks `reattend.com/api/updater/{target}/{arch}/{version}`

---

## Windows-Specific Notes

### OCR
- Uses `windows-rs` crate for Windows.Media.Ocr
- Screen capture via `windows-capture` or DXGI desktop duplication
- Check `src-tauri/src/ocr.rs` for platform-gated code (`#[cfg(target_os = "windows")]`)

### Audio (Meetings)
- `cpal` crate handles mic input on Windows (WASAPI backend)
- No virtual audio device needed — captures mic only
- System audio capture would need WASAPI loopback (not implemented yet)

### Permissions
- No special permission prompts on Windows (unlike macOS screen recording / mic)
- App just works after install — no accessibility or screen recording gates

### Known Issues to Debug
- OCR quality/performance on Windows — may need different capture method
- Embedding pipeline — verify triage → embed → link completes end-to-end
- Check Rust logs in terminal for `[OCR]`, `[Worker]`, `[Capture]` prefixes

---

## Debugging Tips

```bash
# Run with verbose Rust logging
RUST_LOG=debug npm run tauri dev

# Check the local database
sqlite3 ~/.reattend/reattend.db
  .tables
  SELECT * FROM raw_items ORDER BY created_at DESC LIMIT 5;
  SELECT * FROM job_queue WHERE status != 'completed' LIMIT 10;
  SELECT * FROM records ORDER BY created_at DESC LIMIT 5;
```

### What to verify on Windows:
1. **App launches** — tray icon appears, login works
2. **OCR captures** — look for `[OCR]` logs, check `raw_items` table
3. **Triage works** — `[Worker] Completed job (triage)` in logs, check `records` table
4. **Embedding works** — `[Worker] Completed job (embed)` in logs, check `embeddings` table
5. **Meeting recording** — Cmd+Shift+M or tray menu → mic records → transcription completes
6. **Auto-updater** — sidebar shows version, update banner appears when new version exists

---

## Current Version: 0.1.12

## Contact
Questions? pb@reattend.ai
