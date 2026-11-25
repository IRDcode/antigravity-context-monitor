/* ANTIGRAVITY CONTEXT MONITOR v2.0 */
((win) => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const LOCAL_ORIGIN_RE = /^https?:\/\/127\.0\.0\.1:\d+/i;
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
    const settingsStore = coreModule && typeof coreModule.createSettingsStore === 'function'
        ? coreModule.createSettingsStore({ fs, path, os })
        : null;

    function isLocalAppUrl(rawUrl) {
        return typeof rawUrl === 'string' && LOCAL_ORIGIN_RE.test(rawUrl);
    }

    /*
     * Renderer-side client. Serialized with Function.prototype.toString() and executed inside the
     * Antigravity window, so it must stay self-contained (no references to main-process scope).
     * The shared UI kit below is kept identical to sidecar/sidecars/panel/app.js.
     */
    function clientMain(initialPayload, SAVE_PREFIX, POLL_PREFIX) {
        if (window.__agContextMonitorMounted) return;
        window.__agContextMonitorMounted = true;

        let latestData = initialPayload;

        const SHARED_CSS = `
.cm-root {
  color-scheme: light;
  --cm-bg: var(--background, #f6f6f7);
  --cm-surface: var(--card, #fbfbfc);
  --cm-fg: var(--foreground, #1d1f21);
  --cm-fg2: var(--secondary-foreground, #3d4348);
  --cm-muted: var(--muted-foreground, #5d676f);
  --cm-faint: var(--placeholder, #8d959b);
  --cm-border: var(--card-border, var(--border, rgba(29, 31, 33, 0.14)));
  --cm-primary: var(--primary, #007acc);
  --cm-ok: #63984f;
  --cm-warn: #b89a1e;
  --cm-bad: var(--error, #cb3d3d);
  --cm-hover: color-mix(in srgb, var(--cm-fg) 5%, transparent);
  --cm-press: color-mix(in srgb, var(--cm-fg) 9%, transparent);
  --cm-fill: color-mix(in srgb, var(--cm-fg) 6%, transparent);
  --cm-field: color-mix(in srgb, var(--cm-fg) 4.5%, transparent);
  --cm-line: color-mix(in srgb, var(--cm-fg) 9%, transparent);
  --cm-ring: color-mix(in srgb, var(--cm-primary) 70%, transparent);
  --cm-pop: var(--cm-surface);
  --cm-shadow: 0 10px 28px rgba(20, 22, 25, 0.16), 0 1px 3px rgba(20, 22, 25, 0.1);
  --cm-font: var(--font-family, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif);
  --cm-mono: var(--editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace);
  font-family: var(--cm-font);
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-fg);
  direction: ltr;
  text-align: left;
}
.cm-root[data-theme="dark"] {
  color-scheme: dark;
  --cm-bg: var(--background, #18191b);
  --cm-surface: var(--card, #202124);
  --cm-fg: var(--foreground, #e6e7e9);
  --cm-fg2: var(--secondary-foreground, #c4c8cc);
  --cm-muted: var(--muted-foreground, #9aa1a7);
  --cm-faint: var(--placeholder, #6c7379);
  --cm-border: var(--card-border, var(--border, rgba(230, 231, 233, 0.14)));
  --cm-ok: #7aae66;
  --cm-warn: #cab43e;
  --cm-hover: color-mix(in srgb, var(--cm-fg) 6%, transparent);
  --cm-press: color-mix(in srgb, var(--cm-fg) 11%, transparent);
  --cm-fill: color-mix(in srgb, var(--cm-fg) 8%, transparent);
  --cm-field: color-mix(in srgb, var(--cm-fg) 6.5%, transparent);
  --cm-line: color-mix(in srgb, var(--cm-fg) 11%, transparent);
  --cm-pop: color-mix(in srgb, var(--cm-surface) 93%, var(--cm-fg));
  --cm-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4);
}
.cm-root *,
.cm-root *::before,
.cm-root *::after { box-sizing: border-box; }
.cm-root [hidden] { display: none !important; }
.cm-root button,
.cm-root input { font: inherit; color: inherit; }
.cm-root button { cursor: pointer; }
.cm-root :focus { outline: none; }
.cm-root :focus-visible { outline: 2px solid var(--cm-ring); outline-offset: 1px; }
.cm-root ::selection { background: color-mix(in srgb, var(--cm-primary) 30%, transparent); }
.cm-root * { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--cm-fg) 24%, transparent) transparent; }
.cm-num, .cm-mono { font-family: var(--cm-mono); font-variant-numeric: tabular-nums; }

/* Header */
.cm-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cm-head-l { display: flex; align-items: center; gap: 8px; min-width: 0; }
.cm-title { font-size: 12px; font-weight: 600; letter-spacing: 0.01em; color: var(--cm-fg); white-space: nowrap; }
.cm-pill {
  font-family: var(--cm-mono); font-size: 10px; font-weight: 500; line-height: 1;
  padding: 3px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--cm-muted); background: var(--cm-fill); white-space: nowrap;
}
.cm-pill.key { text-transform: none; }
.cm-sub { margin: 2px 0 10px; color: var(--cm-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-icon-btn {
  display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;
  padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--cm-muted);
  transition: background-color 0.12s ease, color 0.12s ease;
}
.cm-icon-btn:hover { background: var(--cm-hover); color: var(--cm-fg); }
.cm-icon-btn:active { background: var(--cm-press); }

/* Controls */
.cm-controls { display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 12px; }
.cm-field { min-width: 0; }
.cm-label-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 20px; margin-bottom: 3px; }
.cm-label { font-size: 10.5px; font-weight: 500; color: var(--cm-muted); letter-spacing: 0.02em; }
.cm-reset {
  padding: 1px 7px; border: 1px solid var(--cm-border); border-radius: 999px; background: transparent;
  font-size: 10px; line-height: 16px; color: var(--cm-fg2); white-space: nowrap;
  transition: background-color 0.12s ease;
}
.cm-reset:hover { background: var(--cm-hover); }

/* Combobox */
.cm-cb { position: relative; min-width: 0; }
.cm-cb-trigger {
  display: flex; align-items: center; gap: 6px; width: 100%; height: 28px; padding: 0 8px;
  border: 1px solid var(--cm-border); border-radius: 6px; background: var(--cm-field);
  color: var(--cm-fg); text-align: left; font-size: 11.5px;
  transition: background-color 0.12s ease, border-color 0.12s ease;
}
.cm-cb-trigger:hover { background: var(--cm-hover); }
.cm-cb-trigger[aria-expanded="true"] { background: var(--cm-fill); border-color: color-mix(in srgb, var(--cm-fg) 28%, transparent); }
.cm-cb-main { display: flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0; }
.cm-cb-val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cm-cb-badge {
  flex: none; padding: 1px 5px; border-radius: 3px; font-size: 9.5px; line-height: 14px; font-weight: 500;
  color: var(--cm-muted); background: var(--cm-fill); letter-spacing: 0.02em; white-space: nowrap;
}
.cm-cb-tag {
  flex: none; padding: 0 5px; border: 1px solid var(--cm-line); border-radius: 3px;
  font-family: var(--cm-mono); font-size: 9.5px; line-height: 14px; color: var(--cm-muted); white-space: nowrap;
}
.cm-cb-chev { flex: none; color: var(--cm-faint); transition: transform 0.12s ease; }
.cm-cb-trigger[aria-expanded="true"] .cm-cb-chev { transform: rotate(180deg); }
.cm-cb-pop {
  position: fixed; z-index: 20; display: flex; flex-direction: column; overflow: hidden;
  background: var(--cm-pop); border: 1px solid var(--cm-border); border-radius: 8px; box-shadow: var(--cm-shadow);
}
.cm-cb-search {
  flex: none; width: 100%; height: 30px; padding: 0 10px; border: 0; border-bottom: 1px solid var(--cm-line);
  background: transparent; font-size: 11.5px; border-radius: 0;
}
.cm-cb-search::placeholder { color: var(--cm-faint); }
.cm-cb-search:focus-visible { outline: none; box-shadow: inset 0 -1px 0 var(--cm-ring); }
.cm-cb-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 4px; overscroll-behavior: contain; }
.cm-cb-ghead { padding: 6px 8px 3px; font-size: 10px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--cm-faint); }
.cm-cb-opt {
  display: flex; align-items: center; gap: 8px; padding: 4px 8px 4px 6px; border-radius: 5px;
  font-size: 11.5px; cursor: default; color: var(--cm-fg);
}
.cm-cb-opt.cm-active { background: var(--cm-hover); }
.cm-cb-opt:active { background: var(--cm-press); }
.cm-cb-check { flex: none; width: 12px; height: 12px; color: var(--cm-fg); opacity: 0; }
.cm-cb-opt.cm-sel .cm-cb-check { opacity: 1; }
.cm-cb-otext { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 6px; flex: 1 1 auto; min-width: 0; }
.cm-cb-olabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.cm-cb-osub { flex-basis: 100%; font-family: var(--cm-mono); font-size: 10px; color: var(--cm-muted); font-variant-numeric: tabular-nums; }
.cm-cb-none { padding: 14px 8px; text-align: center; color: var(--cm-muted); font-size: 11px; }

/* Status dot */
.cm-dot { flex: none; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--cm-ok); }
.cm-dot.warn { background: var(--cm-warn); }
.cm-dot.bad { background: var(--cm-bad); }
.cm-dot.idle { background: var(--cm-faint); }

/* Meter */
.cm-meter { padding: 10px 10px 9px; border: 1px solid var(--cm-line); border-radius: 8px; background: var(--cm-field); }
.cm-meter-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.cm-big { font-family: var(--cm-mono); font-size: 19px; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
.cm-ceil { margin-left: 4px; font-family: var(--cm-mono); font-size: 12px; font-weight: 400; color: var(--cm-muted); }
.cm-status { display: inline-flex; align-items: center; gap: 6px; font-family: var(--cm-mono); font-size: 11px; color: var(--cm-fg2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.cm-track { position: relative; height: 8px; border-radius: 999px; background: var(--cm-fill); overflow: hidden; }
.cm-zone {
  position: absolute; top: 0; bottom: 0; right: 0;
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--cm-fg) 16%, transparent) 0 2px, transparent 2px 5px);
}
.cm-fill { position: absolute; top: 0; bottom: 0; left: 0; border-radius: 999px; background: var(--cm-fg); transition: width 0.18s ease, background-color 0.18s ease; }
.cm-fill.warn { background: var(--cm-warn); }
.cm-fill.bad { background: var(--cm-bad); }
.cm-tick { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--cm-surface); }
.cm-tick.compact { width: 2px; }
.cm-marks { display: flex; flex-wrap: wrap; gap: 2px 12px; margin-top: 7px; font-size: 10.5px; color: var(--cm-muted); }
.cm-mark { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.cm-mark b { font-family: var(--cm-mono); font-weight: 500; color: var(--cm-fg2); font-variant-numeric: tabular-nums; }
.cm-glyph { display: inline-block; width: 8px; height: 8px; flex: none; }
.cm-glyph.focus { border-left: 2px solid var(--cm-fg2); height: 9px; width: 2px; }
.cm-glyph.compact { background: repeating-linear-gradient(135deg, var(--cm-fg2) 0 1.5px, transparent 1.5px 3.5px); border: 1px solid var(--cm-faint); }
.cm-glyph.ceil { border-right: 2px solid var(--cm-faint); height: 9px; width: 2px; }
.cm-foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; font-family: var(--cm-mono); font-size: 10.5px; color: var(--cm-muted); font-variant-numeric: tabular-nums; }

/* Banners */
.cm-banners:not(:empty) { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.cm-banner {
  display: flex; flex-direction: column; gap: 1px; padding: 7px 9px; border-radius: 6px; font-size: 11px; line-height: 1.4;
  border: 1px solid var(--cm-line); border-left: 3px solid var(--cm-faint); background: var(--cm-field);
}
.cm-banner b { font-weight: 600; }
.cm-banner span { color: var(--cm-muted); font-family: var(--cm-mono); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.cm-banner.warn { border-left-color: var(--cm-warn); background: color-mix(in srgb, var(--cm-warn) 9%, transparent); }
.cm-banner.danger { border-left-color: var(--cm-bad); background: color-mix(in srgb, var(--cm-bad) 9%, transparent); }
.cm-note { margin-top: 8px; font-size: 10.5px; color: var(--cm-muted); }

/* Sections */
.cm-sec { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--cm-line); }
.cm-sec-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; }
.cm-sec-t { font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--cm-muted); }
.cm-sec-m { font-family: var(--cm-mono); font-size: 10.5px; color: var(--cm-muted); font-variant-numeric: tabular-nums; }
.cm-empty { margin-top: 14px; padding: 16px 8px; text-align: center; color: var(--cm-muted); border-top: 1px solid var(--cm-line); }
.cm-line { font-size: 11px; color: var(--cm-fg2); }
.cm-line .cm-num { color: var(--cm-fg); }
.cm-hist { margin-top: 6px; }
.cm-hist > summary, .cm-settings > summary {
  list-style: none; display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;
  font-size: 11px; color: var(--cm-muted); border-radius: 4px;
}
.cm-hist > summary::-webkit-details-marker, .cm-settings > summary::-webkit-details-marker { display: none; }
.cm-hist > summary::before, .cm-settings > summary::before {
  content: ""; width: 5px; height: 5px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg); transition: transform 0.12s ease; margin: 0 2px 0 1px;
}
.cm-hist[open] > summary::before, .cm-settings[open] > summary::before { transform: rotate(45deg); }
.cm-hist > summary:hover, .cm-settings > summary:hover { color: var(--cm-fg); }
.cm-hist-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.cm-hist-list li { display: flex; justify-content: space-between; gap: 8px; font-family: var(--cm-mono); font-size: 10.5px; color: var(--cm-fg2); font-variant-numeric: tabular-nums; }
.cm-hist-list li span:last-child { color: var(--cm-muted); }

/* Handoff matrix */
.cm-matrix { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.cm-tile { padding: 6px 8px; border: 1px solid var(--cm-line); border-radius: 6px; background: var(--cm-field); font-family: var(--cm-mono); font-variant-numeric: tabular-nums; min-width: 0; }
.cm-tile-n { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--cm-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-tile-v { margin-top: 2px; font-size: 11px; font-weight: 500; white-space: nowrap; }
.cm-tile.warn .cm-tile-v { color: color-mix(in srgb, var(--cm-warn) 55%, var(--cm-fg)); }
.cm-tile.over .cm-tile-v { color: color-mix(in srgb, var(--cm-bad) 70%, var(--cm-fg)); }

/* Breakdown: monochrome luminance ramp, alternating hatch for non-colour separation */
.cm-stack { display: flex; gap: 1px; height: 8px; border-radius: 999px; overflow: hidden; background: var(--cm-fill); margin-bottom: 8px; }
.cm-seg { display: block; height: 100%; min-width: 2px; }
.cm-s0 { background: color-mix(in srgb, var(--cm-fg) 92%, transparent); }
.cm-s1 { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--cm-fg) 74%, transparent) 0 2px, color-mix(in srgb, var(--cm-fg) 28%, transparent) 2px 4px); }
.cm-s2 { background: color-mix(in srgb, var(--cm-fg) 62%, transparent); }
.cm-s3 { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--cm-fg) 56%, transparent) 0 2px, color-mix(in srgb, var(--cm-fg) 16%, transparent) 2px 4px); }
.cm-s4 { background: color-mix(in srgb, var(--cm-fg) 42%, transparent); }
.cm-s5 { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--cm-fg) 38%, transparent) 0 2px, color-mix(in srgb, var(--cm-fg) 10%, transparent) 2px 4px); }
.cm-s6 { background: color-mix(in srgb, var(--cm-fg) 24%, transparent); }
.cm-cats { display: flex; flex-direction: column; gap: 4px; }
.cm-cat { display: grid; grid-template-columns: 10px 1fr auto 40px; align-items: center; gap: 8px; font-size: 11px; }
.cm-cat > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-sw { width: 10px; height: 10px; border-radius: 2px; box-shadow: inset 0 0 0 1px var(--cm-line); }
.cm-cat .cm-num { font-size: 10.5px; text-align: right; }
.cm-dim { color: var(--cm-muted); }

/* Cache + runtime */
.cm-kv { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 10px; }
.cm-kv-k { font-size: 10px; color: var(--cm-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.cm-kv-v { margin-top: 1px; font-family: var(--cm-mono); font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }

/* Subagents */
.cm-subs { display: flex; flex-direction: column; gap: 4px; }
.cm-sub-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 5px 0; font-size: 11px; border-bottom: 1px solid var(--cm-line); }
.cm-sub-row:last-child { border-bottom: 0; }
.cm-sub-row > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-sub-row .cm-dim { margin-left: 4px; }
.cm-sub-row .cm-num { font-size: 10.5px; color: var(--cm-fg2); white-space: nowrap; }

/* Settings */
.cm-settings { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--cm-line); }
.cm-settings > summary { font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.cm-set-body { display: flex; flex-direction: column; gap: 12px; padding-top: 10px; }
.cm-set-row { display: flex; flex-direction: column; gap: 5px; }
.cm-set-l { display: flex; justify-content: space-between; font-size: 11px; color: var(--cm-fg2); }
.cm-set-l output { font-family: var(--cm-mono); color: var(--cm-fg); font-variant-numeric: tabular-nums; }
.cm-range { width: 100%; margin: 0; accent-color: var(--cm-fg2); height: 16px; }
.cm-input {
  width: 100%; min-width: 0; height: 26px; padding: 0 8px; border: 1px solid var(--cm-border); border-radius: 5px;
  background: var(--cm-field); font-size: 11px; font-family: var(--cm-mono);
}
.cm-input::placeholder { color: var(--cm-faint); }
.cm-input:focus-visible { outline-offset: 0; border-color: var(--cm-ring); }
.cm-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.cm-row-act { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cm-msg { font-size: 10.5px; color: var(--cm-muted); }
.cm-msg.err { color: color-mix(in srgb, var(--cm-bad) 75%, var(--cm-fg)); }
.cm-cc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.cm-cc-list li { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--cm-line); }
.cm-cc-list li:last-child { border-bottom: 0; }
.cm-cc-item { flex: 1 1 auto; min-width: 0; display: flex; justify-content: space-between; gap: 8px; padding: 5px 4px; border: 0; background: transparent; border-radius: 4px; text-align: left; font-size: 11px; }
.cm-cc-item:hover { background: var(--cm-hover); }
.cm-cc-item span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-cc-item .cm-num { color: var(--cm-muted); font-size: 10.5px; white-space: nowrap; }

/* Buttons + footer */
.cm-btn {
  height: 26px; padding: 0 10px; border: 1px solid var(--cm-border); border-radius: 6px; background: var(--cm-field);
  font-size: 11px; font-weight: 500; color: var(--cm-fg); transition: background-color 0.12s ease;
}
.cm-btn:hover:not(:disabled) { background: var(--cm-hover); }
.cm-btn:active:not(:disabled) { background: var(--cm-press); }
.cm-btn:disabled { opacity: 0.45; cursor: default; }
.cm-btn.ghost { background: transparent; }
.cm-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--cm-line); }
.cm-sid { font-family: var(--cm-mono); font-size: 10.5px; color: var(--cm-faint); }

@media (min-width: 600px) {
  .cm-controls { grid-template-columns: 1fr 1fr; gap: 10px; }
}
@media (max-width: 420px) {
  .cm-kv { grid-template-columns: repeat(2, 1fr); }
  .cm-row2 { grid-template-columns: 1fr; }
  .cm-cat { grid-template-columns: 10px 1fr auto 38px; gap: 6px; }
}
@media (prefers-reduced-motion: reduce) {
  .cm-root *, .cm-root *::before, .cm-root *::after { transition: none !important; animation: none !important; }
}

@media (max-width: 300px) {
  .cm-matrix { grid-template-columns: 1fr; }
}
`;
        const TITLEBAR_CSS = `
#ag-ctx-toolbar-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  -webkit-app-region: no-drag;
}
#ag-ctx-toolbar-wrap.ag-ctx-floating {
  position: fixed;
  top: 8px;
  right: 150px;
  z-index: 999997;
}
#ag-ctx-toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 9px;
  border-radius: 6px;
  border: 1px solid var(--cm-border);
  background: transparent;
  color: var(--cm-fg2);
  font-family: var(--cm-mono);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  user-select: none;
  -webkit-app-region: no-drag;
  transition: background-color 0.14s ease, color 0.14s ease;
}
#ag-ctx-toolbar-btn:hover { background: var(--cm-hover); color: var(--cm-fg); }
#ag-ctx-toolbar-btn[aria-expanded="true"] { background: var(--cm-fill); color: var(--cm-fg); }
#ag-ctx-drawer {
  position: fixed;
  z-index: 999998;
  width: 380px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 56px);
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px;
  border-radius: 10px;
  background: var(--cm-surface);
  color: var(--cm-fg);
  border: 1px solid var(--cm-border);
  box-shadow: var(--cm-shadow);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px) scale(0.98);
  transform-origin: top right;
  pointer-events: none;
  transition: opacity 0.14s ease, transform 0.14s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s linear 0.14s;
}
#ag-ctx-drawer.open {
  opacity: 1;
  visibility: visible;
  transform: none;
  pointer-events: auto;
  transition-delay: 0s;
}
#ag-ctx-drawer .cm-controls {
  grid-template-columns: 1fr;
  gap: 8px;
}
`;

        const CM_SAFE_MODEL_RE = /^[A-Za-z0-9 ._\u00B7()/-]{1,96}$/;
        const CM_ZONE_LABEL = { OPTIMAL: 'Optimal', ATTENTION_WARN: 'Attention', CRITICAL: 'Critical', OVERFLOW: 'Overflow' };
        const CM_SOURCE_LABEL = { custom: 'custom', observed_session: 'observed', observed_history: 'observed (history)', default: 'default' };
        const CM_FAMILY_GROUPS = [
          ['claude', 'Claude'],
          ['gemini', 'Gemini'],
          ['gpt-oss', 'GPT-OSS'],
          ['orchestrator', 'Orchestrator (Plan / Exec)'],
          ['custom', 'Custom']
        ];

        function cmEsc(s) {
          return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }

        function cmFmtTok(n) {
          const v = Number(n) || 0;
          if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
          if (v >= 10000) return (v / 1000).toFixed(0) + 'k';
          if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
          return String(Math.round(v));
        }

        function cmFmtFull(n) {
          return (Number(n) || 0).toLocaleString('en-US');
        }

        function cmFmtInput(n) {
          const v = Number(n) || 0;
          if (v >= 1000000 && v % 1000000 === 0) return (v / 1000000) + 'M';
          if (v >= 1000 && v % 1000 === 0) return (v / 1000) + 'k';
          return String(v);
        }

        function cmParseTokens(raw) {
          const m = /^\s*([0-9][0-9,_]*(?:\.[0-9]+)?)\s*([kKmM]?)\s*$/.exec(String(raw == null ? '' : raw));
          if (!m) return null;
          const base = Number(m[1].replace(/[,_]/g, ''));
          if (!Number.isFinite(base)) return null;
          const mult = m[2] ? (m[2].toLowerCase() === 'm' ? 1000000 : 1000) : 1;
          const n = Math.round(base * mult);
          return Number.isInteger(n) ? n : null;
        }

        function cmClamp(v, lo, hi) {
          return Math.min(hi, Math.max(lo, Number(v) || 0));
        }

        function cmSetHtml(el, html) {
          if (!el || el.__cmHtml === html) return;
          el.__cmHtml = html;
          el.innerHTML = html;
        }

        function cmSetText(el, text) {
          if (el && el.textContent !== text) el.textContent = text;
        }

        /* ---- Theme: mirror the host's light/dark scheme (from --background luminance) ---- */
        function cmDetectScheme() {
          try {
            const raw = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
            if (raw) {
              const canvas = document.createElement('canvas');
              canvas.width = 1;
              canvas.height = 1;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              const read = (seed) => {
                ctx.clearRect(0, 0, 1, 1);
                ctx.fillStyle = seed;
                ctx.fillStyle = raw;
                ctx.fillRect(0, 0, 1, 1);
                return Array.from(ctx.getImageData(0, 0, 1, 1).data);
              };
              const a = read('#000000');
              const b = read('#ffffff');
              if (a.join() === b.join()) {
                const lum = (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]) / 255;
                return lum < 0.5 ? 'dark' : 'light';
              }
            }
          } catch (_) {}
          try {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
          } catch (_) {
            return 'dark';
          }
        }

        function cmWatchScheme(getTargets) {
          const apply = () => {
            const theme = cmDetectScheme();
            for (const el of getTargets()) {
              if (!el) continue;
              if (el.dataset.theme !== theme) el.dataset.theme = theme;
              if (el.style.colorScheme !== theme) el.style.colorScheme = theme;
            }
          };
          let queued = false;
          const schedule = () => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => { queued = false; apply(); });
          };
          apply();
          try {
            new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
          } catch (_) {}
          try {
            const mq = window.matchMedia('(prefers-color-scheme: light)');
            if (mq.addEventListener) mq.addEventListener('change', schedule);
          } catch (_) {}
          return apply;
        }

        /* ---- Accessible custom combobox (replaces native select) ---- */
        let cmCbSeq = 0;
        let cmCbOpen = null;

        function createCombobox(host, cfg) {
          const uid = 'cm-cb' + (++cmCbSeq);
          host.classList.add('cm-cb');
          host.innerHTML =
            '<button type="button" class="cm-cb-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + uid + '-list"' +
              (cfg.labelId ? ' aria-labelledby="' + cfg.labelId + ' ' + uid + '-val"' : ' aria-label="' + cmEsc(cfg.ariaLabel || '') + '"') + '>' +
              '<span class="cm-cb-main"><span class="cm-cb-val" id="' + uid + '-val"></span><span class="cm-cb-badge" hidden></span></span>' +
              '<span class="cm-cb-tag" hidden></span>' +
              '<svg class="cm-cb-chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</button>' +
            '<div class="cm-cb-pop" hidden>' +
              '<input class="cm-cb-search" type="text" role="searchbox" autocomplete="off" spellcheck="false" aria-label="' + cmEsc(cfg.filterLabel || 'Filter') + '" aria-controls="' + uid + '-list" placeholder="' + cmEsc(cfg.filterPlaceholder || 'Filter\u2026') + '">' +
              '<div class="cm-cb-list" id="' + uid + '-list" role="listbox" aria-label="' + cmEsc(cfg.ariaLabel || '') + '"></div>' +
            '</div>';

          const trigger = host.querySelector('.cm-cb-trigger');
          const valEl = host.querySelector('.cm-cb-val');
          const badgeEl = host.querySelector('.cm-cb-main .cm-cb-badge');
          const tagEl = host.querySelector('.cm-cb-trigger > .cm-cb-tag');
          const pop = host.querySelector('.cm-cb-pop');
          const input = host.querySelector('.cm-cb-search');
          const list = host.querySelector('.cm-cb-list');

          let options = [];
          let value = null;
          let shown = [];
          let activeIdx = -1;
          let query = '';
          let isOpen = false;
          let sig = '';

          function matches(o) {
            if (!query) return true;
            const hay = [o.label, o.sub, o.tag, o.badge, o.group].join(' ').toLowerCase();
            return query.split(/\s+/).every((t) => hay.indexOf(t) !== -1);
          }

          function optionEls() {
            return list.querySelectorAll('.cm-cb-opt');
          }

          function syncActiveAttr() {
            const id = activeIdx >= 0 && activeIdx < shown.length ? uid + '-o' + activeIdx : '';
            for (const el of [input, trigger]) {
              if (id) el.setAttribute('aria-activedescendant', id);
              else el.removeAttribute('aria-activedescendant');
            }
          }

          function renderList() {
            shown = options.filter(matches);
            if (activeIdx >= shown.length) activeIdx = shown.length - 1;
            let html = '';
            let group = null;
            shown.forEach((o, i) => {
              const g = o.group || '';
              if (g !== group) {
                if (group) html += '</div>';
                if (g) html += '<div role="group" aria-label="' + cmEsc(g) + '"><div class="cm-cb-ghead" role="presentation">' + cmEsc(g) + '</div>';
                group = g;
              }
              const selected = o.value === value;
              html += '<div class="cm-cb-opt' + (i === activeIdx ? ' cm-active' : '') + (selected ? ' cm-sel' : '') + '" role="option" id="' + uid + '-o' + i + '" aria-selected="' + selected + '" data-i="' + i + '">' +
                '<svg class="cm-cb-check" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.4 5 8.8 9.6 3.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                (o.tone ? '<i class="cm-dot ' + cmEsc(o.tone) + '"></i>' : '') +
                '<span class="cm-cb-otext"><span class="cm-cb-olabel">' + cmEsc(o.label) + '</span>' +
                (o.badge ? '<span class="cm-cb-badge">' + cmEsc(o.badge) + '</span>' : '') +
                (o.sub ? '<span class="cm-cb-osub">' + cmEsc(o.sub) + '</span>' : '') + '</span>' +
                (o.tag ? '<span class="cm-cb-tag">' + cmEsc(o.tag) + '</span>' : '') +
                '</div>';
            });
            if (group) html += '</div>';
            if (!shown.length) html = '<div class="cm-cb-none">No matches</div>';
            const prevScroll = list.scrollTop;
            list.innerHTML = html;
            list.scrollTop = prevScroll;
            syncActiveAttr();
          }

          function position() {
            const r = trigger.getBoundingClientRect();
            const vw = document.documentElement.clientWidth || window.innerWidth;
            const vh = document.documentElement.clientHeight || window.innerHeight;
            const width = Math.min(Math.max(r.width, 288), vw - 16);
            const left = cmClamp(r.left, 8, Math.max(8, vw - width - 8));
            const below = vh - r.bottom - 10;
            const above = r.top - 10;
            const placeBelow = below >= 220 || below >= above;
            const room = Math.max(120, placeBelow ? below : above);
            pop.style.width = width + 'px';
            pop.style.left = left + 'px';
            pop.style.maxHeight = Math.min(380, room) + 'px';
            if (placeBelow) {
              pop.style.top = (r.bottom + 4) + 'px';
              pop.style.bottom = 'auto';
            } else {
              pop.style.top = 'auto';
              pop.style.bottom = (vh - r.top + 4) + 'px';
            }
          }

          function setActive(i, scroll) {
            if (!shown.length) { activeIdx = -1; syncActiveAttr(); return; }
            const next = cmClamp(i, 0, shown.length - 1);
            const els = optionEls();
            if (activeIdx >= 0 && els[activeIdx]) els[activeIdx].classList.remove('cm-active');
            activeIdx = next;
            const el = els[activeIdx];
            if (el) {
              el.classList.add('cm-active');
              if (scroll !== false) el.scrollIntoView({ block: 'nearest' });
            }
            syncActiveAttr();
          }

          function onDocPointerDown(e) {
            if (!host.contains(e.target)) close(false);
          }
          function onReposition(e) {
            if (e && e.target && e.target.nodeType === 1 && list.contains(e.target)) return;
            if (isOpen) position();
          }

          function open() {
            if (isOpen) return;
            if (cmCbOpen && cmCbOpen !== api) cmCbOpen.close(false);
            isOpen = true;
            cmCbOpen = api;
            query = '';
            input.value = '';
            pop.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
            const idx = options.findIndex((o) => o.value === value);
            activeIdx = idx >= 0 ? idx : 0;
            renderList();
            position();
            input.focus({ preventScroll: true });
            const el = optionEls()[activeIdx];
            if (el) el.scrollIntoView({ block: 'nearest' });
            document.addEventListener('pointerdown', onDocPointerDown, true);
            window.addEventListener('resize', onReposition);
            window.addEventListener('scroll', onReposition, true);
            if (cfg.onOpen) cfg.onOpen();
          }

          function close(refocus) {
            if (!isOpen) return;
            isOpen = false;
            if (cmCbOpen === api) cmCbOpen = null;
            pop.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
            syncActiveAttr();
            document.removeEventListener('pointerdown', onDocPointerDown, true);
            window.removeEventListener('resize', onReposition);
            window.removeEventListener('scroll', onReposition, true);
            if (refocus) trigger.focus({ preventScroll: true });
          }

          function choose(i) {
            const o = shown[i];
            if (!o) return;
            close(true);
            if (o.value !== value && cfg.onSelect) cfg.onSelect(o.value, o);
          }

          function onKey(e) {
            const k = e.key;
            if (!isOpen) {
              if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') {
                e.preventDefault();
                open();
              }
              return;
            }
            switch (k) {
              case 'ArrowDown': setActive(activeIdx + 1); break;
              case 'ArrowUp': setActive(activeIdx < 0 ? shown.length - 1 : activeIdx - 1); break;
              case 'PageDown': setActive(activeIdx + 8); break;
              case 'PageUp': setActive(activeIdx - 8); break;
              case 'Home': setActive(0); break;
              case 'End': setActive(shown.length - 1); break;
              case 'Enter':
                e.preventDefault();
                if (activeIdx >= 0) choose(activeIdx);
                return;
              case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                close(true);
                return;
              case 'Tab':
                close(false);
                return;
              default:
                return;
            }
            e.preventDefault();
          }

          trigger.addEventListener('click', () => { if (isOpen) close(true); else open(); });
          trigger.addEventListener('keydown', onKey);
          input.addEventListener('keydown', onKey);
          input.addEventListener('input', () => {
            query = input.value.trim().toLowerCase();
            shown = options.filter(matches);
            activeIdx = shown.length ? 0 : -1;
            renderList();
            list.scrollTop = 0;
          });
          list.addEventListener('mousedown', (e) => e.preventDefault());
          list.addEventListener('click', (e) => {
            const el = e.target.closest ? e.target.closest('.cm-cb-opt') : null;
            if (el) choose(Number(el.getAttribute('data-i')));
          });
          list.addEventListener('mousemove', (e) => {
            const el = e.target.closest ? e.target.closest('.cm-cb-opt') : null;
            if (!el) return;
            const i = Number(el.getAttribute('data-i'));
            if (i !== activeIdx) setActive(i, false);
          });

          const api = {
            close,
            isOpen: () => isOpen,
            setState(nextOptions, nextValue, display) {
              const nextSig = JSON.stringify([nextOptions, nextValue, display]);
              if (nextSig === sig) return;
              sig = nextSig;
              const keep = isOpen && activeIdx >= 0 && shown[activeIdx] ? shown[activeIdx].value : null;
              options = nextOptions;
              value = nextValue;
              cmSetText(valEl, display.label || '');
              trigger.title = display.label || '';
              badgeEl.hidden = !display.badge;
              cmSetText(badgeEl, display.badge || '');
              tagEl.hidden = !display.tag;
              cmSetText(tagEl, display.tag || '');
              if (isOpen) {
                shown = options.filter(matches);
                const idx = keep === null ? -1 : shown.findIndex((o) => o.value === keep);
                activeIdx = idx >= 0 ? idx : (shown.length ? 0 : -1);
                renderList();
              }
            }
          };
          return api;
        }

        /* ---- Shared monitor view (identical in Titlebar drawer and Sidecar pane) ---- */
        function createMonitorView(root, io) {
          root.classList.add('cm-root');
          root.innerHTML =
            '<div class="cm-head">' +
              '<div class="cm-head-l"><span class="cm-title">Context Window</span><span class="cm-pill" data-r="phase">\u2013</span>' + (io.headExtra || '') + '</div>' +
              '<button type="button" class="cm-icon-btn" data-r="refresh" title="Refresh telemetry" aria-label="Refresh telemetry">' +
                '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
              '</button>' +
            '</div>' +
            '<p class="cm-sub" data-r="sub">Connecting to transcript telemetry\u2026</p>' +
            '<div class="cm-controls">' +
              '<div class="cm-field"><div class="cm-label-row"><span class="cm-label" id="cm-lbl-session">Session</span><button type="button" class="cm-reset" data-r="reset-session" hidden>Reset to Live</button></div><div data-r="cb-session"></div></div>' +
              '<div class="cm-field"><div class="cm-label-row"><span class="cm-label" id="cm-lbl-model">Model Ceiling</span><button type="button" class="cm-reset" data-r="reset-model" hidden>Reset to Auto</button></div><div data-r="cb-model"></div></div>' +
            '</div>' +
            '<div class="cm-meter">' +
              '<div class="cm-meter-top"><span><span class="cm-big" data-r="used">0</span><span class="cm-ceil" data-r="ceil"></span></span><span class="cm-status"><i class="cm-dot idle" data-r="dot"></i><span data-r="status">\u2013</span></span></div>' +
              '<div class="cm-track" role="progressbar" aria-label="Context window usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-r="track">' +
                '<div class="cm-zone" data-r="zone"></div><div class="cm-fill" data-r="fill" style="width:0%"></div>' +
                '<i class="cm-tick" data-r="tick-focus"></i><i class="cm-tick compact" data-r="tick-compact"></i>' +
              '</div>' +
              '<div class="cm-marks">' +
                '<span class="cm-mark" title="Optimal focus budget"><i class="cm-glyph focus"></i>Focus <b data-r="m-focus">\u2013</b></span>' +
                '<span class="cm-mark" title="Auto-compact threshold"><i class="cm-glyph compact"></i>Compact <b data-r="m-compact">\u2013</b></span>' +
                '<span class="cm-mark" title="Model hard ceiling"><i class="cm-glyph ceil"></i>Ceiling <b data-r="m-ceil">\u2013</b></span>' +
              '</div>' +
              '<div class="cm-foot"><span data-r="remaining">\u2013</span><span data-r="compact-foot">\u2013</span></div>' +
            '</div>' +
            '<div class="cm-banners" data-r="banners" role="status"></div>' +
            '<div class="cm-note" data-r="switches" hidden></div>' +
            '<div class="cm-empty" data-r="empty" hidden></div>' +
            '<div data-r="telemetry">' +
              '<section class="cm-sec"><div class="cm-sec-h"><span class="cm-sec-t">Compaction</span><span class="cm-sec-m" data-r="compacts">Compacts: 0</span></div>' +
                '<div class="cm-line" data-r="compact-line"></div>' +
                '<details class="cm-hist" data-r="hist" hidden><summary data-r="hist-sum">History</summary><ol class="cm-hist-list" data-r="hist-list"></ol></details>' +
              '</section>' +
              '<section class="cm-sec"><div class="cm-sec-h"><span class="cm-sec-t">Cross-Model Handoff Matrix</span><span class="cm-sec-m" data-r="handoffs">0 switches</span></div><div class="cm-matrix" data-r="matrix"></div></section>' +
              '<section class="cm-sec"><div class="cm-sec-h"><span class="cm-sec-t">Token Allocation Breakdown</span><span class="cm-sec-m" data-r="turns">0 turns</span></div><div class="cm-stack" data-r="stack"></div><div class="cm-cats" data-r="cats"></div></section>' +
              '<section class="cm-sec"><div class="cm-sec-h"><span class="cm-sec-t">Prompt Cache &amp; Runtime</span><span class="cm-sec-m" data-r="logmode">Full Log</span></div>' +
                '<div class="cm-kv">' +
                  '<div><div class="cm-kv-k">Cache Hit</div><div class="cm-kv-v" data-r="kv-hit">\u2013</div></div>' +
                  '<div><div class="cm-kv-k">Cached</div><div class="cm-kv-v" data-r="kv-cached">\u2013</div></div>' +
                  '<div><div class="cm-kv-k">Fresh In</div><div class="cm-kv-v" data-r="kv-fresh">\u2013</div></div>' +
                  '<div><div class="cm-kv-k">Misses</div><div class="cm-kv-v" data-r="kv-misses">\u2013</div></div>' +
                  '<div><div class="cm-kv-k">Compacts</div><div class="cm-kv-v" data-r="kv-compacts">\u2013</div></div>' +
                  '<div><div class="cm-kv-k">Rewinds</div><div class="cm-kv-v" data-r="kv-rewinds">\u2013</div></div>' +
                '</div>' +
              '</section>' +
              '<section class="cm-sec"><div class="cm-sec-h"><span class="cm-sec-t">Isolated Subagents</span><span class="cm-sec-m" data-r="offloaded">0 offloaded</span></div><div class="cm-subs" data-r="subs"></div></section>' +
            '</div>' +
            '<details class="cm-settings" data-r="settings"><summary>Settings</summary><div class="cm-set-body">' +
              '<div class="cm-set-row"><div class="cm-set-l"><label for="cm-warn-range">Warn before auto-compact</label><output for="cm-warn-range" data-r="warn-out">70%</output></div>' +
                '<input type="range" id="cm-warn-range" class="cm-range" min="30" max="95" step="1" value="70" data-r="warn-range"></div>' +
              '<div class="cm-set-row"><div class="cm-set-l"><span id="cm-cc-title">Custom ceiling override</span></div>' +
                '<input type="text" class="cm-input" data-r="cc-model" maxlength="96" spellcheck="false" autocomplete="off" aria-label="Model id or name" placeholder="Model id or name">' +
                '<div class="cm-row2"><input type="text" class="cm-input" data-r="cc-ctx" spellcheck="false" autocomplete="off" aria-label="Context limit in tokens" placeholder="Context limit (e.g. 200k)">' +
                '<input type="text" class="cm-input" data-r="cc-cmp" spellcheck="false" autocomplete="off" aria-label="Auto-compact threshold in tokens, optional" placeholder="Compact at (optional)"></div>' +
                '<div class="cm-row-act"><button type="button" class="cm-btn" data-r="cc-save">Save</button><button type="button" class="cm-btn ghost" data-r="cc-remove" hidden>Remove</button><span class="cm-msg" data-r="cc-msg" role="status"></span></div>' +
                '<ul class="cm-cc-list" data-r="cc-list"></ul>' +
              '</div>' +
            '</div></details>' +
            '<div class="cm-actions"><button type="button" class="cm-btn" data-r="copy" disabled>Copy /compact Summary</button><span class="cm-sid" data-r="sid"></span></div>';

          const $ = (name) => root.querySelector('[data-r="' + name + '"]');
          const el = {};
          for (const n of ['phase', 'sub', 'reset-session', 'reset-model', 'used', 'ceil', 'dot', 'status', 'track', 'zone', 'fill', 'tick-focus', 'tick-compact',
            'm-focus', 'm-compact', 'm-ceil', 'remaining', 'compact-foot', 'banners', 'switches', 'empty', 'telemetry', 'compacts', 'compact-line', 'hist',
            'hist-sum', 'hist-list', 'handoffs', 'matrix', 'turns', 'stack', 'cats', 'logmode', 'kv-hit', 'kv-cached', 'kv-fresh', 'kv-misses', 'kv-compacts',
            'kv-rewinds', 'offloaded', 'subs', 'warn-range', 'warn-out', 'cc-model', 'cc-ctx', 'cc-cmp', 'cc-save', 'cc-remove', 'cc-msg', 'cc-list', 'copy', 'sid', 'refresh']) {
            el[n] = $(n);
          }

          let data = null;
          let ccDirty = false;

          function patch(p) {
            if (data) {
              data = Object.assign({}, data, { config: Object.assign({}, data.config || {}, p) });
              render();
            }
            io.saveConfig(p);
          }

          const cbSession = createCombobox($('cb-session'), {
            labelId: 'cm-lbl-session',
            filterLabel: 'Filter sessions',
            filterPlaceholder: 'Filter sessions\u2026',
            ariaLabel: 'Session',
            onSelect: (v) => patch({ selectedConvId: v })
          });
          const cbModel = createCombobox($('cb-model'), {
            labelId: 'cm-lbl-model',
            filterLabel: 'Filter models',
            filterPlaceholder: 'Filter models\u2026',
            ariaLabel: 'Model Ceiling',
            onSelect: (v) => patch({ modelOverride: v })
          });

          el.refresh.addEventListener('click', () => io.refresh());
          el['reset-session'].addEventListener('click', () => patch({ selectedConvId: 'auto' }));
          el['reset-model'].addEventListener('click', () => patch({ modelOverride: 'auto' }));
          root.addEventListener('keydown', (e) => {
            if (e.target && e.target.tagName === 'INPUT' && !e.altKey) e.stopPropagation();
          });

          el.copy.addEventListener('click', () => {
            const summary = data && data.analysis ? data.analysis.compactSummary : '';
            if (!summary) return;
            const done = () => {
              el.copy.textContent = 'Copied \u2713';
              setTimeout(() => { el.copy.textContent = 'Copy /compact Summary'; }, 1600);
            };
            const legacy = () => {
              try {
                const ta = document.createElement('textarea');
                ta.value = summary;
                ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                ta.remove();
                if (ok) done();
              } catch (_) {}
            };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(summary).then(done).catch(legacy);
            else legacy();
          });

          el['warn-range'].addEventListener('input', () => cmSetText(el['warn-out'], el['warn-range'].value + '%'));
          el['warn-range'].addEventListener('change', () => patch({ compactWarnPct: Number(el['warn-range'].value) }));

          /* Custom ceiling override editor (always persists the FULL customModels map) */
          function ccMessage(text, isErr) {
            el['cc-msg'].textContent = text;
            el['cc-msg'].classList.toggle('err', Boolean(isErr));
          }
          function customMap() {
            return Object.assign({}, (data && data.config && data.config.customModels) || {});
          }
          for (const n of ['cc-model', 'cc-ctx', 'cc-cmp']) {
            el[n].addEventListener('input', () => {
              ccDirty = true;
              ccMessage('');
              refreshCcRemove();
            });
          }
          function refreshCcRemove() {
            el['cc-remove'].hidden = !Object.prototype.hasOwnProperty.call(customMap(), el['cc-model'].value.trim());
          }
          el['cc-save'].addEventListener('click', () => {
            const key = el['cc-model'].value.trim();
            if (!key || !CM_SAFE_MODEL_RE.test(key) || key.toLowerCase() === 'auto' || key.toLowerCase() === 'none') {
              return ccMessage('Enter a valid model id or name.', true);
            }
            const ctx = cmParseTokens(el['cc-ctx'].value);
            if (ctx === null || ctx < 8000 || ctx > 10000000) return ccMessage('Context limit must be 8k\u201310M tokens.', true);
            let cmp = null;
            if (el['cc-cmp'].value.trim()) {
              cmp = cmParseTokens(el['cc-cmp'].value);
              if (cmp === null || cmp < 4000 || cmp > ctx) return ccMessage('Compact threshold must be 4k up to the context limit.', true);
            }
            const map = customMap();
            const entry = Object.assign({}, map[key] || {}, { contextLimit: ctx });
            if (cmp !== null) entry.compactionLimit = cmp;
            else delete entry.compactionLimit;
            map[key] = entry;
            ccDirty = false;
            ccMessage('Saved.');
            patch({ customModels: map });
          });
          function removeCustom(key) {
            const map = customMap();
            if (!Object.prototype.hasOwnProperty.call(map, key)) return;
            delete map[key];
            ccDirty = false;
            ccMessage('Removed.');
            patch({ customModels: map });
          }
          el['cc-remove'].addEventListener('click', () => removeCustom(el['cc-model'].value.trim()));
          el['cc-list'].addEventListener('click', (e) => {
            const t = e.target.closest ? e.target.closest('[data-key]') : null;
            if (!t) return;
            const key = t.getAttribute('data-key');
            if (t.getAttribute('data-act') === 'del') return removeCustom(key);
            const spec = customMap()[key] || {};
            el['cc-model'].value = key;
            el['cc-ctx'].value = spec.contextLimit ? cmFmtInput(spec.contextLimit) : '';
            el['cc-cmp'].value = spec.compactionLimit ? cmFmtInput(spec.compactionLimit) : '';
            ccDirty = true;
            ccMessage('');
            refreshCcRemove();
          });

          function sameModel(override, m) {
            const o = String(override || '').trim().toLowerCase();
            return o && (o === String(m.id).toLowerCase() || o === String(m.displayName).toLowerCase());
          }

          function sessionOptions(d, cfg) {
            const autoLabel = d.sessionState === 'empty_new' || d.resolvedBy === 'empty_new'
              ? 'Auto \u00B7 New Session'
              : (d.resolvedBy === 'renderer' || d.resolvedBy === 'host'
                ? 'Auto \u00B7 Active Session'
                : (d.resolvedBy === 'manual' ? 'Auto \u00B7 Follow Live' : 'Auto \u00B7 Latest Active'));
            const opts = [{ value: 'auto', label: autoLabel, badge: 'Live', group: 'Follow' }];
            const recent = d.recentConversations || [];
            for (const r of recent) {
              const warn = r.zone === 'OVERFLOW' || r.zone === 'CRITICAL' || r.compactionWarning === 'IMMINENT'
                ? 'bad'
                : (r.zone === 'ATTENTION_WARN' || r.compactionWarning === 'APPROACHING' ? 'warn' : 'ok');
              opts.push({
                value: r.conversationId,
                label: r.title || r.conversationId.slice(0, 8),
                sub: (r.pendingFirstResponse ? 'pending' : cmFmtTok(r.activeTokens) + ' / ' + r.tierLabel + ' \u00B7 ' + r.usedPct + '%') +
                  (r.compactionEvents ? ' \u00B7 ' + r.compactionEvents + (r.compactionEvents === 1 ? ' compact' : ' compacts') : ''),
                tag: r.tierLabel,
                tone: warn,
                group: 'Recent Sessions'
              });
            }
            const cur = cfg.selectedConvId || 'auto';
            let display;
            if (cur === 'auto') {
              display = { label: autoLabel, badge: 'Live' };
            } else {
              const hit = recent.find((r) => r.conversationId === cur);
              if (!hit) opts.push({ value: cur, label: cur.slice(0, 8), sub: 'not in recent list', group: 'Recent Sessions' });
              display = { label: hit ? (hit.title || cur.slice(0, 8)) : cur.slice(0, 8), tag: hit ? hit.tierLabel : '' };
            }
            return { opts, value: cur, display };
          }

          function modelOptions(d, cfg) {
            const a = d.analysis;
            const dm = d.defaultModel || {};
            const detected = (a && a.detectedModel) || dm;
            const catalog = d.discoveredModels || d.modelCatalog || [];
            const opts = [{
              value: 'auto',
              label: detected.displayName || 'Auto',
              badge: 'Auto-Detect',
              sub: detected.compactionLimit ? 'compact @ ' + cmFmtTok(detected.compactionLimit) : '',
              tag: detected.tierLabel || '',
              group: 'Follow'
            }];
            const byFamily = {};
            for (const m of catalog) {
              const fam = CM_FAMILY_GROUPS.some((g) => g[0] === m.family) ? m.family : 'gemini';
              (byFamily[fam] = byFamily[fam] || []).push(m);
            }
            for (const [fam, title] of CM_FAMILY_GROUPS) {
              for (const m of byFamily[fam] || []) {
                opts.push({
                  value: m.id,
                  label: m.displayName,
                  badge: m.source === 'custom' ? 'Custom' : (m.source === 'transcript' || m.source === 'dom' ? 'Detected' : ''),
                  sub: 'compact @ ' + cmFmtTok(m.compactionLimit),
                  tag: m.tierLabel,
                  group: title
                });
              }
            }
            const cur = cfg.modelOverride || 'auto';
            let display;
            if (cur === 'auto') {
              display = { label: detected.displayName || 'Auto', badge: 'Auto-Detect', tag: detected.tierLabel || '' };
            } else {
              const hit = catalog.find((m) => sameModel(cur, m));
              if (hit) {
                display = { label: hit.displayName, tag: hit.tierLabel };
                return { opts, value: hit.id, display };
              }
              opts.push({ value: cur, label: cur, sub: 'not in catalog', group: 'Custom' });
              display = { label: cur };
            }
            return { opts, value: cur, display };
          }

          function bannerHtml(a) {
            const out = [];
            if (a.compactionWarning && a.compactionWarning !== 'NONE') {
              const imminent = a.compactionWarning === 'IMMINENT';
              out.push('<div class="cm-banner ' + (imminent ? 'danger' : 'warn') + '"><b>' + (imminent ? 'Compacting Soon' : 'Approaching Compact') + '</b><span>' +
                cmFmtTok(a.activeTokens) + ' / ' + cmFmtTok(a.compactionLimit) + ' \u00B7 ' + a.compactionPct + '% \u00B7 ~' + cmFmtTok(a.tokensUntilCompaction) + ' left</span></div>');
            }
            if (a.handoffAlert && a.handoffAlert.message) {
              const sev = a.handoffAlert.severity === 'danger' ? 'danger' : (a.handoffAlert.severity === 'warn' ? 'warn' : '');
              out.push('<div class="cm-banner ' + sev + '"><b>Model Handoff</b><span style="font-family:var(--cm-font)">' + cmEsc(a.handoffAlert.message) + '</span></div>');
            }
            return out.join('');
          }

          function timeLabel(ts) {
            if (!ts) return '';
            const d = new Date(ts);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          }

          function render() {
            const d = data;
            if (!d) return;
            const cfg = d.config || {};
            const a = d.analysis || null;
            const dm = d.defaultModel || {};
            const model = a ? a.activeModel : dm;
            const isNew = d.sessionState === 'empty_new';
            const tier = model.tierLabel || '\u2013';
            const ctxLimit = Number(model.contextLimit) || 0;
            const focusTok = Number(model.attentionThreshold) || 0;
            const compactTok = a ? a.compactionLimit : (Number(dm.compactionLimit) || 0);
            const pending = Boolean(a && a.pendingFirstResponse);

            let tone = 'idle';
            let status;
            let usedTxt = '0';
            let fillPct = 0;
            if (!a) {
              status = isNew ? 'Ready' : 'Idle';
            } else if (pending) {
              status = 'Pending first response';
              usedTxt = '~' + cmFmtTok(a.estimatedPendingPromptTokens);
              fillPct = ctxLimit ? cmClamp((a.estimatedPendingPromptTokens / ctxLimit) * 100, 0, 100) : 0;
            } else {
              const danger = a.zone === 'OVERFLOW' || a.zone === 'CRITICAL' || a.compactionWarning === 'IMMINENT';
              const warn = a.zone === 'ATTENTION_WARN' || a.compactionWarning === 'APPROACHING';
              tone = danger ? 'bad' : (warn ? 'warn' : 'ok');
              status = a.usedPct + '% \u00B7 ' + (CM_ZONE_LABEL[a.zone] || a.zone);
              usedTxt = cmFmtTok(a.activeTokens);
              fillPct = cmClamp(a.usedPct, 0, 100);
            }

            cmSetText(el.phase, a ? (pending ? 'Pending' : String(a.phase || 'SINGLE').toLowerCase()) : (isNew ? 'New' : 'Idle'));
            cmSetText(el.sub, a
              ? (a.title || a.conversationId.slice(0, 8)) + ' \u00B7 ' + a.activeModel.displayName
              : (isNew ? 'New session \u00B7 ' + (dm.displayName || 'ready') : 'No active session transcript found yet.'));

            const s = sessionOptions(d, cfg);
            cbSession.setState(s.opts, s.value, s.display);
            const m = modelOptions(d, cfg);
            cbModel.setState(m.opts, m.value, m.display);
            el['reset-session'].hidden = !cfg.selectedConvId || cfg.selectedConvId === 'auto';
            el['reset-model'].hidden = !cfg.modelOverride || cfg.modelOverride === 'auto';

            cmSetText(el.used, usedTxt);
            cmSetText(el.ceil, '/ ' + tier);
            cmSetText(el.status, status);
            el.dot.className = 'cm-dot ' + tone;
            el.fill.className = 'cm-fill' + (tone === 'warn' || tone === 'bad' ? ' ' + tone : '');
            el.fill.style.width = fillPct + '%';
            el.track.setAttribute('aria-valuenow', String(Math.round(fillPct)));
            el.track.setAttribute('aria-valuetext', usedTxt + ' of ' + tier + ' \u00B7 ' + status);
            const hasCtx = ctxLimit > 0;
            el['tick-focus'].hidden = !hasCtx;
            el['tick-compact'].hidden = !hasCtx;
            el.zone.hidden = !hasCtx;
            if (hasCtx) {
              const compactPct = cmClamp((compactTok / ctxLimit) * 100, 1, 99);
              el['tick-focus'].style.left = cmClamp((focusTok / ctxLimit) * 100, 1, 99) + '%';
              el['tick-compact'].style.left = compactPct + '%';
              el.zone.style.left = compactPct + '%';
            }
            cmSetText(el['m-focus'], cmFmtTok(focusTok));
            cmSetText(el['m-compact'], cmFmtTok(compactTok));
            cmSetText(el['m-ceil'], cmFmtTok(ctxLimit));
            cmSetText(el.remaining, !a
              ? (isNew ? 'Waiting for first prompt' : 'No session transcript yet')
              : (pending ? '~' + cmFmtFull(a.estimatedPendingPromptTokens) + ' est. pending'
                : (a.overflowTokens > 0 ? 'Overflow +' + cmFmtFull(a.overflowTokens) : cmFmtFull(a.remainingTokens) + ' remaining')));
            cmSetText(el['compact-foot'], 'Compact @ ' + cmFmtTok(compactTok) + ' (' + (a ? a.compactionPct : 0) + '%)');

            cmSetHtml(el.banners, a ? bannerHtml(a) : '');
            const hist = a && (a.modelHistory || []);
            el.switches.hidden = !(hist && hist.length > 1);
            if (hist && hist.length > 1) cmSetText(el.switches, 'Model switches: ' + hist.map((h) => h.displayName).join(' \u2192 '));

            el.telemetry.hidden = !a;
            el.empty.hidden = Boolean(a);
            if (!a) {
              cmSetText(el.empty, isNew ? 'New session ready. Send a prompt to begin telemetry.' : 'No session transcript found yet.');
              cmSetText(el.sid, '');
              el.copy.disabled = true;
            } else {
              cmSetText(el.compacts, 'Compacts: ' + a.compactionEvents);
              cmSetHtml(el['compact-line'], 'Next auto-compact <span class="cm-num">@ ' + cmFmtTok(a.compactionLimit) + '</span> (' + cmEsc(CM_SOURCE_LABEL[a.compactionLimitSource] || a.compactionLimitSource) +
                ') \u00B7 <span class="cm-num">~' + cmFmtTok(a.tokensUntilCompaction) + '</span> left');
              const h = a.compactionHistory || [];
              el.hist.hidden = h.length === 0;
              cmSetText(el['hist-sum'], 'History (' + h.length + ')');
              cmSetHtml(el['hist-list'], h.map((c) => '<li><span>step ' + cmEsc(c.stepIndex) + (timeLabel(c.timestamp) ? ' \u00B7 ' + timeLabel(c.timestamp) : '') + '</span><span>' +
                (c.preCompactTokens != null ? cmFmtTok(c.preCompactTokens) : '?') + ' \u2192 ' + (c.postCompactTokens != null ? cmFmtTok(c.postCompactTokens) : '?') +
                ' \u00B7 ' + (c.source === 'checkpoint' ? 'checkpoint' : 'prompt drop') + '</span></li>').join(''));

              cmSetText(el.handoffs, a.handoffCount + (a.handoffCount === 1 ? ' switch' : ' switches'));
              cmSetHtml(el.matrix, (a.handoffMatrix || []).map((t) => {
                const cls = t.status === 'OVERFLOW' ? 'over' : (t.status === 'WARN' ? 'warn' : '');
                const dot = t.status === 'OVERFLOW' ? 'bad' : (t.status === 'WARN' ? 'warn' : 'ok');
                return '<div class="cm-tile ' + cls + '"><div class="cm-tile-n"><i class="cm-dot ' + dot + '"></i>' + cmEsc(t.tierLabel) + ' \u00B7 ' + cmEsc(t.shortLabel || t.label) +
                  '</div><div class="cm-tile-v">' + t.pct + '% \u00B7 ' + (t.status === 'OVERFLOW' ? 'OVER' : cmEsc(t.status)) + '</div></div>';
              }).join(''));

              cmSetText(el.turns, a.plannerSteps + (a.plannerSteps === 1 ? ' turn' : ' turns'));
              const cats = a.categories || [];
              cmSetHtml(el.stack, cats.filter((c) => c.pct > 0).map((c) => {
                const idx = cats.indexOf(c) % 7;
                return '<i class="cm-seg cm-s' + idx + '" style="width:' + c.pct + '%" title="' + cmEsc(c.label) + ': ' + cmFmtFull(c.tokens) + ' (' + c.pct + '%)"></i>';
              }).join(''));
              cmSetHtml(el.cats, cats.map((c, idx) => '<div class="cm-cat"><span class="cm-sw cm-s' + (idx % 7) + '"></span><span>' + cmEsc(c.label) +
                '</span><span class="cm-num">' + cmFmtTok(c.tokens) + '</span><span class="cm-num cm-dim">' + c.pct + '%</span></div>').join(''));

              cmSetText(el.logmode, (a.rotatedWindow ? 'Rotated' : 'Full') + ' Log');
              cmSetText(el['kv-hit'], a.cacheHitRatePct + '%');
              cmSetText(el['kv-cached'], cmFmtTok(a.cacheReadTokens));
              cmSetText(el['kv-fresh'], cmFmtTok(a.inputTokens));
              cmSetText(el['kv-misses'], String(a.cacheMissCount));
              cmSetText(el['kv-compacts'], String(a.compactionEvents));
              cmSetText(el['kv-rewinds'], String(a.rewindEvents || 0));

              cmSetText(el.offloaded, cmFmtTok(a.offloadedTokens) + ' offloaded');
              const subs = a.subagents || [];
              cmSetHtml(el.subs, subs.length
                ? subs.map((x) => '<div class="cm-sub-row"><span>' + cmEsc(x.role) + '<span class="cm-dim">(' + cmEsc(x.typeName) + ')</span></span><span class="cm-num">' + cmFmtTok(x.activeTokens) + ' isolated</span></div>').join('')
                : '<div class="cm-line cm-dim">No spawned subagents in this session.</div>');

              cmSetText(el.sid, (a.conversationId || '').slice(0, 8));
              el.copy.disabled = !a.compactSummary;
            }

            /* Settings: never overwrite what the user is editing */
            const active = document.activeElement;
            const warn = Number(cfg.compactWarnPct) || 70;
            if (active !== el['warn-range']) {
              if (el['warn-range'].value !== String(warn)) el['warn-range'].value = String(warn);
              cmSetText(el['warn-out'], warn + '%');
            }
            const custom = cfg.customModels || {};
            const keys = Object.keys(custom);
            cmSetHtml(el['cc-list'], keys.map((k) => {
              const c = custom[k] || {};
              return '<li><button type="button" class="cm-cc-item" data-key="' + cmEsc(k) + '" title="Edit"><span>' + cmEsc(k) + '</span><span class="cm-num">' +
                (c.contextLimit ? cmFmtTok(c.contextLimit) : '\u2013') + (c.compactionLimit ? ' \u00B7 compact ' + cmFmtTok(c.compactionLimit) : '') +
                '</span></button><button type="button" class="cm-icon-btn" data-key="' + cmEsc(k) + '" data-act="del" aria-label="Remove ' + cmEsc(k) + '" title="Remove">' +
                '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2 8 8M8 2 2 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button></li>';
            }).join(''));
            const ccFocused = [el['cc-model'], el['cc-ctx'], el['cc-cmp']].indexOf(active) !== -1;
            if (!ccDirty && !ccFocused) {
              const entryKey = custom[model.id] ? model.id : (custom[model.displayName] ? model.displayName : '');
              const spec = entryKey ? custom[entryKey] : null;
              const nextModel = entryKey || model.id || '';
              const nextCtx = spec && spec.contextLimit ? cmFmtInput(spec.contextLimit) : '';
              const nextCmp = spec && spec.compactionLimit ? cmFmtInput(spec.compactionLimit) : '';
              if (el['cc-model'].value !== nextModel) el['cc-model'].value = nextModel;
              if (el['cc-ctx'].value !== nextCtx) el['cc-ctx'].value = nextCtx;
              if (el['cc-cmp'].value !== nextCmp) el['cc-cmp'].value = nextCmp;
            }
            el['cc-ctx'].placeholder = ctxLimit ? 'Context limit (now ' + tier + ')' : 'Context limit (e.g. 200k)';
            refreshCcRemove();

            if (io.onRender) {
              io.onRender({
                tone,
                fillPct,
                label: !a
                  ? '0/' + tier + ' \u00B7 ' + (isNew ? 'Ready' : 'Idle')
                  : (pending ? usedTxt + '/' + tier + ' \u00B7 Pending' : usedTxt + '/' + tier + ' \u00B7 ' + a.usedPct + '%')
              });
            }
          }

          return {
            update(next) { data = next; render(); },
            hasOpenCombobox() { return Boolean(cmCbOpen && cmCbOpen.isOpen()); },
            closeComboboxes() { if (cmCbOpen) cmCbOpen.close(false); }
          };
        }

        const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
        const DOM_MODEL_RE = /^(?:Gemini\s+\d|Claude\s+(?:Opus|Sonnet|Haiku)|GPT[- ]?OSS|Orchestrator\b)[A-Za-z0-9 ._\u00B7()/-]{0,70}$/i;
        const CHAT_MESSAGE_SELECTOR = [
            '[data-message-id]',
            '[data-step-index]',
            '[data-testid="chat-message"]',
            '[data-testid="user-input-step"]',
            '[data-testid*="message"]',
            '.prose',
            '.markdown-body',
            'article'
        ].join(', ');

        function detectRendererConvId() {
            try {
                const locMatch = UUID_RE.exec(window.location.href || '');
                if (locMatch) return locMatch[1];

                const frames = document.querySelectorAll('iframe[src*="conversationId="]');
                for (const f of frames) {
                    const m = /[?&]conversationId=([0-9a-f-]{8,})/i.exec(f.getAttribute('src') || '');
                    if (m) return m[1];
                }

                const dataEls = document.querySelectorAll('[data-conversation-id]');
                for (const el of dataEls) {
                    if (el.closest('[data-ag-ctx-ui]')) continue;
                    const id = el.getAttribute('data-conversation-id');
                    if (id && UUID_RE.test(id)) return id;
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

        function hasChatMessages(scope) {
            for (const node of scope.querySelectorAll(CHAT_MESSAGE_SELECTOR)) {
                if (!node.closest('[data-ag-ctx-ui]')) return true;
            }
            return false;
        }

        let sawNonEmptyConvId = false;

        function detectIsNewSessionUi(detectedConvId) {
            if (detectedConvId) return false;
            try {
                if (sawNonEmptyConvId) return true;
                const loc = (window.location.pathname || '') + (window.location.hash || '');
                if (/(?:^|\/)new(?:\/|$|\?|#)/i.test(loc)) return true;
                if (document.querySelector('[data-testid*="new-session"], [data-testid*="empty-state"], [data-testid*="welcome"]')) {
                    return true;
                }
                if (hasAppShell()) {
                    const main = document.querySelector('[role="main"]') || document.body;
                    const hasComposer = Boolean(main.querySelector('[contenteditable="true"], textarea'));
                    if (hasComposer && !hasChatMessages(main)) return true;
                }
            } catch (_) {}
            return false;
        }

        function scanDomModels() {
            const out = [];
            const seen = new Set();
            try {
                const nodes = document.querySelectorAll(
                    '[data-testid*="model"], [aria-label*="model" i], [role="option"], [role="menuitemradio"], button[aria-haspopup]'
                );
                for (const el of nodes) {
                    if (el.closest('[data-ag-ctx-ui]')) continue;
                    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
                    if (!txt || txt.length > 80) continue;
                    if (!DOM_MODEL_RE.test(txt)) continue;
                    const k = txt.toLowerCase();
                    if (!seen.has(k)) {
                        seen.add(k);
                        out.push(txt);
                        if (out.length >= 30) break;
                    }
                }
            } catch (_) {}
            return out;
        }

        function saveConfig(patch) {
            try {
                console.log(SAVE_PREFIX + JSON.stringify(patch));
            } catch (_) {}
        }

        function requestPoll(extra) {
            try {
                const id = extra && extra.detectedConvId !== undefined ? extra.detectedConvId : detectRendererConvId();
                if (id) sawNonEmptyConvId = true;
                const isNew = extra && extra.isNewSessionUi !== undefined ? extra.isNewSessionUi : detectIsNewSessionUi(id);
                const domModels = extra && Array.isArray(extra.domModels) ? extra.domModels : scanDomModels();
                console.log(POLL_PREFIX + JSON.stringify({
                    detectedConvId: id,
                    isNewSessionUi: isNew,
                    domModels,
                    routeTransition: Boolean(extra && extra.routeTransition)
                }));
            } catch (_) {}
        }

        function mountUi() {
            if (!document.getElementById('ag-ctx-ui-css')) {
                const css = document.createElement('style');
                css.id = 'ag-ctx-ui-css';
                css.textContent = SHARED_CSS + TITLEBAR_CSS;
                document.head.appendChild(css);
            }

            const isMac = /Mac/i.test(navigator.userAgent || navigator.platform);
            const shortcutHint = isMac ? '\u2325C' : 'Alt+C';
            const mountStartTime = Date.now();

            const wrap = document.createElement('div');
            wrap.id = 'ag-ctx-toolbar-wrap';
            wrap.className = 'cm-root';
            wrap.setAttribute('data-ag-ctx-ui', '1');
            wrap.innerHTML =
                '<button id="ag-ctx-toolbar-btn" type="button" title="Antigravity Context Window Monitor (' + shortcutHint + ')" aria-haspopup="dialog" aria-expanded="false" aria-controls="ag-ctx-drawer">' +
                    '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
                        '<circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3" opacity="0.3"/>' +
                        '<circle id="ag-ctx-gauge-arc" cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" transform="rotate(-90 8 8)" stroke-dasharray="0 37.7"/>' +
                    '</svg>' +
                    '<span id="ag-ctx-btn-label">Ctx \u2014</span>' +
                    '<i id="ag-ctx-dot" class="cm-dot idle"></i>' +
                '</button>';

            const drawer = document.createElement('div');
            drawer.id = 'ag-ctx-drawer';
            drawer.setAttribute('data-ag-ctx-ui', '1');
            drawer.setAttribute('role', 'dialog');
            drawer.setAttribute('aria-label', 'Context Window Monitor');

            const btn = wrap.querySelector('#ag-ctx-toolbar-btn');
            const btnLabel = wrap.querySelector('#ag-ctx-btn-label');
            const dot = wrap.querySelector('#ag-ctx-dot');
            const arc = wrap.querySelector('#ag-ctx-gauge-arc');

            function updateButton(s) {
                btnLabel.textContent = s.label;
                dot.className = 'cm-dot ' + s.tone;
                arc.setAttribute('stroke-dasharray', ((s.fillPct / 100) * 37.7).toFixed(1) + ' 37.7');
            }

            const view = createMonitorView(drawer, {
                headExtra: '<span class="cm-pill key">' + shortcutHint + '</span>',
                saveConfig,
                refresh: () => requestPoll(),
                onRender: updateButton
            });
            cmWatchScheme(() => [wrap, drawer]);

            function findToolbarCluster() {
                return (
                    document.querySelector('[data-testid="titlebar-more-actions"]')?.parentElement ||
                    document.querySelector('[data-testid="install-editor"]')?.parentElement ||
                    document.querySelector('#ag-rtl-toolbar-wrap')?.parentElement ||
                    document.querySelector('[data-testid*="titlebar-actions"]')
                );
            }

            function attachUi() {
                const cluster = findToolbarCluster();
                if (cluster) {
                    if (wrap.parentElement !== cluster) {
                        wrap.classList.remove('ag-ctx-floating');
                        cluster.appendChild(wrap);
                    }
                } else if (!wrap.parentElement && (Date.now() - mountStartTime) > 3000 && document.body) {
                    wrap.classList.add('ag-ctx-floating');
                    document.body.appendChild(wrap);
                }
                if (!document.getElementById('ag-ctx-drawer') && document.body) {
                    document.body.appendChild(drawer);
                }
            }

            attachUi();

            function applyPayload(payload) {
                latestData = payload;
                wrap.style.display = payload && payload.config && payload.config.showInTitlebar === false ? 'none' : 'inline-flex';
                view.update(payload);
            }

            window.__agCtxReceive = (payload) => applyPayload(payload);
            applyPayload(latestData);

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
                } else {
                    view.closeComboboxes();
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
                    if (view.hasOpenCombobox()) return;
                    setDrawerOpen(false);
                    btn.focus({ preventScroll: true });
                    return;
                }
                if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyC') {
                    e.preventDefault();
                    setDrawerOpen();
                }
            }, true);
            window.addEventListener('resize', () => {
                if (drawer.classList.contains('open')) placeDrawer();
            });

            let lastDetectedConvId = detectRendererConvId();
            if (lastDetectedConvId) sawNonEmptyConvId = true;
            let lastNewSessionUi = detectIsNewSessionUi(lastDetectedConvId);
            let lastDomModelsSig = '';

            function checkRoute(isTransition) {
                const id = detectRendererConvId();
                if (id) sawNonEmptyConvId = true;
                const isNew = detectIsNewSessionUi(id);
                const domModels = scanDomModels();
                const domSig = domModels.join('|');
                if (id !== lastDetectedConvId || isNew !== lastNewSessionUi || domSig !== lastDomModelsSig) {
                    const routeTransition = Boolean(isTransition) || (id !== lastDetectedConvId) || (isNew !== lastNewSessionUi);
                    lastDetectedConvId = id;
                    lastNewSessionUi = isNew;
                    lastDomModelsSig = domSig;
                    requestPoll({ detectedConvId: id, isNewSessionUi: isNew, domModels, routeTransition });
                }
            }

            window.__agCtxCheckRoute = (isTransition) => checkRoute(Boolean(isTransition));

            if (!window.__agCtxHistoryHooked) {
                window.__agCtxHistoryHooked = true;
                for (const fnName of ['pushState', 'replaceState']) {
                    const orig = history[fnName];
                    if (typeof orig === 'function') {
                        history[fnName] = function (...args) {
                            const ret = orig.apply(this, args);
                            setTimeout(() => checkRoute(true), 0);
                            return ret;
                        };
                    }
                }
                window.addEventListener('popstate', () => setTimeout(() => checkRoute(true), 0));
                window.addEventListener('hashchange', () => setTimeout(() => checkRoute(true), 0));
            }

            // Initial sync right after mount so empty_new and DOM models sync immediately
            requestPoll({ detectedConvId: lastDetectedConvId, isNewSessionUi: lastNewSessionUi });

            setInterval(() => {
                if (document.hidden) return;
                checkRoute(false);
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
    }

    const targetContents = (typeof hubContents !== 'undefined' && hubContents)
        ? hubContents
        : ((typeof getHubWebContents === 'function' ? getHubWebContents(win) : null) || (win && win.webContents));

    const attachedTargets = globalThis.__agCtxAttachedTargets instanceof WeakSet
        ? globalThis.__agCtxAttachedTargets
        : (globalThis.__agCtxAttachedTargets = new WeakSet());

    if (!targetContents || typeof targetContents.on !== 'function' || attachedTargets.has(targetContents)) {
        return;
    }
    attachedTargets.add(targetContents);

    let lastRendererConvId = '';
    let lastRendererIsNewSession = false;
    let lastDomModels = [];
    let manualAnchorConvId = null;
    let lastFingerprint = '';
    let pollTimer = null;

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    if (win && typeof win.on === 'function') {
        win.on('closed', stopPolling);
    }
    if (typeof targetContents.once === 'function') {
        targetContents.once('destroyed', stopPolling);
    }

    function buildPayload(cfg, rendererConvId, isNewSessionUi, domModels) {
        if (!analyzer) return null;
        return analyzer.resolveContextPayload({
            config: cfg,
            rendererConvId,
            isNewSessionUi,
            domModels,
            limit: 15
        });
    }

    function computeFingerprint(cfg, rendererConvId, isNewSessionUi, domModels) {
        if (!analyzer || !coreModule) return '';
        const brainDir = analyzer.findBrainDir();
        const recent = analyzer.listRecentConversations({
            brainDir,
            limit: 5,
            compactWarnPct: cfg.compactWarnPct,
            customModels: cfg.customModels
        });
        const top = recent[0] ? `${recent[0].conversationId}:${recent[0].mtimeMs}:${recent[0].activeTokens}` : 'none';
        let selectedStat = '';
        const explicitId = (cfg.selectedConvId && cfg.selectedConvId !== 'auto') ? cfg.selectedConvId : rendererConvId;
        if (explicitId && coreModule.isSafeConvId(explicitId) && explicitId !== 'auto') {
            try {
                const tp = path.join(brainDir, explicitId, '.system_generated', 'logs', 'transcript.jsonl');
                if (fs.existsSync(tp)) {
                    const st = fs.statSync(tp);
                    selectedStat = `${explicitId}:${st.mtimeMs}:${st.size}`;
                }
            } catch (_) {}
        }
        const customSig = cfg.customModels ? JSON.stringify(cfg.customModels) : '';
        const domSig = Array.isArray(domModels) ? domModels.join(',') : '';
        return `${cfg.modelOverride}|${cfg.selectedConvId}|${cfg.compactWarnPct}|${cfg.showInTitlebar}|${customSig}|${rendererConvId}|${isNewSessionUi ? 1 : 0}|${domSig}|${brainDir}|${top}|${selectedStat}`;
    }

    function pushUpdate(force = false) {
        if (!settingsStore || !targetContents || targetContents.isDestroyed?.()) return;
        if (!isLocalAppUrl(targetContents.getURL())) return;
        try {
            const cfg = settingsStore.readSettings();
            const fp = computeFingerprint(cfg, lastRendererConvId, lastRendererIsNewSession, lastDomModels);
            if (!force && fp === lastFingerprint) return;
            lastFingerprint = fp;
            const payload = buildPayload(cfg, lastRendererConvId, lastRendererIsNewSession, lastDomModels);
            if (!payload) return;
            targetContents.executeJavaScript(
                `window.__agCtxReceive && window.__agCtxReceive(${JSON.stringify(payload)});`
            ).catch(() => {});
        } catch (_) {}
    }

    targetContents.on('console-message', (eventOrDetails, ...args) => {
        if (!settingsStore || !coreModule || !isLocalAppUrl(targetContents.getURL())) return;
        const msg = (args.length === 0 && eventOrDetails && typeof eventOrDetails === 'object')
            ? eventOrDetails.message
            : args[1];
        if (typeof msg !== 'string') return;

        if (msg.startsWith(SAVE_PREFIX)) {
            try {
                const patch = JSON.parse(msg.slice(SAVE_PREFIX.length));
                const next = settingsStore.writeSettingsPatch(patch);
                if (patch && typeof patch.selectedConvId === 'string') {
                    manualAnchorConvId = (next.selectedConvId && next.selectedConvId !== 'auto')
                        ? lastRendererConvId
                        : null;
                }
                pushUpdate(true);
            } catch (_) {}
            return;
        }

        if (msg.startsWith(POLL_PREFIX)) {
            try {
                const req = JSON.parse(msg.slice(POLL_PREFIX.length));
                let routeChanged = false;
                if (req && typeof req.detectedConvId === 'string') {
                    const rawId = req.detectedConvId.trim();
                    if (rawId === '' || coreModule.isSafeConvId(rawId)) {
                        const nextId = rawId === 'auto' ? '' : rawId;
                        if (nextId !== lastRendererConvId) {
                            routeChanged = true;
                            lastRendererConvId = nextId;
                        }
                    }
                }
                if (req && typeof req.isNewSessionUi === 'boolean') {
                    if (req.isNewSessionUi !== lastRendererIsNewSession) {
                        routeChanged = true;
                        lastRendererIsNewSession = req.isNewSessionUi;
                    }
                }
                if (req && Array.isArray(req.domModels)) {
                    lastDomModels = req.domModels
                        .filter((s) => typeof s === 'string' && coreModule.SAFE_MODEL_RE.test(s.trim()))
                        .map((s) => s.trim())
                        .slice(0, 30);
                }
                if (routeChanged && req && req.routeTransition === true) {
                    const curCfg = settingsStore.readSettings();
                    if (curCfg.selectedConvId !== 'auto' && manualAnchorConvId !== null && lastRendererConvId !== manualAnchorConvId) {
                        settingsStore.writeSettingsPatch({ selectedConvId: 'auto' });
                        manualAnchorConvId = null;
                    }
                }
                pushUpdate(true);
            } catch (_) {}
        }
    });

    targetContents.on('did-navigate-in-page', (_ev, navUrl) => {
        const urlStr = typeof navUrl === 'string' ? navUrl : targetContents.getURL();
        if (!isLocalAppUrl(urlStr)) return;
        const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(urlStr);
        if (m && coreModule && coreModule.isSafeConvId(m[1])) {
            if (m[1] !== lastRendererConvId) {
                lastRendererConvId = m[1];
                lastRendererIsNewSession = false;
                if (settingsStore) {
                    const curCfg = settingsStore.readSettings();
                    if (curCfg.selectedConvId !== 'auto' && manualAnchorConvId !== null && lastRendererConvId !== manualAnchorConvId) {
                        settingsStore.writeSettingsPatch({ selectedConvId: 'auto' });
                        manualAnchorConvId = null;
                    }
                }
            }
        }
        targetContents.executeJavaScript('window.__agCtxCheckRoute && window.__agCtxCheckRoute(true);').catch(() => {});
        pushUpdate(true);
    });

    targetContents.on('dom-ready', () => {
        if (!settingsStore || !isLocalAppUrl(targetContents.getURL())) return;
        try {
            const initialCfg = settingsStore.readSettings();
            const initialPayload = buildPayload(initialCfg, lastRendererConvId, lastRendererIsNewSession, lastDomModels);
            lastFingerprint = computeFingerprint(initialCfg, lastRendererConvId, lastRendererIsNewSession, lastDomModels);

            stopPolling();
            pollTimer = setInterval(() => pushUpdate(false), 1500);
            if (pollTimer && typeof pollTimer.unref === 'function') {
                pollTimer.unref();
            }

            targetContents.executeJavaScript(
                `(${clientMain.toString()})(${JSON.stringify(initialPayload)}, ${JSON.stringify(SAVE_PREFIX)}, ${JSON.stringify(POLL_PREFIX)});`
            ).catch((err) => console.error('Failed to inject Context Monitor runtime:', err));
        } catch (err) {
            console.error('Failed to initialize Context Monitor:', err);
        }
    });
})(win);
/* END ANTIGRAVITY CONTEXT MONITOR */
