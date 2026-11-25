<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · <a href="README.fa.md">فارسی</a> · <a href="https://irdcode.github.io/antigravity-context-monitor/">Docs Page</a>
</p>

<p align="center">
  <img src="assets/hero.svg" alt="Antigravity Context Monitor v2.0 — Real-time session context window meter, auto-compaction guard, 7-category token breakdown, and multi-model ceiling guard for Google Antigravity Desktop" width="100%">
</p>

# Antigravity Context Monitor

**Real-time session Context Window Monitor, auto-compaction (`CHECKPOINT`) guard, `/context`-style 7-category token breakdown, prompt cache telemetry, isolated subagent tracker, and multi-model handoff guard for Google Antigravity Desktop (`v2.0.0`).**

Single-loop AI coding CLIs (such as Claude Code) expose a live `/context` meter because every tool output accumulates inside one linear context array. **Google Antigravity Desktop** runs an asynchronous multi-phase architecture — handing off between Planning and Execution models in `Orchestrator` mode, isolating subagent work (`invoke_subagent`) in separate child sessions, and lazy-loading skills and MCP schemas — while hiding raw token counters from the UI.

Under the hood, Antigravity still logs exact model billing/usage counts per turn (`input_tokens`, `cache_read_tokens`, `output_tokens`) and compaction checkpoints to local session transcripts (`~/.gemini/antigravity/brain/<convId>/.system_generated/logs/transcript.jsonl`). **`antigravity-context-monitor`** reads those local logs strictly read-only and brings transparent, accurate context visibility directly inside Antigravity without intercepting API requests or risking account bans.

<p align="center">
  <img src="assets/architecture.svg" alt="Three-stage passive telemetry architecture v2.0: Read-only transcript analyzer, Unified Titlebar Alt+C and Sidecar AUX_PANE UI with Light and Dark sync, and multi-anchor atomic ASAR lifecycle" width="100%">
</p>

---

## What's New in v2.0.0

- **Google Antigravity Desktop `v2.34.0` Multi-Anchor Patcher:** Supports `loadHubWindowUrl` (`v2.34.0+`) alongside legacy `void win.loadURL` / `await win.loadURL` hooks, embeds a `SHA-256` payload fingerprint for automatic `--if-needed` upgrades, and guards target attachment with a `WeakSet`.
- **Auto-Compaction (`CHECKPOINT`) Guard & Rewind Separation:** Accurately distinguishes true Antigravity compaction checkpoints (`# Resuming from a compaction` / `{{ CHECKPOINT }}`) from `# Browser Session Checkpoint` and `step_index` rewind/retry rollbacks, exposing separate `Compacts` (with expandable pre→post history) and `Rewinds` counters alongside adaptive compaction thresholds (`~500k` on `1M`, `840k` on `claude-1m_840k`, `85%` on `200k`/`128k`) and a configurable `compactWarnPct` slider (`30–95%`).
- **36 Built-In Models + Evergreen Auto-Discovery + Custom Ceilings:** Expanded built-in catalog covering Gemini 4 Neon/Carbon/Hydrogen/Argon, Claude Opus/Sonnet 5.5 (incl. `Max` and dynamic `1M`/`840k`), Gemini 3.x, GPT-OSS 120B/20B, and Orchestrator modes — plus automatic discovery of new models from transcripts and DOM, and an inline `Settings` editor for per-model custom ceilings.
- **Unified Shared UI Kit with Accessible Custom Combobox:** Replaces all native `<select>` popups (eliminating Windows Electron white dropdown glitches) with a searchable, keyboard-navigable ARIA combobox (`role="combobox"`) that never collapses during background polling, with a clean single-column 380px Titlebar drawer.
- **Native Light & Dark Theme Sync:** Mirrors Antigravity's live `--background` luminance and host CSS tokens automatically across both Titlebar and Sidecar surfaces, with color-independent monochrome hatch patterns and `prefers-reduced-motion` support.
- **Clean New Session (`empty_new`) & SPA Route Sync:** Displays `0 / <tier> · Ready` on fresh chats without falling back to stale previous sessions, tracks `pendingFirstResponse` (`~<est>`) before the first model reply, and automatically releases manual session pins on tab navigation.

---

## Why Use Antigravity Context Monitor?

