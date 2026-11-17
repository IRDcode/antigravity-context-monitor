import fs, { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os, { homedir } from 'node:os';
import path, { basename, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Response, SidecarApp } from 'sidecar_sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const core = require(join(HERE, 'context-core.cjs'));
const analyzer = core.createContextAnalyzer({ fs, path, os });

const SAFE_MODEL_RE = /^[A-Za-z0-9 ._()/-]{1,64}$/;
const SAFE_CONV_RE = /^(?:auto|[A-Za-z0-9._-]{8,80})$/;
const SETTINGS_PATH = join(homedir(), '.antigravity-context-monitor.json');

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

function readSettings() {
    let merged = { ...BASE_CONFIG };
    try {
        if (existsSync(SETTINGS_PATH)) {
            merged = { ...merged, ...sanitizeSettings(JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'))) };
        }
    } catch {}
    return merged;
}

function writeSettingsPatch(patch) {
    const next = { ...readSettings(), ...sanitizeSettings(patch) };
    writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf8');
    return next;
}

function resolveBrainRoot() {
    const dataDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR;
    if (dataDir) {
        for (let d = dataDir; d !== dirname(d); d = dirname(d)) {
            if (basename(d) !== 'sidecar_data') continue;
            const candidate = join(dirname(d), 'brain');
            if (existsSync(candidate)) return candidate;
        }
    }
    return analyzer.findBrainDir();
}

const app = new SidecarApp();
const readLocal = (name) => readFileSync(join(HERE, name), 'utf8');

app.page('/', () => readLocal('index.html'));
app.page('/app.js', () => readLocal('app.js'));
app.api('/styles.css', () => new Response(readLocal('styles.css'), { contentType: 'text/css' }), 'GET');

app.api('/api/context', (data) => {
    const brainDir = resolveBrainRoot();
    const cfg = readSettings();
    const recent = analyzer.listRecentConversations({ brainDir, limit: 20 });

    const requestedConv = typeof data.convId === 'string' && SAFE_CONV_RE.test(data.convId) ? data.convId : '';
    const hostConv = typeof data.hostConvId === 'string' && SAFE_CONV_RE.test(data.hostConvId) ? data.hostConvId : '';
    const targetConv = (requestedConv && requestedConv !== 'auto')
        ? requestedConv
        : (cfg.selectedConvId && cfg.selectedConvId !== 'auto'
            ? cfg.selectedConvId
            : (hostConv || (recent[0]?.conversationId || '')));

    const modelOverride = (typeof data.modelOverride === 'string' && (data.modelOverride === 'auto' || SAFE_MODEL_RE.test(data.modelOverride)))
        ? data.modelOverride
        : cfg.modelOverride;

    const analysis = targetConv
        ? analyzer.analyzeConversationDir(targetConv, { brainDir, modelOverride })
        : null;

    return {
        config: cfg,
        modelCatalog: analyzer.MODEL_CATALOG,
        recentConversations: recent,
        analysis
    };
}, 'GET');

app.api('/api/config', (data) => {
    const next = writeSettingsPatch(data);
    return { ok: true, config: next };
}, 'POST');

app.run();
