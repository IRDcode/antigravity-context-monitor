/* Shared UI kit (identical in the Titlebar client of src/runtime-patch.js) */
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

/* Sidecar bootstrap */
const sidecar = window.sidecar;
const appRoot = document.getElementById('app');
let inFlight = false;
let queued = false;
let latestData = null;

function getLiveHostConvId() {
  try {
    if (sidecar && sidecar.conversationId) return String(sidecar.conversationId);
    const params = new URLSearchParams(window.location.search || '');
    return params.get('conversationId') || '';
  } catch (_) {
    return '';
  }
}

function showNotice(text) {
  const sub = appRoot.querySelector('[data-r="sub"]');
  if (sub) sub.textContent = text;
}

async function fetchContext() {
  const params = new URLSearchParams();
  const hostConvId = getLiveHostConvId();
  if (hostConvId) params.set('hostConvId', hostConvId);
  const res = await sidecar.fetch('/api/context?' + params.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function refresh(opts) {
  const force = Boolean(opts && opts.force);
  if (inFlight) {
    if (force) queued = true;
    return;
  }
  if (!force && document.hidden) return;
  inFlight = true;
  try {
    latestData = await fetchContext();
    view.update(latestData);
  } catch (err) {
    showNotice('Telemetry error: ' + (err && err.message ? err.message : err));
  } finally {
    inFlight = false;
    if (queued) {
      queued = false;
      refresh({ force: true });
    }
  }
}

async function saveConfig(patch) {
  try {
    await sidecar.fetch('/api/config', { method: 'POST', body: JSON.stringify(patch) });
  } catch (err) {
    showNotice('Could not save settings: ' + (err && err.message ? err.message : err));
  }
  refresh({ force: true });
}

const view = createMonitorView(appRoot, {
  saveConfig,
  refresh: () => refresh({ force: true })
});
cmWatchScheme(() => [document.documentElement, appRoot]);

if (!sidecar) {
  showNotice('Sidecar bridge unavailable outside Antigravity.');
} else {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh({ force: true });
  });
  refresh({ force: true });
  setInterval(() => refresh({ force: false }), 2000);
}