- **Exact Ground-Truth Token Counts:** Computes live context usage directly from the latest `PLANNER_RESPONSE` record (`input_tokens + cache_read_tokens + output_tokens`), never rough character guesses.
- **Triple-Marker Meter & Compaction Forecasting:** Visualizes the reasoning focus sweet spot (`80k` / `120k` / `150k`), adaptive Auto-Compact threshold + hatched compaction zone, and hard context ceiling (`128k` / `200k` / `1M`), raising `Approaching Compact` and `Compacting Soon` alerts before context gets summarized.
- **Multi-Model Handoff & Phase Guard:** Tracks genuine `<USER_SETTINGS_CHANGE>` model switches inside `USER_INPUT` turns (immune to spoofed strings inside prompts or tool outputs), tracks `exit_plan_mode` / `[plan review]` transitions (`PLANNING ↔ EXECUTION`), and warns immediately if active context exceeds a narrower model tier (`128k` or `200k`).
- **7-Category Token Allocation Breakdown:** Reconciles active tokens to **100% parity** with `activeTokens` across `System & Rules`, `MCP Servers & Tools`, `Skills & Plugins`, `Files & Codebase`, `Terminal & Tasks`, `Chat Messages`, and `Reasoning & Subagents` — including rotated log windows, `CHECKPOINT` compactions, and `step_index` rewind rollbacks.
- **Prompt Cache & Subagent Isolation Visibility:** Displays cache hit rate (`%`), fresh vs cached tokens, cache misses, compaction history, rewind counts, and tokens offloaded into child `invoke_subagent` sessions.
- **Dual Native-Styled Surfaces:**
  1. **Titlebar Live Meter + Drawer (`Alt+C` / `⌥C`):** Crisp adaptive-theme pill and single-column analytical drawer injected into Antigravity's top bar.
  2. **Official Sidecar UI Extension (`sidecar/`):** Full-height Auxiliary Side Pane powered by Antigravity's `sidecar_sdk`, synced to `~/.gemini/config/plugins/context-monitor/`.

---

## Supported Models & Context Ceilings

| Model Family | Built-In Models (36 Official IDs) | Context Limit | Default Auto-Compact | Focus Sweet Spot |
| :--- | :--- | ---: | ---: | ---: |
| **GPT-OSS** | `gpt-oss-120b-medium`, `gpt-oss-20b` | `128,000` (`128k`) | `108,800` (`85%`) | `80,000` (`80k`) |
| **Claude 5.5** | `claude-opus-5-5-{max,high,medium,low}`, `claude-sonnet-5-5-{max,high,medium,low}` (`1M`/`840k` variants inferred dynamically) | `200,000` (`200k`) | `170,000` (`85%`) | `120,000` (`120k`) |
| **Gemini 4** | `gemini-4-neon-{xhigh,high,medium,low}`, `gemini-4-carbon-{high,medium,low}`, `gemini-4-hydrogen-{xhigh,high,medium,low}`, `gemini-4-argon-{high,medium,low}` | `1,000,000` (`1M`) | `500,000` (`50%`) | `150,000` (`150k`) |
| **Gemini 3.x** | `gemini-3.8-flash-{high,medium,low}`, `gemini-3.7-flash-high`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.1-pro-{high,low}`, `gemini-3.1-flash-lite` | `1,000,000` (`1M`) | `500,000` (`50%`) | `150,000` (`150k`) |
| **Orchestrator** | `orchestrator-gemini-4-neon-xhigh`, `gemini-4-hydrogen-orchestrator`, `gemini-pro-orchestrator-g1-pro` (`PLANNING ↔ EXECUTION` dual-phase) | `1,000,000` (`1M`) | `500,000` (`50%`) | `150,000` (`150k`) |

Future models are automatically discovered from session transcripts and the live Antigravity UI (deduplicating `XHigh` / `Extra High`), and you can override any model's `contextLimit`, `compactionLimit`, or `attentionThreshold` directly from the collapsible **Settings** section.

---

## 7-Category Token Breakdown

| Category | What It Tracks |
| :--- | :--- |
| **System & Rules** | Base system prompt, workspace rules (`AGENTS.md`, `GEMINI.md`), and user rules preamble (calibrated to Antigravity's `40k` rules/customization budget cap) |
| **MCP Servers & Tools** | Active MCP declarations, `call_mcp_tool`, `mcp_*` tools, `list_resources` / `read_resource`, and MCP schemas |
| **Skills & Plugins** | Progressive-disclosure skills index, loaded `SKILL.md` guides, and plugin catalog/marketplace lookups |
| **Files & Codebase** | `read_file`, `edit_file`, `write_file`, `grep_search`, `find_by_name`, `list_dir`, and code outlines |
| **Terminal & Tasks** | `run_command`, `manage_task`, and background task stdout/stderr notifications |
| **Chat Messages** | User prompts (`<USER_REQUEST>`) and visible assistant replies |
| **Reasoning & Subagents** | Model `thinking` traces, `exit_plan_mode`, `ask_question`, `swarm`, `run_workflow`, and `invoke_subagent` orchestration |

---

## Requirements

- **Google Antigravity Desktop** (verified on **Antigravity Desktop `v2.34.0`**, backwards-compatible with `v2.32.x`–`v2.33.x`, Windows 10/11 x64; CLI resolves standard macOS & Linux paths)
- **Node.js `>= 20.0.0`** (`winget install OpenJS.NodeJS.LTS` or [nodejs.org](https://nodejs.org/))
- First run installs the single dependency (`@electron/asar`) automatically if missing; runtime monitoring is **100% offline**.

---

## Quick Start (Windows)

1. Clone or download the latest release to a permanent folder (for example `C:\Tools\antigravity-context-monitor`).
2. Double-click **`Launch-Antigravity-Context.bat`**:
   - Installs `@electron/asar` once if missing.
   - Backs up untouched `app.asar` to `app.asar.bak`.
   - Applies or upgrades the titlebar meter (`Alt+C`), syncs the Sidecar plugin to `~/.gemini/config/plugins/context-monitor`, and starts `Antigravity.exe`.
   - Re-running after official Antigravity updates or monitor upgrades automatically re-applies via `SHA-256` payload checks (`--if-needed`).
3. Inside Antigravity:
   - Press **`Alt+C`** (`⌥C` on macOS) or click the live meter pill in the top bar.
   - To dock the full-height Sidecar panel: open **Customizations → Installed**, enable **Context Monitor**, and choose **⋮ → Extensions → Context Window** inside any conversation.

### Included Windows Batch Tools

| File | Purpose |
| :--- | :--- |
| `Launch-Antigravity-Context.bat` | Checks ASAR state & payload hash, applies/upgrades patch + Sidecar sync if needed, and starts `Antigravity.exe` |
| `Diagnose-Antigravity-Context.bat` | Non-destructive health check (`doctor`) covering Node, `app.asar`, anchor match, payload SHA-256, Sidecar sync, `.bak` backup, and locks |
| `Restore-Antigravity-Context.bat` | Cleanly removes Context Monitor (byte-identical `.bak` SHA-256 restore, or self-healing strip fallback) |

---

## CLI Usage (Windows, macOS & Linux)

```bash
npm install --omit=dev
npm run doctor                 # Non-destructive health check
npm run patch                  # Apply ASAR patch + sync Sidecar plugin
node src/patcher.mjs patch --if-needed
npm run sync                   # Sync src/context-core.cjs and Sidecar files without touching app.asar
npm run analyze -- --json      # Inspect active/recent session context breakdown in CLI
npm run status                 # Inspect patch, payload hash, Sidecar, and backup state
npm run restore                # Revert cleanly to stock Antigravity Desktop
```

Supported flags: `--path "<file_or_dir>"`, `--json`, `--if-needed` (`patch`), `--strict-backup` (`restore`), `--conv <id>` and `--model <id>` (`analyze`).

---

## Security & Account-Safety Guarantees

| Security Control | Implementation |
| :--- | :--- |
| **Account-Safe Passive Read** | Reads local `transcript.jsonl` files strictly read-only; never hooks API requests, auth headers, tokens, or prompts |
| **Origin Allowlist** | Both `dom-ready` injection and `console-message` handlers strictly enforce `^https?://127\.0\.0\.1:\d+` |
| **Config Sanitization** | Writes to `~/.antigravity-context-monitor.json` sanitize `modelOverride`, `selectedConvId`, `compactWarnPct` (`30..95`), `showInTitlebar`, and `customModels` (rejecting prototype-pollution keys and unsafe IDs) |
| **Zero Network Calls** | Zero `fetch`, zero remote endpoints, zero `shell.openExternal` inside injected code |
| **Scope & ASAR Safety** | Isolates `context-core.cjs` inside a local closure so outer `dist/utils.js` `module.exports` stays intact; guards listener attachment with a `WeakSet`; verifies syntax in `node:vm` before packing and preserves `app.asar.unpacked` |

