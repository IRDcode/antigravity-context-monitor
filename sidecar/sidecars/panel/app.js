const sidecar = window.sidecar;
const $ = (id) => document.getElementById(id);
const SEG_COLORS = ['#e4e4e7', '#60a5fa', '#a1a1aa', '#d4d4d8', '#71717a', '#f4f4f5', '#52525b'];

let latestSnapshot = null;

function fmtTok(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(2)}M`;
  if (v >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

function fmtFull(n) {
  return (Number(n) || 0).toLocaleString();
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

async function fetchContext() {
  const params = new URLSearchParams();
  if (sidecar?.conversationId) params.set('hostConvId', sidecar.conversationId);
  const res = await sidecar.fetch(`/api/context?${params.toString()}`, { method: 'GET' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function saveConfig(patch) {
  await sidecar.fetch('/api/config', {
    method: 'POST',
    body: JSON.stringify(patch)
  });
  await refresh();
}

function renderSelectors(data) {
  const convSel = $('conv-select');
  const modelSel = $('model-select');
  const cfg = data.config || {};
  const activeFocus = document.activeElement;

  if (activeFocus !== convSel) {
    convSel.innerHTML = '';
    const autoOpt = document.createElement('option');
    autoOpt.value = 'auto';
    autoOpt.textContent = sidecar?.conversationId ? 'Auto (Active Session)' : 'Auto (Latest Active)';
    autoOpt.selected = cfg.selectedConvId === 'auto';
    convSel.appendChild(autoOpt);

    for (const r of (data.recentConversations || [])) {
      const opt = document.createElement('option');
      opt.value = r.conversationId;
      opt.textContent = `${r.title || r.conversationId.slice(0, 8)} · ${fmtTok(r.activeTokens)}`;
      opt.selected = cfg.selectedConvId === r.conversationId;
      convSel.appendChild(opt);
    }
  }

  if (activeFocus !== modelSel) {
    modelSel.innerHTML = '';
    const det = data.analysis?.detectedModel?.displayName || 'Auto';
    const autoM = document.createElement('option');
    autoM.value = 'auto';
    autoM.textContent = `Auto-Detect (${det})`;
    autoM.selected = cfg.modelOverride === 'auto';
    modelSel.appendChild(autoM);

    const groups = {
      'Claude 5.5 · 200k': [],
      'GPT-OSS · 128k': [],
      'Orchestrator · 1M': [],
      'Gemini 3.8 / 4 · 1M': []
    };
    for (const m of (data.modelCatalog || [])) {
      if (m.family === 'claude') groups['Claude 5.5 · 200k'].push(m);
      else if (m.family === 'gpt-oss') groups['GPT-OSS · 128k'].push(m);
      else if (m.family === 'orchestrator') groups['Orchestrator · 1M'].push(m);
      else groups['Gemini 3.8 / 4 · 1M'].push(m);
    }

    for (const [label, list] of Object.entries(groups)) {
      if (!list.length) continue;
      const og = document.createElement('optgroup');
      og.label = label;
      for (const m of list) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.displayName} (${m.tierLabel})`;
        opt.selected = cfg.modelOverride === m.id;
        og.appendChild(opt);
      }
      modelSel.appendChild(og);
    }
  }
}

