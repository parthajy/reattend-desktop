# Reattend Desktop

Ambient memory layer for macOS. Runs as a tray app — captures screen text (OCR), clipboard, meetings (mic recording + transcription), and builds a local knowledge graph with AI-powered enrichment.

## Architecture

```
reattend-desktop/
├── src-tauri/              # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── lib.rs          # App setup, tray menu, shortcuts, capture loops
│   │   ├── commands.rs     # All Tauri IPC commands
│   │   ├── db.rs           # SQLite queries (rusqlite)
│   │   ├── worker.rs       # Background job processor (triage/embed/link/transcribe)
│   │   ├── ai.rs           # AI client, triage prompts, embeddings (fastembed)
│   │   └── audio.rs        # Meeting mic recording (cpal + hound → WAV)
│   ├── swift-plugin/       # macOS-only Swift Vision OCR binary
│   ├── Cargo.toml          # Rust dependencies
│   ├── tauri.conf.json     # Tauri config (signing, updater, deep-link, etc.)
│   ├── Info.plist           # macOS permissions (screen capture, mic, accessibility)
│   └── Entitlements.plist  # Hardened runtime entitlements for notarization
├── src/                    # React frontend (Vite + TypeScript)
│   ├── main.tsx            # Window router (main, capture, ask, settings, meeting-*)
│   ├── app/
│   │   ├── App.tsx         # Main app shell (router, theme, auto-updater check)
│   │   ├── routes.tsx      # React Router routes + navigate event listener
│   │   └── pages/          # All page components
│   ├── windows/            # Standalone window components (popups, indicators)
│   ├── lib/tauri-api.ts    # Frontend → Rust IPC bindings
│   ├── components/         # Shared UI components (shadcn/ui)
│   └── hooks/              # Custom React hooks
├── scripts/
│   └── prebuild.cjs        # Builds frontend + Swift plugin + signs binary
└── public/                 # Static assets
```

## Tech Stack

- **Framework**: Tauri v2 (Rust backend + WebView frontend)
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Database**: SQLite via rusqlite (local at `~/.reattend/reattend.db`)
- **Embeddings**: fastembed (ONNX, runs locally, no API needed)
- **OCR**: Swift Vision framework (macOS only, via `reattend-capture` binary)
- **Audio**: cpal (mic input) + hound (WAV writing)
- **Server**: Thin proxy at reattend.com for API keys (Groq transcription, AI triage)

## Local-First Design

All data lives locally in SQLite. The server (`reattend.com`) is only used for:
- AI triage (proxies to Groq/LLM APIs with metered access)
- Audio transcription (proxies to Groq Whisper)
- Auth (device registration, trial/subscription validation)
- Sharing (creates public share links stored server-side)

## Data Flow

```
Screen OCR / Clipboard / Meeting Audio
  → raw_item (SQLite)
  → Worker: "triage" job → AI extracts title, summary, entities, tags → record
  → Worker: "embed" job → fastembed generates vector → embeddings table
  → Worker: "link" job → cosine similarity search → record_links table
  → (for meetings) Worker: "transcribe" job → Groq Whisper → transcript → triage
```

## Record Types

`decision`, `insight`, `meeting`, `transcript`, `idea`, `context`, `tasklike`, `note`

- `meeting` = screen-captured meeting content (OCR)
- `transcript` = audio recording via mic

---

## Development

### Prerequisites

- macOS 13+ (for Swift Vision OCR)
- Rust (via rustup)
- Node.js 18+
- Xcode Command Line Tools (`xcode-select --install`)

### Setup

```bash
npm install
cd src-tauri/swift-plugin && swift build -c release && cd ../..
```

### Dev Mode

```bash
npm run tauri dev
```

This starts Vite dev server on port 1420 and launches the Tauri app.

### Key Shortcuts (in dev & prod)

- `⌘⇧M` — Toggle meeting recording
- `⌘⇧K` — Open Ask AI window
- `⌘⇧N` — Quick capture
- `⌘⇧S` — Open settings

---

## Building & Releasing

### Environment Variables for Release Build

```bash
export APPLE_ID="parthajy@gmail.com"
export APPLE_PASSWORD="<app-specific-password>"   # Generate at appleid.apple.com
export APPLE_TEAM_ID="6AKUD88CVN"
export TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/reattend-updater.key"
```

The app-specific password is generated at https://appleid.apple.com → Sign In & Security → App-Specific Passwords. If lost, revoke and create a new one.

### Build Command

```bash
npm run tauri build
```

This automatically:
1. Builds the React frontend (`tsc && vite build`)
2. Builds the Swift Vision plugin (`swift build -c release`)
3. Signs the Swift binary with Developer ID + hardened runtime
4. Compiles the Rust backend in release mode
5. Creates `Reattend.app` bundle
6. Signs the app with Developer ID certificate
7. Notarizes with Apple (uploads, waits for approval, staples ticket)
8. Creates `.dmg` installer

Output:
- `src-tauri/target/release/bundle/macos/Reattend.app`
- `src-tauri/target/release/bundle/dmg/Reattend_<version>_aarch64.dmg`

### Code Signing

- **Certificate**: `Developer ID Application: Partha Borthakur (6AKUD88CVN)`
- **Team ID**: `6AKUD88CVN`
- Configured in `tauri.conf.json` → `bundle.macOS.signingIdentity`
- Entitlements in `Entitlements.plist` (JIT, unsigned memory, audio input, Apple Events)
- The Swift plugin binary is also signed during prebuild (`scripts/prebuild.cjs`)

