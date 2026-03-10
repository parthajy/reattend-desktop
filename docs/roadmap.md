# Reattend Product Roadmap

## Phase 1: Ship macOS (Current)

### Critical Fixes
1. **Fix memory page not opening** — investigate and fix routing/runtime bug
2. **Nav rearrange + rename** — Sidebar: Explore, Projects, Memories, Transcripts, Board
3. **Meeting indicator position** — top-right near tray (not center), draggable
4. **Auto-stop meeting** — stop recording after 5 min of silence/inactivity

### Core Features
5. **Proactive ambient assist during meetings**
   - When meeting mode is active, auto-scan screen every 15-30s
   - Embed OCR text, search memory graph for relevant context
   - Auto-popup non-intrusive toast (bottom-left) with relevant memories
   - High confidence threshold (>0.85 cosine) to avoid spam
   - Deduplicate: don't show same memory twice per meeting
   - Auto-dismiss after 8-10s if not clicked

6. **"Reattend" keyword trigger**
   - When OCR detects the word "Reattend" spoken/shown, boost attention
   - Immediately do a deep memory search and surface results
   - Works both in meeting mode and ambient mode

7. **Grammarly-like writing assist**
   - Detect when user is actively writing (email, doc, chat)
   - Use ambient screen capture + memory graph to:
     - Flag inconsistencies with past decisions
     - Suggest relevant context from memories
     - Surface related action items or commitments
   - Non-intrusive inline suggestions near cursor/active window
   - Think Cluely + Grammarly but for ambient knowledge

8. **Share button in Transcripts page** — share individual transcripts via link/email

### Polish
9. **Onboarding/permission wizard** — first-run flow for mic, screen recording, accessibility
10. **Action items as surfaced todos** — extract from meetings, show in inbox/explore
11. **Daily digest / "Start Today"** — morning summary of yesterday's captures + pending action items
12. **Data export** — markdown/JSON export of all memories (local-first promise)

## Phase 2: Cross-Platform + Launch
1. **Windows app** — replace Swift OCR with server-side, test cpal audio on Windows
2. **Revise landing page** — show meeting features, ambient assist, demo videos
3. **Marketing site polish** — pricing, download buttons for both platforms
4. **Go to market**

## Phase 3: Good-to-Have
1. Speaker diarization (identify who said what in transcripts)
2. Live transcript during recording
3. Calendar integration (auto-detect meetings, auto-start recording)
4. Browser extension (capture web pages)
5. Mobile companion app
6. Team/shared workspaces
7. Weekly email summaries / engagement hooks
8. Integrations (Slack, Notion, Linear, etc.)