function render(data) {
  latestSnapshot = data;
  renderSelectors(data);

  const a = data.analysis;
  if (!a) {
    $('session-subtitle').textContent = 'No active session transcript found yet.';
    $('phase-badge').textContent = 'IDLE';
    return;
  }

  $('session-subtitle').textContent = `${a.title} · ${a.activeModel.displayName}`;
  $('phase-badge').textContent = a.phase;
  $('tok-used').textContent = fmtTok(a.activeTokens);
  $('tok-ceiling').textContent = `/ ${a.activeModel.tierLabel} (${a.usedPct}%)`;

  const zoneBadge = $('zone-badge');
  zoneBadge.textContent = a.zone;
  const warnCls = (a.zone === 'OVERFLOW' || a.zone === 'CRITICAL')
    ? 'danger'
    : (a.zone === 'ATTENTION_WARN' ? 'warn' : 'ok');
  zoneBadge.className = `badge ${warnCls}`;

  const barFill = $('bar-fill');
  barFill.style.width = `${Math.min(100, Math.max(0, a.usedPct))}%`;
  barFill.className = `bar-fill ${warnCls === 'ok' ? '' : warnCls}`;

  const attnPct = Math.min(98, Math.max(2, (a.activeModel.attentionThreshold / a.activeModel.contextLimit) * 100));
  $('attn-tick').style.left = `${attnPct}%`;

  $('tok-remaining').textContent = a.overflowTokens > 0
    ? `OVERFLOW +${fmtFull(a.overflowTokens)} tok`
    : `${fmtFull(a.remainingTokens)} remaining`;
  $('tok-attention').textContent = `Focus <= ${fmtTok(a.activeModel.attentionThreshold)} (${a.attentionUsedPct}%)`;

  const alertBox = $('handoff-alert');
  if (a.handoffAlert) {
    alertBox.hidden = false;
    alertBox.className = `alert ${a.handoffAlert.severity}`;
    alertBox.textContent = a.handoffAlert.message;
  } else {
    alertBox.hidden = true;
  }

  const histBox = $('switch-history');
  if ((a.modelHistory || []).length > 1) {
    histBox.hidden = false;
    histBox.textContent = `Model switches: ${a.modelHistory.map((h) => h.displayName).join(' -> ')}`;
  } else {
    histBox.hidden = true;
  }

  $('handoff-count').textContent = `${a.handoffCount} switches`;
  const matrix = $('handoff-matrix');
  matrix.innerHTML = '';
  for (const t of (a.handoffMatrix || [])) {
    const cls = t.status === 'OVERFLOW' ? 'overflow' : (t.status === 'WARN' ? 'warn' : '');
    const box = makeEl('div', `tier-box ${cls}`);
    box.appendChild(makeEl('div', 'tier-name', `${t.tierLabel} · ${t.label.split(' ')[0]}`));
    box.appendChild(makeEl('div', 'tier-val', `${t.pct}% · ${t.status === 'OVERFLOW' ? 'OVER' : t.status}`));
    matrix.appendChild(box);
  }

  $('turn-count').textContent = `${a.plannerSteps} turns`;
  const stackBar = $('stack-bar');
  const catList = $('cat-list');
  stackBar.innerHTML = '';
  catList.innerHTML = '';

  a.categories.forEach((c, idx) => {
    const color = SEG_COLORS[idx % SEG_COLORS.length];
    if (c.pct > 0) {
      const seg = document.createElement('div');
      seg.style.width = `${c.pct}%`;
      seg.style.background = color;
      seg.title = `${c.label}: ${fmtFull(c.tokens)} (${c.pct}%)`;
      stackBar.appendChild(seg);
    }

    const row = makeEl('div', 'cat-row');
    const sw = makeEl('span', 'swatch');
    sw.style.background = color;
    row.appendChild(sw);
    row.appendChild(makeEl('span', '', c.label));
    row.appendChild(makeEl('span', 'mono', fmtTok(c.tokens)));
    row.appendChild(makeEl('span', 'mono cat-pct', `${c.pct}%`));
    catList.appendChild(row);
  });

  $('log-mode').textContent = a.rotatedWindow ? 'Rotated Log' : 'Full Log';
  $('kv-hit').textContent = `${a.cacheHitRatePct}%`;
  $('kv-cached').textContent = fmtTok(a.cacheReadTokens);
  $('kv-fresh').textContent = fmtTok(a.inputTokens);
  $('kv-misses').textContent = String(a.cacheMissCount);

  $('offloaded-total').textContent = `${fmtTok(a.offloadedTokens)} offloaded`;
  const subList = $('subagent-list');
  subList.innerHTML = '';
  if ((a.subagents || []).length === 0) {
    subList.appendChild(makeEl('div', 'small muted', 'No spawned subagents in this session.'));
  } else {
    for (const s of a.subagents) {
      const row = makeEl('div', 'sub-row');
      row.appendChild(makeEl('span', '', `${s.role} (${s.typeName})`));
      row.appendChild(makeEl('span', 'mono', `${fmtTok(s.activeTokens)} isolated`));
      subList.appendChild(row);
    }
  }
}

async function refresh() {
  try {
    const data = await fetchContext();
    render(data);
  } catch (err) {
    $('session-subtitle').textContent = `Telemetry error: ${err.message}`;
  }
}

function init() {
  if (!sidecar) {
    $('session-subtitle').textContent = 'Sidecar bridge unavailable outside Antigravity.';
    return;
  }

  $('refresh-btn').addEventListener('click', refresh);
  $('conv-select').addEventListener('change', (e) => {
    e.target.blur();
    saveConfig({ selectedConvId: e.target.value });
  });
  $('model-select').addEventListener('change', (e) => {
    e.target.blur();
    saveConfig({ modelOverride: e.target.value });
  });
  $('copy-summary-btn').addEventListener('click', (e) => {
    const a = latestSnapshot?.analysis;
    if (!a) return;
    const summary = [
      `[Context Window Snapshot — ${a.activeModel.displayName} (${a.activeModel.tierLabel})]`,
      `Session: ${a.conversationId} | Phase: ${a.phase} | Usage: ${fmtFull(a.activeTokens)} / ${fmtFull(a.activeModel.contextLimit)} (${a.usedPct}%)`,
      `Cache: ${a.cacheHitRatePct}% hit (${fmtFull(a.cacheReadTokens)} cached, ${fmtFull(a.inputTokens)} fresh, ${a.cacheMissCount} misses)`,
      `Breakdown: ${a.categories.map((c) => `${c.shortLabel}=${fmtTok(c.tokens)} (${c.pct}%)`).join(', ')}`,
      `Offloaded Subagents: ${a.subagents.length} (${fmtTok(a.offloadedTokens)} tok)`
    ].join('\n');
    navigator.clipboard?.writeText(summary).then(() => {
      e.target.textContent = 'Copied ✓';
      setTimeout(() => { e.target.textContent = 'Copy /compact Summary'; }, 1600);
    }).catch(() => {});
  });

  refresh();
  setInterval(refresh, 2000);
}

init();