### Notarization

Handled automatically by Tauri during `npm run tauri build` when `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` environment variables are set. No manual `xcrun notarytool` needed.

---

## Auto-Updates

The app checks for updates 5 seconds after launch using `tauri-plugin-updater`.

### How It Works

1. App calls `GET https://www.reattend.com/api/updater/{target}/{arch}/{current_version}`
2. Server reads `data/updater/latest.json` and compares versions
3. If newer version exists, returns download URL + signature
4. App downloads, verifies signature, installs, and relaunches

### Pushing an Update

1. **Bump version** in `src-tauri/tauri.conf.json`:
   ```json
   "version": "0.2.0"
   ```

2. **Build** with the same env vars:
   ```bash
   APPLE_ID=... APPLE_PASSWORD=... APPLE_TEAM_ID=... \
   TAURI_SIGNING_PRIVATE_KEY_PATH=$HOME/.tauri/reattend-updater.key \
   npm run tauri build
   ```

3. **Copy the DMG** to the website for new downloads:
   ```bash
   cp src-tauri/target/release/bundle/dmg/Reattend_0.2.0_aarch64.dmg \
      ~/Desktop/Reattend/reattend.com/public/download/Reattend.dmg
   ```

4. **Create the updater manifest** on the server at `data/updater/latest.json`:
   ```json
   {
     "version": "0.2.0",
     "notes": "What's new in this version",
     "pub_date": "2026-03-08T00:00:00Z",
     "platforms": {
       "darwin-aarch64": {
         "url": "https://www.reattend.com/download/Reattend_0.2.0_aarch64.app.tar.gz",
         "signature": "<contents of .sig file>"
       }
     }
   }
   ```

   The `.tar.gz` and `.sig` files are generated by the build at:
   - `src-tauri/target/release/bundle/macos/Reattend.app.tar.gz`
   - `src-tauri/target/release/bundle/macos/Reattend.app.tar.gz.sig`

   Upload the `.tar.gz` to `public/download/` on the server.

5. **Deploy the server**:
   ```bash
   cd ~/Desktop/Reattend/reattend.com && bash deploy/deploy.sh
   ```

### Updater Signing Key

- **Private key**: `~/.tauri/reattend-updater.key` (KEEP SECRET, no password)
- **Public key**: Embedded in `tauri.conf.json` → `plugins.updater.pubkey`
- If the private key is lost, you must generate a new keypair and release a manual update (users must re-download)

---

## Server (reattend.com)

### Deployment

```bash
cd ~/Desktop/Reattend/reattend.com
bash deploy/deploy.sh
```

This builds Next.js locally, rsyncs to the DO droplet at `157.245.110.176`, installs deps, and restarts PM2.

**SSH quirk**: Large transfers may fail with default cipher. If rsync fails, use:
```bash
rsync -avz -e "ssh -c aes128-ctr -o Compression=no" ...
```

### Key Server Endpoints (for desktop app)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tray/proxy/triage` | POST | AI triage (enrich raw items) |
| `/api/tray/proxy/transcribe` | POST | Audio transcription (Groq Whisper) |
| `/api/tray/proxy/share` | POST | Create share link |
| `/api/tray/proxy/share/email` | POST | Send share via email (Resend) |
| `/api/tray/proxy/share/[token]` | GET | Fetch shared content |
| `/api/updater/[target]/[arch]/[version]` | GET | Auto-update check |
| `/api/tray/proxy/register-device` | POST | Device registration |
| `/api/tray/proxy/check-trial` | GET | Trial status check |

### Environment Variables (Server)

Key env vars in `.env.local` on the server:
- `GROQ_API_KEY` — Groq API for Whisper transcription + LLM
- `RESEND_API_KEY` — Resend for share emails
- `NEXTAUTH_SECRET` / `AUTH_SECRET` — Auth encryption
- `DATABASE_URL` — SQLite path (`file:./data/reattend.db`)

---

## Deep Links

The app registers the `reattend://` URL scheme via `tauri-plugin-deep-link`.

- `reattend://auth/callback?token=...` — OAuth callback
- `reattend://share/TOKEN` — Import shared content into local DB

---

## Sharing

1. User clicks Share on a memory/meeting
2. Desktop app POSTs to `/api/tray/proxy/share` → gets `shareUrl` + `shareToken`
3. Share URL (`reattend.com/share/TOKEN`) shows the content on the web
4. "Open in Reattend" button on share page triggers `reattend://share/TOKEN` deep link
5. Desktop app fetches content from `/api/tray/proxy/share/TOKEN` and imports locally
6. Email sharing: POSTs to `/api/tray/proxy/share/email` → Resend sends styled email

---

## Troubleshooting

### App won't start
- Check `~/.reattend/` exists and is writable
- Check Console.app for crash logs

### Mic permission denied
- System Preferences → Privacy & Security → Microphone → toggle Reattend

### Screen recording permission
- System Preferences → Privacy & Security → Screen Recording → toggle Reattend

### Worker stuck
- Jobs have a 5-minute timeout. Stuck jobs are auto-reset on worker startup.
- Check Settings → AI Logs for job status

### Notarization fails
- Ensure the app-specific password is valid (not expired/revoked)
- Ensure the Developer ID certificate is not expired
- Check that ALL bundled binaries are signed (the Swift plugin was the previous blocker)

### Build fails with "port 1420 in use"
```bash
lsof -ti:1420 | xargs kill -9
pkill -9 -f "tauri"
```
