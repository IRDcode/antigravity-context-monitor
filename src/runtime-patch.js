/* ANTIGRAVITY CONTEXT MONITOR v1.0 */
((win) => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const LOCAL_ORIGIN_RE = /^https?:\/\/127\.0\.0\.1:\d+/i;
    const SAFE_MODEL_RE = /^[A-Za-z0-9 ._()/-]{1,64}$/;
    const SAFE_CONV_RE = /^(?:auto|[A-Za-z0-9._-]{8,80})$/;
    const SAVE_PREFIX = 'AG_CTX_SAVE|';
    const POLL_PREFIX = 'AG_CTX_POLL|';

    const coreModule = (() => {
        const module = { exports: {} };
        const exports = module.exports;
        __CONTEXT_CORE__
        return module.exports;
    })();

    const analyzer = coreModule && typeof coreModule.createContextAnalyzer === 'function'
        ? coreModule.createContextAnalyzer({ fs, path, os })
        : null;

    const BASE_CONFIG = {
        modelOverride: 'auto',
        selectedConvId: 'auto',
        compactWarnPct: 70,
        showInTitlebar: true
    };

    function sanitizeSettings(raw) {
        const clean = {};
        if (!raw || typeof raw !== 'object') return clean;
        if (typeof raw.modelOverride === 'string' && (raw.modelOverride === 'auto' || SAFE_MODEL_RE.test(raw.modelOverride))) {
            clean.modelOverride = raw.modelOverride.trim();
        }
        if (typeof raw.selectedConvId === 'string' && SAFE_CONV_RE.test(raw.selectedConvId)) {
            clean.selectedConvId = raw.selectedConvId.trim();
        }
        if (raw.compactWarnPct !== undefined) {
            const n = Number(raw.compactWarnPct);
            if (Number.isInteger(n) && n >= 30 && n <= 95) {
                clean.compactWarnPct = n;
            }
        }
        if (typeof raw.showInTitlebar === 'boolean') {
            clean.showInTitlebar = raw.showInTitlebar;
        }
        return clean;
    }

    function settingsFilePath() {
        return path.join(os.homedir(), '.antigravity-context-monitor.json');
    }

    function readSettings() {
        let merged = { ...BASE_CONFIG };
        try {
            const file = settingsFilePath();
            if (fs.existsSync(file)) {
                const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
                merged = { ...merged, ...sanitizeSettings(parsed) };
            }
        } catch (_) {}
        return merged;
    }

    function writeSettingsPatch(patch) {
        try {
            const cleanPatch = sanitizeSettings(patch);
            const file = settingsFilePath();
            let current = {};
            if (fs.existsSync(file)) {
                try {
                    current = sanitizeSettings(JSON.parse(fs.readFileSync(file, 'utf8')));
                } catch (_) {}
            }
            const next = { ...BASE_CONFIG, ...current, ...cleanPatch };
            fs.writeFileSync(file, JSON.stringify(next, null, 2));
            return next;
        } catch (_) {
            return readSettings();
        }
    }

    function isLocalAppUrl(rawUrl) {
        return typeof rawUrl === 'string' && LOCAL_ORIGIN_RE.test(rawUrl);
    }

    const targetContents = (typeof hubContents !== 'undefined' && hubContents)
        ? hubContents
        : (win && win.webContents);

    let lastRendererConvId = '';
    let lastFingerprint = '';
    let pollTimer = null;

    function buildPayload(cfg, rendererConvId) {
        if (!analyzer) return null;
        const recent = analyzer.listRecentConversations({ limit: 15 });
        let targetId = '';
        if (cfg.selectedConvId && cfg.selectedConvId !== 'auto') {
            targetId = cfg.selectedConvId;
        } else if (rendererConvId && SAFE_CONV_RE.test(rendererConvId) && rendererConvId !== 'auto') {
            const check = analyzer.analyzeConversationDir(rendererConvId, { modelOverride: cfg.modelOverride });
            if (check) {
                return {
                    config: cfg,
                    resolvedBy: 'renderer',
                    modelCatalog: analyzer.MODEL_CATALOG,
                    recentConversations: recent,
                    analysis: check
                };
            }
        }
        if (!targetId && recent.length > 0) {
            targetId = recent[0].conversationId;
        }
        const analysis = targetId
            ? analyzer.analyzeConversationDir(targetId, { modelOverride: cfg.modelOverride })
            : null;
        return {
            config: cfg,
            resolvedBy: cfg.selectedConvId && cfg.selectedConvId !== 'auto' ? 'manual' : 'latest_activity',
            modelCatalog: analyzer.MODEL_CATALOG,
            recentConversations: recent,
            analysis
        };
    }

    function computeFingerprint(cfg, rendererConvId) {
        if (!analyzer) return '';
        const brainDir = analyzer.findBrainDir();
        const recent = analyzer.listRecentConversations({ limit: 5 });
        const top = recent[0] ? `${recent[0].conversationId}:${recent[0].mtimeMs}:${recent[0].activeTokens}` : 'none';
        let selectedStat = '';
        const explicitId = (cfg.selectedConvId && cfg.selectedConvId !== 'auto') ? cfg.selectedConvId : rendererConvId;
        if (explicitId && SAFE_CONV_RE.test(explicitId) && explicitId !== 'auto') {
            try {
                const tp = path.join(brainDir, explicitId, '.system_generated', 'logs', 'transcript.jsonl');
                if (fs.existsSync(tp)) {
                    const st = fs.statSync(tp);
                    selectedStat = `${explicitId}:${st.mtimeMs}:${st.size}`;
                }
            } catch (_) {}
        }
        return `${cfg.modelOverride}|${cfg.selectedConvId}|${cfg.compactWarnPct}|${cfg.showInTitlebar}|${rendererConvId}|${brainDir}|${top}|${selectedStat}`;
    }

    function pushUpdate(force = false) {
        if (!targetContents || targetContents.isDestroyed?.()) return;
        if (!isLocalAppUrl(targetContents.getURL())) return;
        try {
            const cfg = readSettings();
            const fp = computeFingerprint(cfg, lastRendererConvId);
            if (!force && fp === lastFingerprint) return;
            lastFingerprint = fp;
            const payload = buildPayload(cfg, lastRendererConvId);
            if (!payload) return;
            targetContents.executeJavaScript(
                `window.__agCtxReceive && window.__agCtxReceive(${JSON.stringify(payload)});`
            ).catch(() => {});
        } catch (_) {}
    }

    if (targetContents && typeof targetContents.on === 'function') {
        targetContents.on('console-message', (eventOrDetails, ...args) => {
            if (!isLocalAppUrl(targetContents.getURL())) return;
            const msg = (args.length === 0 && eventOrDetails && typeof eventOrDetails === 'object')
                ? eventOrDetails.message
                : args[1];
            if (typeof msg !== 'string') return;

            if (msg.startsWith(SAVE_PREFIX)) {
                try {
                    const patch = JSON.parse(msg.slice(SAVE_PREFIX.length));
                    writeSettingsPatch(patch);
                    pushUpdate(true);
                } catch (_) {}
                return;
            }

            if (msg.startsWith(POLL_PREFIX)) {
                try {
                    const req = JSON.parse(msg.slice(POLL_PREFIX.length));
                    if (req && typeof req.detectedConvId === 'string' && (req.detectedConvId === '' || SAFE_CONV_RE.test(req.detectedConvId))) {
                        lastRendererConvId = req.detectedConvId;
                    }
                    pushUpdate(true);
                } catch (_) {}
            }
        });

        targetContents.on('dom-ready', () => {
            if (!isLocalAppUrl(targetContents.getURL())) return;
            try {
                const initialCfg = readSettings();
                const initialPayload = buildPayload(initialCfg, lastRendererConvId);
                lastFingerprint = computeFingerprint(initialCfg, lastRendererConvId);

                if (pollTimer) clearInterval(pollTimer);
                pollTimer = setInterval(() => pushUpdate(false), 1500);
                if (pollTimer && typeof pollTimer.unref === 'function') {
                    pollTimer.unref();
                }
                const stopPolling = () => {
                    if (pollTimer) {
                        clearInterval(pollTimer);
                        pollTimer = null;
                    }
                };
                if (win && typeof win.on === 'function') {
                    win.on('closed', stopPolling);
                }
                if (typeof targetContents.once === 'function') {
                    targetContents.once('destroyed', stopPolling);
                }

                targetContents.executeJavaScript(`(() => {
                if (window.__agContextMonitorMounted) return;
                window.__agContextMonitorMounted = true;

                let latestData = ${JSON.stringify(initialPayload)};
                const SAVE_PREFIX = '${SAVE_PREFIX}';
                const POLL_PREFIX = '${POLL_PREFIX}';
                const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

                function escapeHtml(str) {
                    return String(str ?? '')
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;');
                }

                function fmtTok(n) {
                    const v = Number(n) || 0;
                    if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
                    if (v >= 10000) return (v / 1000).toFixed(0) + 'k';
                    if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
                    return String(v);
                }

                function fmtFull(n) {
                    return (Number(n) || 0).toLocaleString();
                }

                function detectRendererConvId() {
                    try {
                        const locMatch = UUID_RE.exec(window.location.href || '');
                        if (locMatch) return locMatch[1];

                        const frames = document.querySelectorAll('iframe[src*="conversationId="]');
                        for (const f of frames) {
                            const m = /[?&]conversationId=([0-9a-f-]{8,})/i.exec(f.getAttribute('src') || '');
                            if (m) return m[1];
                        }

                        const dataEl = document.querySelector('[data-conversation-id]');
                        if (dataEl) {
                            const id = dataEl.getAttribute('data-conversation-id');
                            if (id && UUID_RE.test(id)) return id;
                        }

                        const links = document.querySelectorAll('a[href*="/brain/"], [href*="conversation://"]');
                        for (let i = links.length - 1; i >= 0; i--) {
                            const href = links[i].getAttribute('href') || '';
                            const m = UUID_RE.exec(href);
                            if (m) return m[1];
                        }
                    } catch (_) {}
                    return '';
                }

                function hasAppShell() {
                    try {
                        const root = document.getElementById('root');
                        if (!root || root.children.length === 0 || !document.body) return false;
                        return Boolean(
                            document.querySelector('[role="navigation"]') ||
                            document.querySelector('[role="main"]') ||
                            document.querySelector('[contenteditable="true"]')
                        );
                    } catch (_) {
                        return false;
                    }
                }

                function saveConfig(patch) {
                    try {
                        console.log(SAVE_PREFIX + JSON.stringify(patch));
                    } catch (_) {}
                }

                function requestPoll() {
                    try {
                        console.log(POLL_PREFIX + JSON.stringify({ detectedConvId: detectRendererConvId() }));
                    } catch (_) {}
                }

                function mountUi() {
                    if (!document.getElementById('ag-ctx-ui-css')) {
                        const css = document.createElement('style');
                        css.id = 'ag-ctx-ui-css';
                        css.textContent = \`
                            #ag-ctx-toolbar-wrap {
                                position: relative;
                                display: inline-flex;
                                align-items: center;
                                -webkit-app-region: no-drag;
                            }
                            #ag-ctx-toolbar-btn {
                                display: inline-flex;
                                align-items: center;
                                gap: 6px;
                                height: 28px;
                                padding: 0 9px;
                                border-radius: 6px;
                                border: 1px solid var(--border, rgba(255,255,255,0.14));
                                background: transparent;
                                color: var(--secondary-foreground, var(--foreground, #e4e4e7));
                                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                                font-size: 11.5px;
                                font-weight: 500;
                                line-height: 1;
                                font-variant-numeric: tabular-nums;
                                cursor: pointer;
                                user-select: none;
                                -webkit-app-region: no-drag;
                                transition: background-color 140ms ease, border-color 140ms ease;
                            }
                            #ag-ctx-toolbar-btn:hover {
                                background: var(--secondary, rgba(255,255,255,0.08));
                                color: var(--foreground, #ffffff);
                            }
                            #ag-ctx-toolbar-btn.zone-warn {
                                border-color: rgba(245, 158, 11, 0.45);
                            }
                            #ag-ctx-toolbar-btn.zone-danger {
                                border-color: rgba(239, 68, 68, 0.55);
                            }
                            .ag-ctx-dot {
                                width: 6px;
                                height: 6px;
                                border-radius: 50%;
                                background: #10b981;
                                flex-shrink: 0;
                            }
                            .ag-ctx-dot.warn { background: #f59e0b; }
                            .ag-ctx-dot.danger { background: #ef4444; }

                            #ag-ctx-drawer {
                                position: fixed;
                                z-index: 999998;
                                width: 376px;
                                max-width: calc(100vw - 16px);
                                max-height: calc(100vh - 56px);
                                overflow-y: auto;
                                padding: 12px;
                                border-radius: 10px;
                                background: var(--popover, var(--card, #111114));
                                color: var(--popover-foreground, var(--foreground, #f4f4f5));
                                border: 1px solid var(--border, rgba(255,255,255,0.14));
                                box-shadow: 0 14px 36px rgba(0,0,0,0.48);
                                font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
                                font-size: 12px;
                                direction: ltr;
                                text-align: left;
                                opacity: 0;
                                transform: translateY(-4px) scale(0.97);
                                pointer-events: none;
                                transition: opacity 140ms ease, transform 140ms cubic-bezier(0.16, 1, 0.3, 1);
                            }
                            #ag-ctx-drawer.open {
                                opacity: 1;
                                transform: translateY(0) scale(1);
                                pointer-events: auto;
                            }
                            .ag-ctx-head {
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                gap: 8px;
                                padding-bottom: 8px;
                                border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
                                margin-bottom: 10px;
                            }
                            .ag-ctx-head-left {
                                display: flex;
                                align-items: center;
                                gap: 8px;
                            }
                            .ag-ctx-title {
                                font-size: 11px;
                                font-weight: 700;
                                letter-spacing: 0.08em;
                                text-transform: uppercase;
                                opacity: 0.85;
                            }
                            .ag-ctx-pill {
                                font-family: ui-monospace, Menlo, Consolas, monospace;
                                font-size: 10px;
                                font-weight: 600;
                                padding: 2px 6px;
                                border-radius: 4px;
                                background: var(--muted, rgba(255,255,255,0.08));
                                border: 1px solid var(--border, rgba(255,255,255,0.12));
                                color: var(--foreground, #e4e4e7);
                            }
                            .ag-ctx-pill.plan { border-color: rgba(59,130,246,0.45); }
                            .ag-ctx-pill.exec { border-color: rgba(16,185,129,0.45); }
                            .ag-ctx-icon-btn {
                                border: 1px solid var(--border, rgba(255,255,255,0.12));
                                background: transparent;
                                color: inherit;
                                border-radius: 5px;
                                padding: 2px 6px;
                                font-size: 11px;
                                cursor: pointer;
                                opacity: 0.78;
                            }
                            .ag-ctx-icon-btn:hover { opacity: 1; background: var(--secondary, rgba(255,255,255,0.08)); }

                            .ag-ctx-controls {
                                display: grid;
                                grid-template-columns: 1fr 1fr;
                                gap: 8px;
                                margin-bottom: 10px;
                            }
                            .ag-ctx-field label {
                                display: block;
                                font-size: 10px;
                                text-transform: uppercase;
                                letter-spacing: 0.06em;
                                opacity: 0.62;
                                margin-bottom: 3px;
                            }
                            .ag-ctx-select {
                                width: 100%;
                                height: 26px;
                                padding: 0 6px;
                                border-radius: 5px;
                                font-size: 11px;
                                background: var(--muted, #1f1f23);
                                color: var(--foreground, #f4f4f5);
                                border: 1px solid var(--border, rgba(255,255,255,0.14));
                                outline: none;
                            }
                            .ag-ctx-select:focus {
                                border-color: var(--primary, #3b82f6);
                            }

                            .ag-ctx-meter-card {
                                padding: 10px;
                                border-radius: 8px;
                                background: var(--secondary, rgba(255,255,255,0.03));
                                border: 1px solid var(--border, rgba(255,255,255,0.1));
                                margin-bottom: 10px;
                            }
                            .ag-ctx-meter-top {
                                display: flex;
                                align-items: baseline;
                                justify-content: space-between;
                                margin-bottom: 6px;
                            }
                            .ag-ctx-big {
                                font-family: ui-monospace, Menlo, Consolas, monospace;
                                font-size: 18px;
                                font-weight: 700;
                                font-variant-numeric: tabular-nums;
                            }
                            .ag-ctx-sub {
                                font-family: ui-monospace, Menlo, Consolas, monospace;
                                font-size: 11px;
                                opacity: 0.68;
                                font-variant-numeric: tabular-nums;
                            }
                            .ag-ctx-bar-track {
                                position: relative;
                                height: 8px;
                                border-radius: 999px;
                                background: var(--muted, rgba(255,255,255,0.1));
                                overflow: hidden;
                                margin-bottom: 6px;
                            }
                            .ag-ctx-bar-fill {
                                height: 100%;
                                border-radius: 999px;
                                background: var(--foreground, #e4e4e7);
                                transition: width 180ms ease;
                            }
                            .ag-ctx-bar-fill.warn { background: #f59e0b; }
                            .ag-ctx-bar-fill.danger { background: #ef4444; }
                            .ag-ctx-attn-tick {
                                position: absolute;
                                top: 0;
                                bottom: 0;
                                width: 2px;
                                background: var(--background, #09090b);
                                opacity: 0.85;
                            }
                            .ag-ctx-meter-foot {
                                display: flex;
                                justify-content: space-between;
                                font-size: 10.5px;
                                opacity: 0.72;
                                font-family: ui-monospace, Menlo, Consolas, monospace;
                                font-variant-numeric: tabular-nums;
                            }

                            .ag-ctx-alert {
                                padding: 7px 9px;
                                border-radius: 6px;
                                font-size: 11px;
                                line-height: 1.4;
                                margin-bottom: 10px;
                                border: 1px solid var(--border, rgba(255,255,255,0.14));
                                background: var(--muted, rgba(255,255,255,0.05));
                            }
                            .ag-ctx-alert.warn { border-color: rgba(245,158,11,0.5); }
                            .ag-ctx-alert.danger { border-color: rgba(239,68,68,0.6); }

                            .ag-ctx-section-label {
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                font-size: 10px;
                                font-weight: 700;
                                letter-spacing: 0.07em;
                                text-transform: uppercase;
                                opacity: 0.62;
                                margin: 8px 0 5px;
                            }
                            .ag-ctx-matrix {
                                display: grid;
                                grid-template-columns: repeat(3, 1fr);
                                gap: 6px;
                                margin-bottom: 10px;
                            }
                            .ag-ctx-tier {
                                padding: 6px 7px;
                                border-radius: 6px;
                                border: 1px solid var(--border, rgba(255,255,255,0.1));
                                background: var(--secondary, rgba(255,255,255,0.02));
                                font-family: ui-monospace, Menlo, Consolas, monospace;
                                font-variant-numeric: tabular-nums;
                            }
                            .ag-ctx-tier.overflow { border-color: rgba(239,68,68,0.55); }
                            .ag-ctx-tier.warn { border-color: rgba(245,158,11,0.45); }
                            .ag-ctx-tier-name { font-size: 10px; opacity: 0.7; }
                            .ag-ctx-tier-val { font-size: 11.5px; font-weight: 600; margin-top: 2px; }

                            .ag-ctx-stack {
                                display: flex;
                                height: 7px;
                                border-radius: 999px;
                                overflow: hidden;
                                gap: 1px;
                                background: var(--muted, rgba(255,255,255,0.08));
                                margin-bottom: 7px;
                            }
                            .ag-ctx-cat-list {
                                display: flex;
                                flex-direction: column;
                                gap: 4px;
                                margin-bottom: 10px;
                            }
                            .ag-ctx-cat-row {
                                display: grid;
                                grid-template-columns: 10px 1fr auto auto;
                                align-items: center;
                                gap: 7px;
                                font-size: 11.5px;
                            }
                            .ag-ctx-swatch {
                                width: 8px;
                                height: 8px;
                                border-radius: 2px;
                                border: 1px solid var(--border, rgba(255,255,255,0.2));
                            }
                            .ag-ctx-cat-tok, .ag-ctx-cat-pct {
                                font-family: ui-monospace, Menlo, Consolas, monospace;
                                font-size: 11px;
                                font-variant-numeric: tabular-nums;
                            }
                            .ag-ctx-cat-pct {
                                min-width: 40px;
                                text-align: right;
                                opacity: 0.68;
                            }

                            .ag-ctx-kv-grid {
                                display: grid;
                                grid-template-columns: repeat(4, 1fr);
                                gap: 6px;
                                padding: 7px 8px;
                                border-radius: 6px;
                                border: 1px solid var(--border, rgba(255,255,255,0.1));
                                margin-bottom: 10px;
                                font-family: ui-monospace, Menlo, Consolas, monospace;
                                font-variant-numeric: tabular-nums;
                            }
                            .ag-ctx-kv-k { font-size: 9.5px; opacity: 0.6; text-transform: uppercase; }
                            .ag-ctx-kv-v { font-size: 11px; font-weight: 600; margin-top: 1px; }

                            .ag-ctx-sub-list {
                                display: flex;
                                flex-direction: column;
                                gap: 4px;
                                margin-bottom: 10px;
                            }
                            .ag-ctx-sub-item {
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                padding: 5px 7px;
                                border-radius: 5px;
                                border: 1px solid var(--border, rgba(255,255,255,0.1));
                                font-size: 11px;
                            }
                            .ag-ctx-foot {
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                gap: 8px;
                                padding-top: 8px;
                                border-top: 1px solid var(--border, rgba(255,255,255,0.1));
                            }
                            .ag-ctx-btn {
                                padding: 5px 10px;
                                border-radius: 6px;
                                border: 1px solid var(--border, rgba(255,255,255,0.16));
                                background: var(--secondary, rgba(255,255,255,0.06));
                                color: var(--foreground, #f4f4f5);
                                font-size: 11px;
                                font-weight: 500;
                                cursor: pointer;
                            }
                            .ag-ctx-btn:hover { background: var(--muted, rgba(255,255,255,0.12)); }
                        \`;
                        document.head.appendChild(css);
                    }

                    const isMac = /Mac/i.test(navigator.userAgent || navigator.platform);
                    const shortcutHint = isMac ? '⌥C' : 'Alt+C';

                    const wrap = document.createElement('div');
                    wrap.id = 'ag-ctx-toolbar-wrap';
                    wrap.setAttribute('data-ag-ctx-ui', '1');
                    wrap.innerHTML = \`
                        <button id="ag-ctx-toolbar-btn" type="button" title="Antigravity Context Window Monitor (\${shortcutHint})" aria-expanded="false">
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3" opacity="0.35"/>
                                <path id="ag-ctx-gauge-arc" d="M8 2 A6 6 0 0 1 14 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                            <span id="ag-ctx-btn-label">Ctx —</span>
                            <span id="ag-ctx-dot" class="ag-ctx-dot"></span>
                        </button>
                    \`;

                    const drawer = document.createElement('div');
                    drawer.id = 'ag-ctx-drawer';
                    drawer.setAttribute('data-ag-ctx-ui', '1');

                    function attachUi() {
                        if (!document.getElementById('ag-ctx-toolbar-wrap')) {
                            const cluster = document.querySelector('[data-testid="titlebar-more-actions"]')?.parentElement
                                || document.querySelector('[data-testid="install-editor"]')?.parentElement;
                            if (cluster) cluster.appendChild(wrap);
                        }
                        if (!document.getElementById('ag-ctx-drawer')) {
                            document.body.appendChild(drawer);
                        }
                    }

                    attachUi();

                    const btn = wrap.querySelector('#ag-ctx-toolbar-btn');
                    const btnLabel = wrap.querySelector('#ag-ctx-btn-label');
                    const dot = wrap.querySelector('#ag-ctx-dot');

                    function renderAll() {
                        const data = latestData;
                        if (!data || !data.analysis) {
                            btnLabel.textContent = 'Ctx 0';
                            dot.className = 'ag-ctx-dot';
                            drawer.innerHTML = \`
                                <div class="ag-ctx-head">
                                    <div class="ag-ctx-head-left">
                                        <span class="ag-ctx-title">Context Window</span>
                                        <span class="ag-ctx-pill">\${shortcutHint}</span>
                                    </div>
                                    <button id="ag-ctx-refresh-btn" class="ag-ctx-icon-btn" type="button">↺</button>
                                </div>
                                <div style="opacity:0.7;padding:8px 0">No active session transcript found yet.</div>
                            \`;
                            drawer.querySelector('#ag-ctx-refresh-btn')?.addEventListener('click', requestPoll);
                            return;
                        }

                        const a = data.analysis;
                        const cfg = data.config || {};
                        const warnClass = (a.zone === 'OVERFLOW' || a.zone === 'CRITICAL')
                            ? 'danger'
                            : (a.zone === 'ATTENTION_WARN' ? 'warn' : '');

                        btnLabel.textContent = \`\${fmtTok(a.activeTokens)}/\${a.activeModel.tierLabel} · \${a.usedPct}%\`;
                        dot.className = 'ag-ctx-dot' + (warnClass ? ' ' + warnClass : '');
                        btn.className = warnClass ? ('zone-' + warnClass) : '';
                        wrap.style.display = cfg.showInTitlebar === false ? 'none' : 'inline-flex';

                        const activeEl = document.activeElement;
                        if (activeEl && drawer.contains(activeEl) && activeEl.tagName === 'SELECT') {
                            return;
                        }

                        const sessionOpts = [
                            \`<option value="auto" \${cfg.selectedConvId === 'auto' ? 'selected' : ''}>Auto (\${escapeHtml(data.resolvedBy === 'renderer' ? 'Active Tab' : 'Latest')})</option>\`
                        ];
                        for (const r of (data.recentConversations || [])) {
                            const selected = cfg.selectedConvId === r.conversationId ? 'selected' : '';
                            sessionOpts.push(\`<option value="\${escapeHtml(r.conversationId)}" \${selected}>\${escapeHtml(r.title || r.conversationId.slice(0, 8))} · \${fmtTok(r.activeTokens)}</option>\`);
                        }

                        const modelGroups = { claude: [], 'gpt-oss': [], gemini: [], orchestrator: [] };
                        for (const m of (data.modelCatalog || [])) {
                            (modelGroups[m.family] || modelGroups.gemini).push(m);
                        }
                        const modelOpts = [
                            \`<option value="auto" \${cfg.modelOverride === 'auto' ? 'selected' : ''}>Auto-Detect (\${escapeHtml(a.detectedModel.displayName)})</option>\`
                        ];
                        for (const [grpLabel, list] of [
                            ['Claude 5.5 · 200k', modelGroups.claude],
                            ['GPT-OSS · 128k', modelGroups['gpt-oss']],
                            ['Orchestrator · 1M (Plan/Exec)', modelGroups.orchestrator],
                            ['Gemini 3.8 / 4 · 1M', modelGroups.gemini]
                        ]) {
                            if (!list.length) continue;
                            modelOpts.push(\`<optgroup label="\${grpLabel}">\`);
                            for (const m of list) {
                                const sel = cfg.modelOverride === m.id ? 'selected' : '';
                                modelOpts.push(\`<option value="\${escapeHtml(m.id)}" \${sel}>\${escapeHtml(m.displayName)} (\${m.tierLabel})</option>\`);
                            }
                            modelOpts.push('</optgroup>');
                        }

                        const barPct = Math.min(100, Math.max(0, a.usedPct));
                        const attnLeftPct = Math.min(98, Math.max(2, (a.activeModel.attentionThreshold / a.activeModel.contextLimit) * 100));
                        const phaseCls = a.phase === 'PLANNING' ? 'plan' : (a.phase === 'EXECUTION' ? 'exec' : '');

                        const historyBreadcrumbs = (a.modelHistory || []).length > 1
                            ? \`<div style="font-size:10.5px;opacity:0.72;margin-bottom:8px">Switches: \${a.modelHistory.map(h => escapeHtml(h.displayName)).join(' → ')}</div>\`
                            : '';

                        const segColors = ['#e4e4e7', '#60a5fa', '#a1a1aa', '#d4d4d8', '#71717a', '#f4f4f5', '#52525b'];
                        const stackSegs = a.categories.map((c, idx) => {
                            if (c.pct <= 0) return '';
                            return \`<div title="\${escapeHtml(c.label)}: \${fmtFull(c.tokens)} (\${c.pct}%)" style="width:\${c.pct}%;background:\${segColors[idx % segColors.length]}"></div>\`;
                        }).join('');

                        const catRows = a.categories.map((c, idx) => \`
                            <div class="ag-ctx-cat-row">
                                <span class="ag-ctx-swatch" style="background:\${segColors[idx % segColors.length]}"></span>
                                <span>\${escapeHtml(c.label)}</span>
                                <span class="ag-ctx-cat-tok">\${fmtTok(c.tokens)}</span>
                                <span class="ag-ctx-cat-pct">\${c.pct}%</span>
                            </div>
                        \`).join('');

                        const tierHtml = (a.handoffMatrix || []).map((t) => {
                            const cls = t.status === 'OVERFLOW' ? 'overflow' : (t.status === 'WARN' ? 'warn' : '');
                            const badge = t.status === 'OVERFLOW' ? 'OVER' : t.status;
                            return \`
                                <div class="ag-ctx-tier \${cls}">
                                    <div class="ag-ctx-tier-name">\${escapeHtml(t.tierLabel)} · \${escapeHtml(t.key === 'gpt-oss' ? 'OSS' : (t.key === 'claude' ? 'Claude' : 'Gemini'))}</div>
                                    <div class="ag-ctx-tier-val">\${t.pct}% · \${badge}</div>
                                </div>
                            \`;
                        }).join('');

                        const subHtml = (a.subagents || []).length > 0
                            ? a.subagents.map((s) => \`
                                <div class="ag-ctx-sub-item">
                                    <span>\${escapeHtml(s.role)} <span style="opacity:0.6">(\${escapeHtml(s.typeName)})</span></span>
                                    <span style="font-family:ui-monospace,monospace">\${fmtTok(s.activeTokens)} isolated</span>
                                </div>
                            \`).join('')
                            : '<div style="font-size:11px;opacity:0.6;margin-bottom:8px">No spawned subagents in this session.</div>';

                        const alertHtml = a.handoffAlert
                            ? \`<div class="ag-ctx-alert \${escapeHtml(a.handoffAlert.severity)}">\${escapeHtml(a.handoffAlert.message)}</div>\`
                            : '';

                        const remainTxt = a.overflowTokens > 0
                            ? \`OVERFLOW +\${fmtFull(a.overflowTokens)}\`
                            : \`\${fmtFull(a.remainingTokens)} remaining\`;

                        drawer.innerHTML = \`
                            <div class="ag-ctx-head">
                                <div class="ag-ctx-head-left">
                                    <span class="ag-ctx-title">Context Window</span>
                                    <span class="ag-ctx-pill \${phaseCls}">\${escapeHtml(a.phase)}</span>
                                    <span class="ag-ctx-pill">\${shortcutHint}</span>
                                </div>
                                <button id="ag-ctx-refresh-btn" class="ag-ctx-icon-btn" type="button" title="Refresh Now">↺</button>
                            </div>

                            <div class="ag-ctx-controls">
                                <div class="ag-ctx-field">
                                    <label for="ag-ctx-conv-sel">Session</label>
                                    <select id="ag-ctx-conv-sel" class="ag-ctx-select">\${sessionOpts.join('')}</select>
                                </div>
                                <div class="ag-ctx-field">
                                    <label for="ag-ctx-model-sel">Model Ceiling</label>
                                    <select id="ag-ctx-model-sel" class="ag-ctx-select">\${modelOpts.join('')}</select>
                                </div>
                            </div>

                            <div class="ag-ctx-meter-card">
                                <div class="ag-ctx-meter-top">
                                    <span class="ag-ctx-big">\${fmtTok(a.activeTokens)} <span class="ag-ctx-sub">/ \${a.activeModel.tierLabel}</span></span>
                                    <span class="ag-ctx-sub">\${a.usedPct}% · \${a.zone}</span>
                                </div>
                                <div class="ag-ctx-bar-track">
                                    <div class="ag-ctx-bar-fill \${warnClass}" style="width:\${barPct}%"></div>
                                    <div class="ag-ctx-attn-tick" style="left:\${attnLeftPct}%" title="Optimal Focus Threshold (\${fmtTok(a.activeModel.attentionThreshold)})"></div>
                                </div>
                                <div class="ag-ctx-meter-foot">
                                    <span>\${remainTxt}</span>
                                    <span>Focus ≤ \${fmtTok(a.activeModel.attentionThreshold)} (\${a.attentionUsedPct}%)</span>
                                </div>
                            </div>

                            \${alertHtml}
                            \${historyBreadcrumbs}

                            <div class="ag-ctx-section-label">
                                <span>Cross-Model Handoff Matrix</span>
                                <span>\${a.handoffCount} switches</span>
                            </div>
                            <div class="ag-ctx-matrix">\${tierHtml}</div>

                            <div class="ag-ctx-section-label">
                                <span>Token Allocation Breakdown</span>
                                <span>\${a.plannerSteps} turns</span>
                            </div>
                            <div class="ag-ctx-stack">\${stackSegs}</div>
                            <div class="ag-ctx-cat-list">\${catRows}</div>

                            <div class="ag-ctx-section-label">
                                <span>Prompt Cache &amp; Runtime</span>
                                <span>\${a.rotatedWindow ? 'Rotated Log' : 'Full Log'}</span>
                            </div>
                            <div class="ag-ctx-kv-grid">
                                <div><div class="ag-ctx-kv-k">Cache Hit</div><div class="ag-ctx-kv-v">\${a.cacheHitRatePct}%</div></div>
                                <div><div class="ag-ctx-kv-k">Cached</div><div class="ag-ctx-kv-v">\${fmtTok(a.cacheReadTokens)}</div></div>
                                <div><div class="ag-ctx-kv-k">Fresh In</div><div class="ag-ctx-kv-v">\${fmtTok(a.inputTokens)}</div></div>
                                <div><div class="ag-ctx-kv-k">Misses</div><div class="ag-ctx-kv-v">\${a.cacheMissCount}</div></div>
                            </div>

                            <div class="ag-ctx-section-label">
                                <span>Isolated Subagents</span>
                                <span>\${fmtTok(a.offloadedTokens)} offloaded</span>
                            </div>
                            <div class="ag-ctx-sub-list">\${subHtml}</div>

                            <div class="ag-ctx-foot">
                                <button id="ag-ctx-copy-btn" class="ag-ctx-btn" type="button">Copy /compact Report</button>
                                <span style="font-size:10.5px;opacity:0.6;font-family:ui-monospace,monospace">\${escapeHtml(a.conversationId.slice(0, 8))}</span>
                            </div>
                        \`;

                        drawer.querySelector('#ag-ctx-refresh-btn')?.addEventListener('click', requestPoll);
                        drawer.querySelector('#ag-ctx-conv-sel')?.addEventListener('change', (e) => {
                            e.target.blur();
                            saveConfig({ selectedConvId: e.target.value });
                        });
                        drawer.querySelector('#ag-ctx-model-sel')?.addEventListener('change', (e) => {
                            e.target.blur();
                            saveConfig({ modelOverride: e.target.value });
                        });
                        drawer.querySelector('#ag-ctx-copy-btn')?.addEventListener('click', (e) => {
                            const summary = [
                                \`[Context Window Snapshot — \${a.activeModel.displayName} (\${a.activeModel.tierLabel})]\`,
                                \`Session: \${a.conversationId} | Phase: \${a.phase} | Usage: \${fmtFull(a.activeTokens)} / \${fmtFull(a.activeModel.contextLimit)} (\${a.usedPct}%)\`,
                                \`Cache: \${a.cacheHitRatePct}% hit (\${fmtFull(a.cacheReadTokens)} cached, \${fmtFull(a.inputTokens)} fresh, \${a.cacheMissCount} misses)\`,
                                \`Breakdown: \` + a.categories.map(c => \`\${c.shortLabel}=\${fmtTok(c.tokens)} (\${c.pct}%)\`).join(', '),
                                \`Offloaded Subagents: \${a.subagents.length} (\${fmtTok(a.offloadedTokens)} tok)\`
                            ].join('\\n');
                            navigator.clipboard?.writeText(summary).then(() => {
                                e.target.textContent = 'Copied ✓';
                                setTimeout(() => { e.target.textContent = 'Copy /compact Report'; }, 1600);
                            }).catch(() => {});
                        });
                    }

                    window.__agCtxReceive = (payload) => {
                        latestData = payload;
                        renderAll();
                    };

                    renderAll();

                    let mutScheduled = false;
                    const observer = new MutationObserver(() => {
                        if (mutScheduled) return;
                        mutScheduled = true;
                        requestAnimationFrame(() => {
                            mutScheduled = false;
                            attachUi();
                        });
                    });
                    if (document.body) {
                        observer.observe(document.body, { childList: true, subtree: true });
                    }

                    function placeDrawer() {
                        const rect = btn.getBoundingClientRect();
                        drawer.style.top = (rect.bottom + 6) + 'px';
                        drawer.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
                    }

                    function setDrawerOpen(next) {
                        const open = next !== undefined ? next : !drawer.classList.contains('open');
                        if (open) {
                            placeDrawer();
                            requestPoll();
                        }
                        drawer.classList.toggle('open', open);
                        btn.setAttribute('aria-expanded', String(open));
                    }

                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        setDrawerOpen();
                    });
                    drawer.addEventListener('click', (e) => e.stopPropagation());
                    document.addEventListener('click', (e) => {
                        if (drawer.classList.contains('open') && !drawer.contains(e.target) && !btn.contains(e.target)) {
                            setDrawerOpen(false);
                        }
                    });
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape' && drawer.classList.contains('open')) {
                            setDrawerOpen(false);
                            return;
                        }
                        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyC') {
                            e.preventDefault();
                            setDrawerOpen();
                        }
                    });
                    window.addEventListener('resize', () => {
                        if (drawer.classList.contains('open')) placeDrawer();
                    });

                    // Periodically inform main process only when renderer-detected conversation changes
                    let lastDetectedConvId = '';
                    setInterval(() => {
                        const id = detectRendererConvId();
                        if (id && id !== lastDetectedConvId) {
                            lastDetectedConvId = id;
                            requestPoll();
                        }
                    }, 2000);
                }

                let mounted = false;
                let bootTimer = null;
                let bootObserver = null;

                function tryBoot() {
                    if (mounted) return;
                    if (hasAppShell()) {
                        mounted = true;
                        if (bootTimer) clearInterval(bootTimer);
                        if (bootObserver) {
                            try { bootObserver.disconnect(); } catch (_) {}
                        }
                        mountUi();
                    }
                }

                tryBoot();
                if (!mounted) {
                    try {
                        bootObserver = new MutationObserver(tryBoot);
                        bootObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
                    } catch (_) {}
                    bootTimer = setInterval(tryBoot, 250);
                }
            })();`).catch((err) => console.error('Failed to inject Context Monitor runtime:', err));
            } catch (err) {
                console.error('Failed to initialize Context Monitor:', err);
            }
        });
    }
})(win);
/* END ANTIGRAVITY CONTEXT MONITOR */