---

## Error Reference & Fixes

| Error Code | Likely Cause | Fix |
| :--- | :--- | :--- |
| `ANTIGRAVITY_RUNNING` / `FILE_LOCKED` / `ANTIGRAVITY_STILL_RUNNING` | `Antigravity.exe` or its System Tray process holds `app.asar` open | Quit Antigravity completely (check System Tray / Task Manager) and re-run |
| `NODE_NOT_FOUND` / `NODE_TOO_OLD` | Node.js is missing from `PATH` or older than `20.0.0` | Install Node.js LTS (`winget install OpenJS.NodeJS.LTS` or [nodejs.org](https://nodejs.org/)) |
| `ASAR_NOT_FOUND` / `EXE_NOT_FOUND` | Non-standard Antigravity install path | Pass `-AsarPath "C:\path\to\resources\app.asar"` or `--path "<path>"` |
| `ANCHOR_NOT_FOUND` | Future Antigravity update altered the `loadHubWindowUrl` / `loadURL` hooks in `dist/utils.js` | Original `app.asar` was **not** modified; run `Diagnose-Antigravity-Context.bat` and open a Compatibility issue |
| `CORRUPT_ASAR` / `NO_BACKUP` | Damaged archive or missing `.bak` under `--strict-backup` | Run `Restore-Antigravity-Context.bat` without `--strict-backup`, or reinstall Antigravity Desktop |

---

## Development & Verification

```bash
npm test
```

Runs `test/patcher.test.mjs` (**13 test suites**), verifying all 36 built-in model ceilings + auto-discovery, `CHECKPOINT` compaction vs `step_index` rewind rollback, `compactWarnPct` & `empty_new` / `pending` states, spoofed tool-output immunity, Plan/Execute phase transitions, subagent isolation, multi-anchor `v2.34.0`/legacy patching & SHA-256 auto-upgrade, `127.0.0.1` origin guards, `module.exports` preservation, shared UI kit parity (custom ARIA combobox, Light/Dark theme sync, single-column Titlebar drawer), and `.unpacked` preservation on real `app.asar` copies.

---

## License

MIT — `Copyright (c) 2026 Kiarash Javanbakht (IRDcode)`. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
