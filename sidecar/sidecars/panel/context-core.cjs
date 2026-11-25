/* ANTIGRAVITY CONTEXT MONITOR — CORE ANALYZER (CLEAN-ROOM, ZERO EXTERNAL DEPS) */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.__agContextCoreFactory = factory;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const RULES_TOKEN_BUDGET = 20000;
    const CUSTOMIZATION_TOKEN_BUDGET = 20000;
    const PREAMBLE_BASE_CAP = RULES_TOKEN_BUDGET + CUSTOMIZATION_TOKEN_BUDGET; // 40,000

    function defaultCompactionLimit(contextLimit) {
        const limit = Number(contextLimit) || 1000000;
        if (limit >= 1000000) return 500000;
        return Math.round(limit * 0.85);
    }

    function formatTierLabel(contextLimit) {
        const limit = Number(contextLimit) || 1000000;
        if (limit >= 1000000) {
            const m = limit / 1000000;
            return (Number.isInteger(m) ? String(m) : m.toFixed(1)) + 'M';
        }
        return Math.round(limit / 1000) + 'k';
    }

    const MODEL_CATALOG = [
        // Claude 5.5 (200k Context Window; 1M/840k variants inferred dynamically)
        { id: 'claude-opus-5-5-max', displayName: 'Claude Opus 5.5 (Max)', family: 'claude', contextLimit: 200000, compactionLimit: 170000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },
        { id: 'claude-opus-5-5-high', displayName: 'Claude Opus 5.5 (High)', family: 'claude', contextLimit: 200000, compactionLimit: 170000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },
        { id: 'claude-opus-5-5-medium', displayName: 'Claude Opus 5.5 (Medium)', family: 'claude', contextLimit: 200000, compactionLimit: 170000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },
        { id: 'claude-opus-5-5-low', displayName: 'Claude Opus 5.5 (Low)', family: 'claude', contextLimit: 200000, compactionLimit: 170000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },
        { id: 'claude-sonnet-5-5-max', displayName: 'Claude Sonnet 5.5 (Max)', family: 'claude', contextLimit: 200000, compactionLimit: 170000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },
        { id: 'claude-sonnet-5-5-high', displayName: 'Claude Sonnet 5.5 (High)', family: 'claude', contextLimit: 200000, compactionLimit: 170000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },
        { id: 'claude-sonnet-5-5-medium', displayName: 'Claude Sonnet 5.5 (Medium)', family: 'claude', contextLimit: 200000, compactionLimit: 170000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },
        { id: 'claude-sonnet-5-5-low', displayName: 'Claude Sonnet 5.5 (Low)', family: 'claude', contextLimit: 200000, compactionLimit: 170000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },

        // GPT-OSS (128k Context Window)
        { id: 'gpt-oss-120b-medium', displayName: 'GPT-OSS 120B (Medium)', family: 'gpt-oss', contextLimit: 128000, compactionLimit: 108800, attentionThreshold: 80000, tierLabel: '128k', isDualPhase: false },
        { id: 'gpt-oss-20b', displayName: 'GPT-OSS 20B', family: 'gpt-oss', contextLimit: 128000, compactionLimit: 108800, attentionThreshold: 80000, tierLabel: '128k', isDualPhase: false },

        // Gemini 4 Neon (1M Context Window, ~500k auto-compaction)
        { id: 'gemini-4-neon-xhigh', displayName: 'Gemini 4 Neon (XHigh)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-neon-high', displayName: 'Gemini 4 Neon (High)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-neon-medium', displayName: 'Gemini 4 Neon (Medium)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-neon-low', displayName: 'Gemini 4 Neon (Low)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },

        // Gemini 4 Carbon (1M Context Window)
        { id: 'gemini-4-carbon-high', displayName: 'Gemini 4 Carbon (High)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-carbon-medium', displayName: 'Gemini 4 Carbon (Medium)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-carbon-low', displayName: 'Gemini 4 Carbon (Low)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },

        // Gemini 4 Hydrogen (1M Context Window)
        { id: 'gemini-4-hydrogen-xhigh', displayName: 'Gemini 4 Hydrogen (XHigh)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-hydrogen-high', displayName: 'Gemini 4 Hydrogen (High)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-hydrogen-medium', displayName: 'Gemini 4 Hydrogen (Medium)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-hydrogen-low', displayName: 'Gemini 4 Hydrogen (Low)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },

        // Gemini 4 Argon (1M Context Window)
        { id: 'gemini-4-argon-high', displayName: 'Gemini 4 Argon (High)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-argon-medium', displayName: 'Gemini 4 Argon (Medium)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-argon-low', displayName: 'Gemini 4 Argon (Low)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },

        // Gemini 3.x (1M Context Window)
        { id: 'gemini-3.8-flash-high', displayName: 'Gemini 3.8 Flash (High)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-3.8-flash-medium', displayName: 'Gemini 3.8 Flash (Medium)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-3.8-flash-low', displayName: 'Gemini 3.8 Flash (Low)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-3.7-flash-high', displayName: 'Gemini 3.7 Flash (High)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-3.1-pro-high', displayName: 'Gemini 3.1 Pro (High)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-3.1-pro-low', displayName: 'Gemini 3.1 Pro (Low)', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', family: 'gemini', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },

        // Orchestrator Dual-Phase Mode (1M Context Window, Plan/Execute split)
        { id: 'orchestrator-gemini-4-neon-xhigh', displayName: 'Orchestrator · Gemini 4 Neon Extra High', family: 'orchestrator', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: true },
        { id: 'gemini-4-hydrogen-orchestrator', displayName: 'Gemini 4 Hydrogen (Orchestrator)', family: 'orchestrator', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: true },
        { id: 'gemini-pro-orchestrator-g1-pro', displayName: 'Orchestrator (Argon)', family: 'orchestrator', contextLimit: 1000000, compactionLimit: 500000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: true }
    ];

    const MODEL_TIERS = [
        { key: 'gpt-oss', label: 'GPT-OSS 120B', shortLabel: 'GPT-OSS', ceiling: 128000, tierLabel: '128k' },
        { key: 'claude', label: 'Claude 5.5', shortLabel: 'Claude', ceiling: 200000, tierLabel: '200k' },
        { key: 'gemini', label: 'Gemini / Orchestrator', shortLabel: 'Gemini', ceiling: 1000000, tierLabel: '1M' }
    ];

    const CATEGORY_META = [
        { key: 'system_rules', label: 'System & Rules', shortLabel: 'System', tone: '#a1a1aa' },
        { key: 'mcp', label: 'MCP Servers & Tools', shortLabel: 'MCP', tone: '#e4e4e7' },
        { key: 'skills', label: 'Skills & Plugins', shortLabel: 'Skills', tone: '#71717a' },
        { key: 'files', label: 'Files & Codebase', shortLabel: 'Files', tone: '#d4d4d8' },
        { key: 'terminal', label: 'Terminal & Tasks', shortLabel: 'Terminal', tone: '#52525b' },
        { key: 'messages', label: 'Chat Messages', shortLabel: 'Messages', tone: '#fafafa' },
        { key: 'reasoning_subagents', label: 'Reasoning & Subagents', shortLabel: 'Reasoning', tone: '#3f3f46' }
    ];

    const SAFE_MODEL_RE = /^[A-Za-z0-9 ._\u00B7()/-]{1,96}$/;
    const SAFE_CONV_RE = /^(?:auto|[A-Za-z0-9._-]{8,80})$/;
    const SAFE_ID_RE = /^[A-Za-z0-9._-]+$/;
    const ALLOWED_FAMILIES = new Set(['claude', 'gemini', 'gpt-oss', 'orchestrator', 'custom']);
    const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'auto', 'none']);

    const BASE_CONFIG = {
        modelOverride: 'auto',
        selectedConvId: 'auto',
        compactWarnPct: 70,
        showInTitlebar: true,
        customModels: {}
    };

    const FILE_TOOLS = new Set([
        'read_file', 'edit_file', 'write_file', 'grep_search', 'find_by_name',
        'list_dir', 'view_file_outline', 'view_code_item', 'multi_replace_file_content',
        'replace_file_content'
    ]);
    const TERMINAL_TOOLS = new Set([
        'run_command', 'command_status', 'send_command_input', 'read_terminal', 'manage_task'
    ]);
    const REASONING_TOOLS = new Set([
        'invoke_subagent', 'send_message', 'manage_subagents', 'define_subagent',
        'swarm', 'run_workflow', 'exit_plan_mode', 'enter_plan_mode',
        'ask_question', 'search_web', 'schedule'
    ]);
    const MCP_TOOLS = new Set(['call_mcp_tool', 'list_resources', 'read_resource']);
    const SKILL_TOOLS = new Set(['search_marketplace', 'list_plugin_accounts']);

    const MODEL_CHANGE_RE = /changed setting `Model Selection` from ([^\r\n]+?) to ([^\r\n<]+?)(?:\.\s+No need to comment|\.\s*$|\r?\n|<\/USER_SETTINGS_CHANGE>|$)/g;
    const USER_SETTINGS_TAG_RE = /<USER_SETTINGS_CHANGE>([\s\S]*?)<\/USER_SETTINGS_CHANGE>/g;
    const USER_REQ_RE = /<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/;
    const TRUNCATED_BYTES_RE = /<truncated (\d+) bytes>/g;
    const SUBAGENT_CONV_RE = /"conversationId"\s*:\s*"([0-9a-f-]{8,})"/gi;
    const DOM_MODEL_NAME_RE = /^(?:Gemini\s+\d|Claude\s+(?:Opus|Sonnet|Haiku)|GPT[- ]?OSS|Orchestrator\b)/i;

    function isSafeModelId(value) {
        if (typeof value !== 'string') return false;
        const trimmed = value.trim();
        return trimmed === 'auto' || (trimmed.length > 0 && SAFE_MODEL_RE.test(trimmed));
    }

    function isSafeConvId(value) {
        if (typeof value !== 'string') return false;
        const trimmed = value.trim();
        return SAFE_CONV_RE.test(trimmed) && !trimmed.includes('..');
    }

    function sanitizeCustomModels(rawMap) {
        const out = {};
        if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return out;
        let count = 0;
        for (const [rawKey, rawVal] of Object.entries(rawMap)) {
            if (count >= 50) break;
            if (typeof rawKey !== 'string') continue;
            const key = rawKey.trim();
            if (!key || FORBIDDEN_KEYS.has(key.toLowerCase()) || !SAFE_MODEL_RE.test(key)) continue;
            if (!rawVal || typeof rawVal !== 'object' || Array.isArray(rawVal)) continue;

            const entry = {};
            if (rawVal.contextLimit !== undefined) {
                const n = Number(rawVal.contextLimit);
                if (Number.isInteger(n) && n >= 8000 && n <= 10000000) {
                    entry.contextLimit = n;
                }
            }
            if (rawVal.compactionLimit !== undefined) {
                const n = Number(rawVal.compactionLimit);
                if (Number.isInteger(n) && n >= 4000 && n <= 10000000) {
                    entry.compactionLimit = entry.contextLimit ? Math.min(n, entry.contextLimit) : n;
                }
            }
            if (rawVal.attentionThreshold !== undefined) {
                const n = Number(rawVal.attentionThreshold);
                if (Number.isInteger(n) && n >= 4000 && n <= 10000000) {
                    entry.attentionThreshold = entry.contextLimit ? Math.min(n, entry.contextLimit) : n;
                }
            }
            if (typeof rawVal.isDualPhase === 'boolean') {
                entry.isDualPhase = rawVal.isDualPhase;
            }
            if (typeof rawVal.displayName === 'string' && SAFE_MODEL_RE.test(rawVal.displayName.trim())) {
                entry.displayName = rawVal.displayName.trim();
            }
            if (typeof rawVal.family === 'string' && ALLOWED_FAMILIES.has(rawVal.family.trim().toLowerCase())) {
                entry.family = rawVal.family.trim().toLowerCase();
            }

            if (Object.keys(entry).length > 0) {
                out[key] = entry;
                count++;
            }
        }
        return out;
    }

    function sanitizeSettings(raw) {
        const clean = {};
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clean;
        if (typeof raw.modelOverride === 'string' && isSafeModelId(raw.modelOverride)) {
            clean.modelOverride = raw.modelOverride.trim();
        }
        if (typeof raw.selectedConvId === 'string' && isSafeConvId(raw.selectedConvId)) {
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
        if (raw.customModels !== undefined && raw.customModels !== null && typeof raw.customModels === 'object' && !Array.isArray(raw.customModels)) {
            clean.customModels = sanitizeCustomModels(raw.customModels);
        }
        return clean;
    }

    function createSettingsStore(deps = {}) {
        const fs = deps.fs || require('node:fs');
        const path = deps.path || require('node:path');
        const os = deps.os || require('node:os');

        function settingsFilePath() {
            if (deps.settingsPath) return deps.settingsPath;
            return path.join(os.homedir(), '.antigravity-context-monitor.json');
        }

        function readSettings() {
            let merged = { ...BASE_CONFIG, customModels: {} };
            try {
                const file = settingsFilePath();
                if (fs.existsSync(file)) {
                    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
                    const clean = sanitizeSettings(parsed);
                    merged = {
                        ...merged,
                        ...clean,
                        customModels: clean.customModels ? { ...clean.customModels } : {}
                    };
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
                const next = {
                    ...BASE_CONFIG,
                    ...current,
                    ...cleanPatch,
                    customModels: cleanPatch.customModels !== undefined
                        ? { ...cleanPatch.customModels }
                        : (current.customModels ? { ...current.customModels } : {})
                };
                fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
                return next;
            } catch (_) {
                return readSettings();
            }
        }

        return {
            settingsFilePath,
            readSettings,
            writeSettingsPatch
        };
    }

    function formatTokens(n) {
        const v = Number(n) || 0;
        if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
        if (v >= 10000) return (v / 1000).toFixed(0) + 'k';
        if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
        return String(Math.round(v));
    }

    function formatFullTokens(n) {
        return (Number(n) || 0).toLocaleString('en-US');
    }

    function buildCompactSummary(a) {
        if (!a || !a.activeModel) return '';
        const compLine = `Compaction: ${formatFullTokens(a.activeTokens)} / ${formatFullTokens(a.compactionLimit || a.activeModel.compactionLimit)} (${a.compactionPct ?? 0}%, ${a.compactionEvents || 0} events, warning: ${a.compactionWarning || 'NONE'})`;
        const catBreakdown = Array.isArray(a.categories)
            ? a.categories.map((c) => `${c.shortLabel}=${formatTokens(c.tokens)} (${c.pct}%)`).join(', ')
            : '';
        const subCount = Array.isArray(a.subagents) ? a.subagents.length : 0;
        return [
            `[Context Window Snapshot — ${a.activeModel.displayName} (${a.activeModel.tierLabel})]`,
            `Session: ${a.conversationId || 'unknown'} | Phase: ${a.phase || 'SINGLE'} | Usage: ${formatFullTokens(a.activeTokens)} / ${formatFullTokens(a.activeModel.contextLimit)} (${a.usedPct}%)`,
            compLine,
            `Cache: ${a.cacheHitRatePct}% hit (${formatFullTokens(a.cacheReadTokens)} cached, ${formatFullTokens(a.inputTokens)} fresh, ${a.cacheMissCount} misses)`,
            `Breakdown: ${catBreakdown}`,
            `Offloaded Subagents: ${subCount} (${formatTokens(a.offloadedTokens || 0)} tok)`
        ].join('\n');
    }

    function extractModelChangesFromUserInput(content) {
        if (!content || typeof content !== 'string' || !content.includes('<USER_SETTINGS_CHANGE>')) {
            return [];
        }
        const stripped = content.replace(/<USER_REQUEST>[\s\S]*?<\/USER_REQUEST>/g, '');
        const changes = [];
        USER_SETTINGS_TAG_RE.lastIndex = 0;
        let tagMatch;
        while ((tagMatch = USER_SETTINGS_TAG_RE.exec(stripped)) !== null) {
            const block = tagMatch[1];
            MODEL_CHANGE_RE.lastIndex = 0;
            let m;
            while ((m = MODEL_CHANGE_RE.exec(block)) !== null) {
                changes.push({ from: m[1].trim(), to: m[2].trim() });
            }
        }
        return changes;
    }

    function normalizeModelKey(raw) {
        return String(raw || '').trim().toLowerCase();
    }

    function canonicalLookupKey(raw) {
        return normalizeModelKey(raw)
            .replace(/[\u00B7•|]+/g, ' ')
            .replace(/\bextra[\s-]+high\b/g, 'xhigh')
            .replace(/[()]/g, ' ')
            .replace(/[\s_-]+/g, ' ')
            .trim();
    }

    function findCustomOverride(customModels, candidates) {
        if (!customModels || typeof customModels !== 'object') return null;
        const clean = sanitizeCustomModels(customModels);
        const entries = Object.entries(clean);
        if (entries.length === 0) return null;
        const candidateKeys = new Set();
        for (const c of candidates) {
            if (!c) continue;
            candidateKeys.add(normalizeModelKey(c));
            candidateKeys.add(canonicalLookupKey(c));
        }
        for (const [k, v] of entries) {
            if (candidateKeys.has(normalizeModelKey(k)) || candidateKeys.has(canonicalLookupKey(k))) {
                return { key: k, spec: v };
            }
        }
        return null;
    }

    function applyCustomOverride(baseProfile, customMatch) {
        if (!customMatch || !customMatch.spec) return baseProfile;
        const s = customMatch.spec;
        const contextLimit = s.contextLimit || baseProfile.contextLimit;
        const compactionLimit = s.compactionLimit
            ? Math.min(s.compactionLimit, contextLimit)
            : (s.contextLimit ? defaultCompactionLimit(contextLimit) : baseProfile.compactionLimit);
        const attentionThreshold = s.attentionThreshold
            ? Math.min(s.attentionThreshold, contextLimit)
            : Math.min(baseProfile.attentionThreshold, contextLimit);
        const isDualPhase = typeof s.isDualPhase === 'boolean' ? s.isDualPhase : baseProfile.isDualPhase;
        const family = s.family || (isDualPhase ? 'orchestrator' : baseProfile.family);
        return {
            ...baseProfile,
            displayName: s.displayName || baseProfile.displayName,
            family,
            contextLimit,
            compactionLimit,
            attentionThreshold,
            tierLabel: formatTierLabel(contextLimit),
            isDualPhase,
            inferred: false,
            customCompactionLimit: s.compactionLimit ? compactionLimit : undefined
        };
    }

    function resolveModelProfile(input, customModels = null) {
        const raw = String(input || '').trim();
        const key = normalizeModelKey(raw);
        if (!key || key === 'auto' || key === 'none') {
            return {
                id: 'gemini-4-neon-xhigh',
                displayName: 'Auto (Gemini 1M)',
                family: 'gemini',
                contextLimit: 1000000,
                compactionLimit: 500000,
                attentionThreshold: 150000,
                tierLabel: '1M',
                isDualPhase: false,
                inferred: true
            };
        }

        const canon = canonicalLookupKey(raw);
        const exact = MODEL_CATALOG.find(
            (m) =>
                m.id.toLowerCase() === key ||
                m.displayName.toLowerCase() === key ||
                canonicalLookupKey(m.id) === canon ||
                canonicalLookupKey(m.displayName) === canon
        );
        if (exact) {
            const base = { ...exact, inferred: false };
            const override = findCustomOverride(customModels, [raw, exact.id, exact.displayName]);
            return applyCustomOverride(base, override);
        }

        const isDualPhase = key.includes('orchestrator');
        const has1mOr840k = /(?:^|[^a-z0-9])1m(?:[^a-z0-9]|$)|840k/i.test(key);
        let profile;

        if (key.includes('claude')) {
            if (has1mOr840k) {
                const compLim = key.includes('840k') ? 840000 : 500000;
                profile = {
                    id: raw,
                    displayName: raw,
                    family: isDualPhase ? 'orchestrator' : 'claude',
                    contextLimit: 1000000,
                    compactionLimit: compLim,
                    attentionThreshold: 150000,
                    tierLabel: '1M',
                    isDualPhase,
                    inferred: false
                };
            } else {
                profile = {
                    id: raw,
                    displayName: raw,
                    family: isDualPhase ? 'orchestrator' : 'claude',
                    contextLimit: 200000,
                    compactionLimit: 170000,
                    attentionThreshold: 120000,
                    tierLabel: '200k',
                    isDualPhase,
                    inferred: false
                };
            }
        } else if (isDualPhase) {
            profile = {
                id: raw,
                displayName: raw,
                family: 'orchestrator',
                contextLimit: 1000000,
                compactionLimit: 500000,
                attentionThreshold: 150000,
                tierLabel: '1M',
                isDualPhase: true,
                inferred: false
            };
        } else if (key.includes('gpt-oss') || key.includes('gpt_oss') || /\bgpt-?(?:4|5|oss)\b/i.test(key) || /\bo[134]\b/i.test(key)) {
            profile = {
                id: raw,
                displayName: raw,
                family: 'gpt-oss',
                contextLimit: 128000,
                compactionLimit: 108800,
                attentionThreshold: 80000,
                tierLabel: '128k',
                isDualPhase: false,
                inferred: false
            };
        } else if (key.includes('gemini')) {
            profile = {
                id: raw,
                displayName: raw,
                family: 'gemini',
                contextLimit: 1000000,
                compactionLimit: 500000,
                attentionThreshold: 150000,
                tierLabel: '1M',
                isDualPhase: false,
                inferred: false
            };
        } else {
            profile = {
                id: raw,
                displayName: raw,
                family: 'gemini',
                contextLimit: 1000000,
                compactionLimit: 500000,
                attentionThreshold: 150000,
                tierLabel: '1M',
                isDualPhase: false,
                inferred: true
            };
        }

        const override = findCustomOverride(customModels, [raw, profile.id, profile.displayName]);
        return applyCustomOverride(profile, override);
    }

    function estimateTokens(text) {
        if (!text || typeof text !== 'string') return 0;
        let ascii = 0;
        let nonAscii = 0;
        for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) < 128) ascii++;
            else nonAscii++;
        }
        let extra = 0;
        TRUNCATED_BYTES_RE.lastIndex = 0;
        let m;
        while ((m = TRUNCATED_BYTES_RE.exec(text)) !== null) {
            const bytes = Number(m[1]);
            if (Number.isFinite(bytes) && bytes > 0) extra += Math.ceil(bytes / 3.8);
        }
        return Math.ceil(ascii / 3.8 + nonAscii / 1.75) + extra;
    }

    function classifyToolName(name, argsText) {
        const tool = String(name || '');
        const args = String(argsText || '');
        if (MCP_TOOLS.has(tool) || tool.startsWith('mcp_')) return 'mcp';
        if (SKILL_TOOLS.has(tool)) return 'skills';
        if (tool === 'read_file') {
            if (/[\\/]mcp[\\/]/i.test(args) || /\.mcp\.json/i.test(args)) return 'mcp';
            if (/SKILL\.md|[\\/](?:skills|plugins)[\\/]/i.test(args)) return 'skills';
            return 'files';
        }
        if (tool === 'run_command') {
            if (/SKILL\.md|[\\/](?:skills|plugins)[\\/]/i.test(args)) return 'skills';
            return 'terminal';
        }
        if (FILE_TOOLS.has(tool)) return 'files';
        if (TERMINAL_TOOLS.has(tool)) return 'terminal';
        if (REASONING_TOOLS.has(tool)) return 'reasoning_subagents';
        return 'files';
    }

    function makeZeroWeights() {
        return {
            system_rules: 0,
            mcp: 0,
            skills: 0,
            files: 0,
            terminal: 0,
            messages: 0,
            reasoning_subagents: 0
        };
    }

    function reconcileCategories(rawWeights, targetTokens) {
        const target = Math.max(0, Math.round(Number(targetTokens) || 0));
        const keys = CATEGORY_META.map((c) => c.key);
        const totalWeight = keys.reduce((acc, k) => acc + Math.max(0, Number(rawWeights[k]) || 0), 0);

        if (target === 0 || totalWeight <= 0) {
            return CATEGORY_META.map((meta) => ({
                key: meta.key,
                label: meta.label,
                shortLabel: meta.shortLabel,
                tone: meta.tone,
                tokens: 0,
                pct: 0
            }));
        }

        const exact = keys.map((k) => (Math.max(0, Number(rawWeights[k]) || 0) / totalWeight) * target);
        const floored = exact.map((v) => Math.floor(v));
        let remainder = target - floored.reduce((a, b) => a + b, 0);

        const order = keys
            .map((_, idx) => ({ idx, frac: exact[idx] - floored[idx] }))
            .sort((a, b) => b.frac - a.frac);
        for (let i = 0; i < order.length && remainder > 0; i++) {
            floored[order[i].idx] += 1;
            remainder -= 1;
        }

        return CATEGORY_META.map((meta, idx) => ({
            key: meta.key,
            label: meta.label,
            shortLabel: meta.shortLabel,
            tone: meta.tone,
            tokens: floored[idx],
            pct: Number(((floored[idx] / target) * 100).toFixed(1))
        }));
    }

    function extractTitleFromContent(content) {
        if (!content || typeof content !== 'string') return '';
        const match = USER_REQ_RE.exec(content);
        const raw = match ? match[1] : content;
        const firstLine = raw
            .split(/\r?\n/)
            .map((l) => l.trim())
            .find((l) => l && !l.startsWith('<'));
        if (!firstLine) return '';
        return firstLine.length > 68 ? firstLine.slice(0, 65) + '...' : firstLine;
    }

    function buildHandoffMatrix(activeTokens) {
        return MODEL_TIERS.map((tier) => {
            const pct = Number(((activeTokens / tier.ceiling) * 100).toFixed(1));
            const remaining = Math.max(0, tier.ceiling - activeTokens);
            const overflowBy = Math.max(0, activeTokens - tier.ceiling);
            let status = 'SAFE';
            if (activeTokens >= tier.ceiling) status = 'OVERFLOW';
            else if (pct >= 75) status = 'WARN';
            return {
                key: tier.key,
                label: tier.label,
                shortLabel: tier.shortLabel,
                tierLabel: tier.tierLabel,
                ceiling: tier.ceiling,
                pct,
                remaining,
                overflowBy,
                status
            };
        });
    }

    function parseArgsText(args) {
        if (!args || typeof args !== 'object') return '';
        try {
            return JSON.stringify(args);
        } catch {
            return '';
        }
    }

    function isCompactionCheckpointStep(step) {
        if (!step || step.type !== 'CHECKPOINT') return false;
        const content = typeof step.content === 'string' ? step.content.trimStart() : '';
        if (/^#\s*Browser Session Checkpoint\b/i.test(content)) return false;
        return (
            /^#\s*Resuming from a compaction\b/i.test(content) ||
            /^\{\{\s*CHECKPOINT\b/i.test(content)
        );
    }

    function analyzeTranscriptText(text, opts = {}) {
        const lines = String(text || '').split(/\r?\n/);
        const customModels = opts.customModels || null;
        const compactWarnPctRaw = Number(opts.compactWarnPct);
        const compactWarnPct = (Number.isFinite(compactWarnPctRaw) && compactWarnPctRaw >= 30 && compactWarnPctRaw <= 95)
            ? Math.round(compactWarnPctRaw)
            : BASE_CONFIG.compactWarnPct;

        let weights = makeZeroWeights();
        const modelHistory = [];
        const spawnedSubagents = [];
        const seenSubagentIds = new Set();
        let pendingTools = [];
        const compactionHistory = [];
        const snapshots = [];

        let totalSteps = 0;
        let userInputCount = 0;
        let plannerSteps = 0;
        let firstStepIndex = null;
        let lastStepIndex = null;
        let maxStepIndex = -Infinity;
        let firstPlannerTokens = null;
        let lastPlanner = null;
        let prevPromptTokens = null;
        let totalOutputTokensGenerated = 0;
        let cacheMissCount = 0;
        let compactionEvents = 0;
        let rewindEvents = 0;
        let pendingCompactionEntryIdx = -1;
        let title = '';
        let startedAt = null;
        let updatedAt = null;

        let currentPhase = 'SINGLE';
        let sawDualPhaseSignal = false;
        let handoffCount = 0;

        function captureSnapshot(stepIndex) {
            return {
                stepIndex,
                weights: { ...weights },
                modelHistoryLen: modelHistory.length,
                spawnedSubagentsLen: spawnedSubagents.length,
                pendingTools: pendingTools.map((t) => ({ ...t })),
                userInputCount,
                plannerSteps,
                firstPlannerTokens,
                lastPlanner: lastPlanner ? { ...lastPlanner } : null,
                prevPromptTokens,
                totalOutputTokensGenerated,
                cacheMissCount,
                compactionEvents,
                compactionHistoryLen: compactionHistory.length,
                pendingCompactionEntryIdx,
                currentPhase,
                sawDualPhaseSignal,
                handoffCount,
                title
            };
        }

        function rollbackToStepIndex(targetStepIndex) {
            const restoreIdx = snapshots.findIndex((s) => s.stepIndex >= targetStepIndex);
            if (restoreIdx === -1) return;
            const snap = snapshots[restoreIdx];
            weights = { ...snap.weights };
            modelHistory.length = snap.modelHistoryLen;
            spawnedSubagents.length = snap.spawnedSubagentsLen;
            seenSubagentIds.clear();
            for (const sub of spawnedSubagents) seenSubagentIds.add(sub.conversationId);
            pendingTools = snap.pendingTools.map((t) => ({ ...t }));
            userInputCount = snap.userInputCount;
            plannerSteps = snap.plannerSteps;
            firstPlannerTokens = snap.firstPlannerTokens;
            lastPlanner = snap.lastPlanner ? { ...snap.lastPlanner } : null;
            prevPromptTokens = snap.prevPromptTokens;
            totalOutputTokensGenerated = snap.totalOutputTokensGenerated;
            cacheMissCount = snap.cacheMissCount;
            compactionEvents = snap.compactionEvents;
            compactionHistory.length = snap.compactionHistoryLen;
            pendingCompactionEntryIdx = snap.pendingCompactionEntryIdx;
            currentPhase = snap.currentPhase;
            sawDualPhaseSignal = snap.sawDualPhaseSignal;
            handoffCount = snap.handoffCount;
            title = snap.title;

            snapshots.length = restoreIdx;
            maxStepIndex = restoreIdx > 0 ? snapshots[restoreIdx - 1].stepIndex : -Infinity;
            rewindEvents++;
        }

        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;
            let step;
            try {
                step = JSON.parse(trimmed);
            } catch {
                continue;
            }
            if (!step || typeof step !== 'object') continue;

            const hasStepIdx = typeof step.step_index === 'number' && Number.isFinite(step.step_index);
            if (hasStepIdx) {
                if (step.step_index <= maxStepIndex) {
                    rollbackToStepIndex(step.step_index);
                }
                snapshots.push(captureSnapshot(step.step_index));
                if (firstStepIndex === null || step.step_index < firstStepIndex) {
                    firstStepIndex = step.step_index;
                }
                lastStepIndex = step.step_index;
                if (step.step_index > maxStepIndex) {
                    maxStepIndex = step.step_index;
                }
            }

            totalSteps++;
            if (step.created_at) {
                if (!startedAt) startedAt = step.created_at;
                updatedAt = step.created_at;
            }

            const content = typeof step.content === 'string' ? step.content : '';

            if (step.type === 'CHECKPOINT') {
                if (isCompactionCheckpointStep(step)) {
                    pendingTools.length = 0;
                    const cpIn = Number(step.input_tokens) || 0;
                    const cpCache = Number(step.cache_read_tokens) || 0;
                    const cpPrompt = cpIn + cpCache;
                    const preCompactTokens = cpPrompt > 0 ? cpPrompt : (prevPromptTokens || null);

                    compactionEvents++;
                    compactionHistory.push({
                        stepIndex: hasStepIdx ? step.step_index : totalSteps - 1,
                        timestamp: step.created_at || null,
                        source: 'checkpoint',
                        preCompactTokens,
                        postCompactTokens: null
                    });
                    pendingCompactionEntryIdx = compactionHistory.length - 1;

                    // Keep baseline system/mcp/skills; collapse volatile pre-compaction context
                    weights.files = Math.round(weights.files * 0.12);
                    weights.terminal = Math.round(weights.terminal * 0.08);
                    weights.reasoning_subagents = Math.round(weights.reasoning_subagents * 0.10);
                    weights.messages = Math.max(400, estimateTokens(content));
                }
                continue;
            }

            if (step.type === 'USER_INPUT') {
                userInputCount++;
                pendingTools.length = 0;

                for (const ch of extractModelChangesFromUserInput(content)) {
                    const profile = resolveModelProfile(ch.to, customModels);
                    modelHistory.push({
                        stepIndex: hasStepIdx ? step.step_index : totalSteps - 1,
                        timestamp: step.created_at || null,
                        from: ch.from,
                        to: ch.to,
                        id: profile.id,
                        displayName: profile.displayName,
                        family: profile.family,
                        contextLimit: profile.contextLimit
                    });
                    if (profile.isDualPhase) {
                        sawDualPhaseSignal = true;
                        if (currentPhase === 'SINGLE') currentPhase = 'PLANNING';
                    } else if (modelHistory.length > 1) {
                        handoffCount++;
                    }
                }

                if (!title) title = extractTitleFromContent(content);
                if (sawDualPhaseSignal && currentPhase === 'EXECUTION') {
                    currentPhase = 'PLANNING';
                    handoffCount++;
                }
                const reqMatch = USER_REQ_RE.exec(content);
                const reqText = reqMatch ? reqMatch[1] : content;
                weights.messages += Math.max(12, estimateTokens(reqText));
                if (content.includes('<USER_SETTINGS_CHANGE>')) {
                    weights.system_rules += 40;
                }
                continue;
            }

            if (step.type === 'PLANNER_RESPONSE') {
                plannerSteps++;
                const inTok = Number(step.input_tokens) || 0;
                const cacheTok = Number(step.cache_read_tokens) || 0;
                const outTok = Number(step.output_tokens) || 0;
                const promptTok = inTok + cacheTok;
                const activeTok = promptTok + outTok;

                totalOutputTokensGenerated += outTok;

                const resumingFromCheckpoint = pendingCompactionEntryIdx >= 0 && compactionHistory[pendingCompactionEntryIdx];
                if (resumingFromCheckpoint) {
                    compactionHistory[pendingCompactionEntryIdx].postCompactTokens = promptTok;
                    pendingCompactionEntryIdx = -1;
                }

                if (firstPlannerTokens === null) {
                    firstPlannerTokens = promptTok;
                    const preambleBase = Math.max(0, promptTok - weights.messages);
                    if ((firstStepIndex ?? 0) <= 2) {
                        const effectiveBase = Math.min(preambleBase, PREAMBLE_BASE_CAP);
                        let mcpBase = Math.round(effectiveBase * (Number(opts.mcpBaselineRatio) || 0.14));
                        let skillsBase = Math.round(effectiveBase * (Number(opts.skillsBaselineRatio) || 0.20));
                        if (mcpBase + skillsBase > CUSTOMIZATION_TOKEN_BUDGET) {
                            const scale = CUSTOMIZATION_TOKEN_BUDGET / (mcpBase + skillsBase);
                            mcpBase = Math.round(mcpBase * scale);
                            skillsBase = Math.max(0, CUSTOMIZATION_TOKEN_BUDGET - mcpBase);
                        }
                        const sysBase = Math.min(RULES_TOKEN_BUDGET, Math.max(0, effectiveBase - mcpBase - skillsBase));
                        weights.system_rules += sysBase;
                        weights.mcp += mcpBase;
                        weights.skills += skillsBase;
                        const allocated = sysBase + mcpBase + skillsBase;
                        if (preambleBase > allocated) {
                            weights.files += preambleBase - allocated;
                        }
                    } else {
                        // Rotated / windowed transcript starting mid-conversation
                        const fixedSystem = Math.min(preambleBase, RULES_TOKEN_BUDGET);
                        weights.system_rules += Math.round(fixedSystem * 0.66);
                        weights.skills += Math.round(fixedSystem * 0.20);
                        weights.mcp += fixedSystem - Math.round(fixedSystem * 0.66) - Math.round(fixedSystem * 0.20);
                        const carriedHistory = Math.max(0, preambleBase - fixedSystem);
                        weights.files += Math.round(carriedHistory * 0.45);
                        weights.messages += Math.round(carriedHistory * 0.25);
                        weights.terminal += Math.round(carriedHistory * 0.18);
                        weights.reasoning_subagents += Math.max(0, carriedHistory - Math.round(carriedHistory * 0.45) - Math.round(carriedHistory * 0.25) - Math.round(carriedHistory * 0.18));
                    }
                } else {
                    if (!resumingFromCheckpoint && cacheTok === 0 && inTok > 25000) {
                        cacheMissCount++;
                    }
                    // Fallback monotonic prompt-drop compaction ONLY when no explicit CHECKPOINT preceded this turn
                    if (
                        !resumingFromCheckpoint &&
                        prevPromptTokens !== null &&
                        prevPromptTokens > 30000 &&
                        promptTok < prevPromptTokens * 0.78 &&
                        (prevPromptTokens - promptTok) > 10000
                    ) {
                        compactionEvents++;
                        compactionHistory.push({
                            stepIndex: hasStepIdx ? step.step_index : totalSteps - 1,
                            timestamp: step.created_at || null,
                            source: 'prompt_drop',
                            preCompactTokens: prevPromptTokens,
                            postCompactTokens: promptTok
                        });
                        weights.files = Math.round(weights.files * 0.18);
                        weights.terminal = Math.round(weights.terminal * 0.12);
                        weights.reasoning_subagents = Math.round(weights.reasoning_subagents * 0.15);
                        weights.messages = Math.max(400, Math.round(weights.messages * 0.25));
                    }
                }

                prevPromptTokens = promptTok;
                lastPlanner = {
                    stepIndex: hasStepIdx ? step.step_index : totalSteps - 1,
                    inputTokens: inTok,
                    cacheReadTokens: cacheTok,
                    outputTokens: outTok,
                    promptTokens: promptTok,
                    activeTokens: activeTok,
                    createdAt: step.created_at || null
                };

                if (content) {
                    weights.messages += estimateTokens(content);
                }
                if (typeof step.thinking === 'string' && step.thinking) {
                    weights.reasoning_subagents += estimateTokens(step.thinking);
                }
                if (Array.isArray(step.tool_calls)) {
                    for (const tc of step.tool_calls) {
                        if (!tc || typeof tc !== 'object') continue;
                        const name = String(tc.name || '');
                        const argsText = parseArgsText(tc.args);
                        const cat = classifyToolName(name, argsText);
                        weights[cat] += 35 + estimateTokens(argsText);
                        pendingTools.push({ name, cat, args: tc.args });

                        if (name === 'exit_plan_mode') {
                            sawDualPhaseSignal = true;
                            if (currentPhase !== 'EXECUTION') {
                                currentPhase = 'EXECUTION';
                                handoffCount++;
                            }
                        } else if (name === 'enter_plan_mode') {
                            sawDualPhaseSignal = true;
                            if (currentPhase !== 'PLANNING') {
                                currentPhase = 'PLANNING';
                                handoffCount++;
                            }
                        }
                    }
                }
                continue;
            }

            if (step.type === 'GENERIC') {
                const matched = pendingTools.shift();
                const tok = Math.max(20, estimateTokens(content));
                if (matched && matched.name === 'exit_plan_mode' && content.includes('Plan mode is off')) {
                    sawDualPhaseSignal = true;
                    if (currentPhase !== 'EXECUTION') {
                        currentPhase = 'EXECUTION';
                    }
                }
                if (matched && matched.name === 'invoke_subagent' && content.includes('conversationId')) {
                    SUBAGENT_CONV_RE.lastIndex = 0;
                    let sm;
                    while ((sm = SUBAGENT_CONV_RE.exec(content)) !== null) {
                        const subId = sm[1];
                        if (!seenSubagentIds.has(subId)) {
                            seenSubagentIds.add(subId);
                            let role = '';
                            let typeName = '';
                            let requestedModel = '';
                            if (matched.args && typeof matched.args === 'object') {
                                try {
                                    role = typeof matched.args.Role === 'string' ? JSON.parse(matched.args.Role) : '';
                                } catch { role = String(matched.args.Role || ''); }
                                try {
                                    typeName = typeof matched.args.TypeName === 'string' ? JSON.parse(matched.args.TypeName) : '';
                                } catch { typeName = String(matched.args.TypeName || ''); }
                                try {
                                    requestedModel = typeof matched.args.Model === 'string' ? JSON.parse(matched.args.Model) : '';
                                } catch { requestedModel = String(matched.args.Model || ''); }
                            }
                            spawnedSubagents.push({
                                conversationId: subId,
                                role: role || typeName || 'Subagent',
                                typeName: typeName || 'subagent',
                                requestedModel: requestedModel || 'inherit'
                            });
                        }
                    }
                }
                if (matched) {
                    weights[matched.cat] += tok;
                } else {
                    weights.files += tok;
                }
                continue;
            }

            if (step.type === 'SYSTEM_MESSAGE') {
                if (content.includes('[plan review')) {
                    sawDualPhaseSignal = true;
                    if (currentPhase !== 'PLANNING') {
                        currentPhase = 'PLANNING';
                        handoffCount++;
                    }
                }
                if (content.includes('Plan mode is off')) {
                    sawDualPhaseSignal = true;
                    currentPhase = 'EXECUTION';
                }
                if (content.includes('Task id "')) {
                    weights.terminal += Math.max(20, estimateTokens(content));
                } else if (content.includes('BROWSER_HOST_FACTS') || content.includes('subagent')) {
                    weights.reasoning_subagents += Math.max(20, estimateTokens(content));
                } else {
                    weights.system_rules += Math.max(20, estimateTokens(content));
                }
                continue;
            }

            if (step.type === 'VIEW_FILE') {
                weights.files += Math.max(20, estimateTokens(content));
                continue;
            }

            if (step.type === 'CONVERSATION_HISTORY') {
                weights.messages += Math.max(20, estimateTokens(content));
                continue;
            }

            if (step.type === 'ERROR_MESSAGE') {
                weights.terminal += Math.max(20, estimateTokens(step.error || content));
            }
        }

        const latestSessionModel = modelHistory.length > 0
            ? resolveModelProfile(modelHistory[modelHistory.length - 1].to, customModels)
            : (opts.globalFallbackModel ? { ...resolveModelProfile(opts.globalFallbackModel, customModels), inferred: true } : resolveModelProfile('auto', customModels));

        const hasOverride = Boolean(opts.modelOverride && opts.modelOverride !== 'auto');
        const activeModel = hasOverride ? resolveModelProfile(opts.modelOverride, customModels) : latestSessionModel;

        const pendingFirstResponse = plannerSteps === 0 && userInputCount > 0;
        const rawWeightSum = Object.values(weights).reduce((acc, v) => acc + Math.max(0, Number(v) || 0), 0);
        const estimatedPendingPromptTokens = pendingFirstResponse ? Math.max(12, Math.round(rawWeightSum)) : 0;

        const activeTokens = lastPlanner ? lastPlanner.activeTokens : 0;
        const promptTokens = lastPlanner ? lastPlanner.promptTokens : 0;
        const inputTokens = lastPlanner ? lastPlanner.inputTokens : 0;
        const cacheReadTokens = lastPlanner ? lastPlanner.cacheReadTokens : 0;
        const outputTokens = lastPlanner ? lastPlanner.outputTokens : 0;

        const contextLimit = activeModel.contextLimit;
        const attentionThreshold = activeModel.attentionThreshold;

        // Effective auto-compaction threshold priority: custom -> observed in session -> observed in history -> model default
        let compactionLimit = activeModel.compactionLimit || defaultCompactionLimit(contextLimit);
        let compactionLimitSource = 'default';
        if (activeModel.customCompactionLimit) {
            compactionLimit = Math.min(activeModel.customCompactionLimit, contextLimit);
            compactionLimitSource = 'custom';
        } else {
            const sessionObserved = [...compactionHistory]
                .reverse()
                .find((c) => c.source === 'checkpoint' && typeof c.preCompactTokens === 'number' && c.preCompactTokens >= 50000 && c.preCompactTokens <= contextLimit);
            if (sessionObserved) {
                compactionLimit = sessionObserved.preCompactTokens;
                compactionLimitSource = 'observed_session';
            } else if (
                typeof opts.observedCompactionLimit === 'number' &&
                Number.isFinite(opts.observedCompactionLimit) &&
                opts.observedCompactionLimit >= 50000 &&
                opts.observedCompactionLimit <= contextLimit
            ) {
                compactionLimit = Math.round(opts.observedCompactionLimit);
                compactionLimitSource = 'observed_history';
            }
        }
        compactionLimit = Math.max(1, Math.min(compactionLimit, contextLimit));

        const usedPct = Number(((activeTokens / contextLimit) * 100).toFixed(1));
        const remainingTokens = Math.max(0, contextLimit - activeTokens);
        const overflowTokens = Math.max(0, activeTokens - contextLimit);
        const attentionUsedPct = Number(((activeTokens / attentionThreshold) * 100).toFixed(1));
        const cacheHitRatePct = promptTokens > 0 ? Number(((cacheReadTokens / promptTokens) * 100).toFixed(1)) : 0;

        const compactionPct = Number(((activeTokens / compactionLimit) * 100).toFixed(1));
        const tokensUntilCompaction = Math.max(0, compactionLimit - activeTokens);
        const imminentPct = Math.max(90, Math.min(98, compactWarnPct + 10));
        let compactionWarning = 'NONE';
        if (activeTokens > 0) {
            if (activeTokens >= compactionLimit || compactionPct >= imminentPct) {
                compactionWarning = 'IMMINENT';
            } else if (compactionPct >= compactWarnPct) {
                compactionWarning = 'APPROACHING';
            }
        }

        let zone = 'OPTIMAL';
        if (activeTokens >= contextLimit) zone = 'OVERFLOW';
        else if (usedPct >= 80 || compactionWarning === 'IMMINENT') zone = 'CRITICAL';
        else if (activeTokens >= attentionThreshold || usedPct >= 60 || compactionWarning === 'APPROACHING') zone = 'ATTENTION_WARN';

        const handoffMatrix = buildHandoffMatrix(activeTokens);

        let handoffAlert = null;
        if (activeTokens >= contextLimit) {
            handoffAlert = {
                severity: 'danger',
                message: `Context (${formatFullTokens(activeTokens)} tok) exceeds ${activeModel.displayName} ceiling (${activeModel.tierLabel}).`
            };
        } else if (modelHistory.length > 1) {
            const narrowestSwitch = modelHistory.reduce((min, item) => Math.min(min, item.contextLimit), Infinity);
            if (activeTokens >= narrowestSwitch && contextLimit > narrowestSwitch) {
                handoffAlert = {
                    severity: 'warn',
                    message: `Session switched models; current ${formatFullTokens(activeTokens)} tok exceeds earlier narrower ${Math.round(narrowestSwitch / 1000)}k ceiling.`
                };
            }
        }
        if (!handoffAlert && activeModel.isDualPhase && activeTokens > 128000) {
            const overflowTiers = handoffMatrix.filter((t) => t.status === 'OVERFLOW').map((t) => t.tierLabel);
            if (overflowTiers.length > 0) {
                handoffAlert = {
                    severity: 'info',
                    message: `Orchestrator safe on 1M tier, but exceeds ${overflowTiers.join(' / ')} handoff tiers.`
                };
            }
        }

        const categories = reconcileCategories(weights, pendingFirstResponse ? estimatedPendingPromptTokens : activeTokens);

        const result = {
            title: title || 'Untitled Session',
            startedAt,
            updatedAt,
            totalSteps,
            plannerSteps,
            firstStepIndex: firstStepIndex ?? 0,
            lastStepIndex: lastStepIndex ?? 0,
            rotatedWindow: (firstStepIndex ?? 0) > 2,
            pendingFirstResponse,
            estimatedPendingPromptTokens,
            activeTokens,
            promptTokens,
            inputTokens,
            cacheReadTokens,
            outputTokens,
            totalOutputTokensGenerated,
            cacheHitRatePct,
            cacheMissCount,
            compactionEvents,
            compactionHistory,
            compactionLimit,
            compactionLimitSource,
            compactionPct,
            tokensUntilCompaction,
            compactionWarning,
            compactWarnPct,
            rewindEvents,
            activeModel: {
                id: activeModel.id,
                displayName: activeModel.displayName,
                family: activeModel.family,
                contextLimit,
                compactionLimit,
                attentionThreshold,
                tierLabel: activeModel.tierLabel,
                isDualPhase: Boolean(activeModel.isDualPhase),
                inferred: Boolean(activeModel.inferred),
                overrideActive: hasOverride
            },
            detectedModel: {
                id: latestSessionModel.id,
                displayName: latestSessionModel.displayName,
                family: latestSessionModel.family,
                contextLimit: latestSessionModel.contextLimit,
                compactionLimit: latestSessionModel.compactionLimit || defaultCompactionLimit(latestSessionModel.contextLimit),
                tierLabel: latestSessionModel.tierLabel,
                inferred: Boolean(latestSessionModel.inferred)
            },
            phase: activeModel.isDualPhase || sawDualPhaseSignal ? currentPhase : 'SINGLE',
            handoffCount,
            modelHistory,
            handoffMatrix,
            handoffAlert,
            usedPct,
            remainingTokens,
            overflowTokens,
            attentionUsedPct,
            zone,
            categories,
            subagents: spawnedSubagents
        };
        result.compactSummary = buildCompactSummary(result);
        return result;
    }

    function createContextAnalyzer(deps = {}) {
        const fs = deps.fs || require('node:fs');
        const path = deps.path || require('node:path');
        const os = deps.os || require('node:os');

        function findBrainDir(customRoot) {
            if (customRoot && fs.existsSync(customRoot)) return customRoot;
            const home = os.homedir();
            const candidates = [
                path.join(home, '.gemini', 'antigravity', 'brain'),
                path.join(home, '.gemini', 'antigravity-cli', 'brain')
            ];
            return candidates.find((c) => fs.existsSync(c)) || candidates[0];
        }

        function findConversationsDbDir(brainDir) {
            return path.join(path.dirname(brainDir), 'conversations');
        }

        function readMcpAndSkillsBaselineRatio(brainDir) {
            try {
                const geminiDir = path.dirname(path.dirname(brainDir));
                const mcpFile = path.join(geminiDir, 'config', 'mcp_config.json');
                let serverCount = 0;
                if (fs.existsSync(mcpFile)) {
                    const parsed = JSON.parse(fs.readFileSync(mcpFile, 'utf8'));
                    serverCount = Object.keys(parsed?.mcpServers || {}).length;
                }
                const mcpRatio = Math.min(0.28, 0.10 + serverCount * 0.03);
                return { mcpBaselineRatio: mcpRatio, skillsBaselineRatio: 0.20 };
            } catch {
                return { mcpBaselineRatio: 0.14, skillsBaselineRatio: 0.20 };
            }
        }

        function getTranscriptPath(brainDir, convId) {
            if (!convId || !SAFE_ID_RE.test(convId) || /^\.+$/.test(convId) || convId.includes('..')) return null;
            return path.join(brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl');
        }

        const summaryCache = new Map();
        const transcriptMetaCache = new Map();

        function scanTranscriptMeta(tp, mtimeMs, size) {
            const cacheKey = `${mtimeMs}:${size}`;
            const cached = transcriptMetaCache.get(tp);
            if (cached && cached.cacheKey === cacheKey) {
                return cached.meta;
            }
            const seenModels = [];
            const seenSet = new Set();
            let latestModel = null;
            let latestModelTs = '';
            let latestCheckpointPeak = null;
            let latestCheckpointModelId = null;

            try {
                const raw = fs.readFileSync(tp, 'utf8');
                const lines = raw.split(/\r?\n/);
                let currentModel = null;
                for (const line of lines) {
                    if (!line) continue;
                    const hasModelChange = line.includes('<USER_SETTINGS_CHANGE>') && line.includes('Model Selection');
                    const hasCheckpoint = line.includes('"CHECKPOINT"');
                    if (!hasModelChange && !hasCheckpoint) continue;
                    let step;
                    try {
                        step = JSON.parse(line);
                    } catch {
                        continue;
                    }
                    if (!step || typeof step !== 'object') continue;
                    if (step.type === 'USER_INPUT' && hasModelChange) {
                        const changes = extractModelChangesFromUserInput(step.content);
                        for (const ch of changes) {
                            currentModel = ch.to;
                            latestModel = ch.to;
                            if (typeof step.created_at === 'string') latestModelTs = step.created_at;
                            const lk = normalizeModelKey(ch.to);
                            if (lk && !seenSet.has(lk)) {
                                seenSet.add(lk);
                                seenModels.push(ch.to);
                            }
                        }
                    } else if (step.type === 'CHECKPOINT' && isCompactionCheckpointStep(step)) {
                        const cpPrompt = (Number(step.input_tokens) || 0) + (Number(step.cache_read_tokens) || 0);
                        if (cpPrompt >= 50000) {
                            latestCheckpointPeak = cpPrompt;
                            latestCheckpointModelId = currentModel ? resolveModelProfile(currentModel).id : null;
                        }
                    }
                }
            } catch {}

            const meta = { seenModels, latestModel, latestModelTs, latestCheckpointPeak, latestCheckpointModelId };
            transcriptMetaCache.set(tp, { cacheKey, meta });
            return meta;
        }

        function listTranscriptFilesSorted(brainDir, maxCount = 20) {
            try {
                if (!fs.existsSync(brainDir)) return [];
                return fs.readdirSync(brainDir, { withFileTypes: true })
                    .filter((d) => d.isDirectory() && SAFE_ID_RE.test(d.name))
                    .map((d) => {
                        const tp = getTranscriptPath(brainDir, d.name);
                        let mtimeMs = 0;
                        let size = 0;
                        try {
                            if (tp && fs.existsSync(tp)) {
                                const st = fs.statSync(tp);
                                mtimeMs = st.mtimeMs;
                                size = st.size;
                            }
                        } catch {}
                        return { id: d.name, tp, mtimeMs, size };
                    })
                    .filter((x) => x.mtimeMs > 0)
                    .sort((a, b) => b.mtimeMs - a.mtimeMs)
                    .slice(0, maxCount);
            } catch {
                return [];
            }
        }

        function detectLatestGlobalModel(brainDir) {
            const root = findBrainDir(brainDir);
            const entries = listTranscriptFilesSorted(root, 12);
            let bestModel = null;
            let bestTs = '';
            for (const item of entries) {
                const meta = scanTranscriptMeta(item.tp, item.mtimeMs, item.size);
                if (!meta.latestModel) continue;
                if (!bestModel) {
                    bestModel = meta.latestModel;
                    bestTs = meta.latestModelTs || '';
                    if (!bestTs) break;
                } else if (meta.latestModelTs && (!bestTs || meta.latestModelTs > bestTs)) {
                    bestModel = meta.latestModel;
                    bestTs = meta.latestModelTs;
                }
            }
            return bestModel;
        }

        function findObservedCompactionLimit(brainDir, modelId) {
            if (!modelId) return null;
            const targetKey = canonicalLookupKey(modelId);
            const entries = listTranscriptFilesSorted(brainDir, 15);
            for (const item of entries) {
                const meta = scanTranscriptMeta(item.tp, item.mtimeMs, item.size);
                if (meta.latestCheckpointPeak && meta.latestCheckpointModelId && canonicalLookupKey(meta.latestCheckpointModelId) === targetKey) {
                    return meta.latestCheckpointPeak;
                }
            }
            return null;
        }

        function discoverModels(opts = {}) {
            const brainDir = opts.brainDir !== undefined ? findBrainDir(opts.brainDir) : findBrainDir();
            const customModels = sanitizeCustomModels(opts.customModels);
            const domModels = Array.isArray(opts.domModels) ? opts.domModels : [];

            const merged = [];
            const seenKeys = new Set();

            function addProfile(rawOrEntry, source) {
                const isObj = rawOrEntry && typeof rawOrEntry === 'object';
                const profile = isObj
                    ? resolveModelProfile(rawOrEntry.id, customModels)
                    : resolveModelProfile(rawOrEntry, customModels);
                const kId = canonicalLookupKey(profile.id);
                const kName = canonicalLookupKey(profile.displayName);
                if (!kId || seenKeys.has(kId) || (kName && seenKeys.has(kName))) return;
                seenKeys.add(kId);
                if (kName) seenKeys.add(kName);
                merged.push({
                    id: profile.id,
                    displayName: profile.displayName,
                    family: profile.family,
                    contextLimit: profile.contextLimit,
                    compactionLimit: profile.compactionLimit || defaultCompactionLimit(profile.contextLimit),
                    attentionThreshold: profile.attentionThreshold,
                    tierLabel: profile.tierLabel,
                    isDualPhase: Boolean(profile.isDualPhase),
                    source
                });
            }

            // 1. Built-in catalog (with custom overrides reflected)
            for (const m of MODEL_CATALOG) {
                addProfile(m, 'builtin');
            }

            // 2. User custom models not already in built-in catalog
            for (const key of Object.keys(customModels)) {
                addProfile(key, 'custom');
            }

            // 3. Recent transcripts in brainDir
            if (brainDir && fs.existsSync(brainDir)) {
                const entries = listTranscriptFilesSorted(brainDir, 20);
                for (const item of entries) {
                    const meta = scanTranscriptMeta(item.tp, item.mtimeMs, item.size);
                    for (const modelName of meta.seenModels) {
                        if (isSafeModelId(modelName) && modelName.toLowerCase() !== 'auto' && modelName.toLowerCase() !== 'none') {
                            addProfile(modelName, 'transcript');
                        }
                    }
                }
            }

            // 4. Models observed from Antigravity model picker DOM
            for (const rawDom of domModels) {
                if (typeof rawDom !== 'string') continue;
                const trimmed = rawDom.trim();
                if (!trimmed || !SAFE_MODEL_RE.test(trimmed) || !DOM_MODEL_NAME_RE.test(trimmed)) continue;
                addProfile(trimmed, 'dom');
            }

            return merged;
        }

        function readSubagentSummary(brainDir, convId, visited, fallbackHint, customModels) {
            if (visited.has(convId)) return null;
            visited.add(convId);
            const tp = getTranscriptPath(brainDir, convId);
            if (!tp || !fs.existsSync(tp)) return null;
            try {
                const raw = fs.readFileSync(tp, 'utf8');
                const parsed = analyzeTranscriptText(raw, {
                    globalFallbackModel: fallbackHint || undefined,
                    customModels
                });
                return {
                    conversationId: convId,
                    activeTokens: parsed.activeTokens,
                    plannerSteps: parsed.plannerSteps,
                    model: parsed.activeModel.displayName,
                    contextLimit: parsed.activeModel.contextLimit
                };
            } catch {
                return null;
            }
        }

        function analyzeConversationDir(convId, opts = {}) {
            const brainDir = findBrainDir(opts.brainDir);
            const tp = getTranscriptPath(brainDir, convId);
            if (!tp || !fs.existsSync(tp)) {
                return null;
            }
            const stat = fs.statSync(tp);
            const raw = fs.readFileSync(tp, 'utf8');
            const ratios = readMcpAndSkillsBaselineRatio(brainDir);
            const globalFallback = opts.globalFallbackModel || detectLatestGlobalModel(brainDir);
            const customModels = opts.customModels || null;

            // Pre-resolve active model id so we can look up same-model compaction history if needed
            const meta = scanTranscriptMeta(tp, stat.mtimeMs, stat.size);
            const effectiveModelRef = (opts.modelOverride && opts.modelOverride !== 'auto')
                ? opts.modelOverride
                : (meta.latestModel || globalFallback || 'auto');
            const resolvedHint = resolveModelProfile(effectiveModelRef, customModels);
            const observedHistoryLimit = opts.observedCompactionLimit !== undefined
                ? opts.observedCompactionLimit
                : findObservedCompactionLimit(brainDir, resolvedHint.id);

            const analysis = analyzeTranscriptText(raw, {
                modelOverride: opts.modelOverride || 'auto',
                globalFallbackModel: globalFallback,
                mcpBaselineRatio: ratios.mcpBaselineRatio,
                skillsBaselineRatio: ratios.skillsBaselineRatio,
                compactWarnPct: opts.compactWarnPct,
                customModels,
                observedCompactionLimit: observedHistoryLimit
            });

            const visited = new Set([convId]);
            let offloadedTokens = 0;
            const enrichedSubagents = analysis.subagents.map((sub) => {
                let hint = null;
                if (sub.requestedModel === 'flash') hint = 'gemini-3.8-flash-medium';
                else if (sub.requestedModel === 'flash_lite') hint = 'gemini-3.1-flash-lite';
                else if (sub.requestedModel === 'pro') hint = 'gemini-4-neon-high';
                else if (sub.requestedModel === 'inherit' || !sub.requestedModel) hint = analysis.activeModel.id;
                const summary = readSubagentSummary(brainDir, sub.conversationId, visited, hint, customModels);
                if (summary) offloadedTokens += summary.activeTokens;
                return {
                    ...sub,
                    activeTokens: summary ? summary.activeTokens : 0,
                    plannerSteps: summary ? summary.plannerSteps : 0,
                    model: summary ? summary.model : (hint ? resolveModelProfile(hint, customModels).displayName : sub.requestedModel),
                    available: Boolean(summary)
                };
            });

            const full = {
                conversationId: convId,
                transcriptPath: tp,
                fileSize: stat.size,
                mtimeMs: stat.mtimeMs,
                ...analysis,
                subagents: enrichedSubagents,
                offloadedTokens
            };
            full.compactSummary = buildCompactSummary(full);
            return full;
        }

        function listRecentConversations(opts = {}) {
            const brainDir = findBrainDir(opts.brainDir);
            if (!fs.existsSync(brainDir)) return [];
            const dbDir = findConversationsDbDir(brainDir);
            const limit = Math.max(1, Math.min(50, Number(opts.limit) || 15));
            const globalFallback = detectLatestGlobalModel(brainDir);
            const customModels = opts.customModels || null;
            const compactWarnPct = opts.compactWarnPct ?? BASE_CONFIG.compactWarnPct;
            const customKey = customModels ? JSON.stringify(customModels) : '';

            const candidates = [];
            for (const entry of fs.readdirSync(brainDir, { withFileTypes: true })) {
                if (!entry.isDirectory() || !SAFE_ID_RE.test(entry.name)) continue;
                const convId = entry.name;
                const tp = getTranscriptPath(brainDir, convId);
                if (!tp || !fs.existsSync(tp)) continue;
                let mtimeMs = 0;
                let size = 0;
                try {
                    const st = fs.statSync(tp);
                    mtimeMs = st.mtimeMs;
                    size = st.size;
                } catch { continue; }
                for (const suffix of ['.db', '.db-wal']) {
                    const dbPath = path.join(dbDir, `${convId}${suffix}`);
                    try {
                        if (fs.existsSync(dbPath)) {
                            const dst = fs.statSync(dbPath);
                            if (dst.mtimeMs > mtimeMs) mtimeMs = dst.mtimeMs;
                        }
                    } catch {}
                }
                candidates.push({ conversationId: convId, tp, mtimeMs, size });
            }

            candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
            const results = [];
            for (const c of candidates.slice(0, limit)) {
                try {
                    const tpStat = fs.statSync(c.tp);
                    const cacheKey = `${tpStat.mtimeMs}:${tpStat.size}:${globalFallback || ''}:${compactWarnPct}:${customKey}`;
                    let summary = summaryCache.get(c.conversationId);
                    if (!summary || summary.cacheKey !== cacheKey) {
                        const raw = fs.readFileSync(c.tp, 'utf8');
                        const parsed = analyzeTranscriptText(raw, {
                            globalFallbackModel: globalFallback,
                            compactWarnPct,
                            customModels
                        });
                        summary = { cacheKey, parsed };
                        summaryCache.set(c.conversationId, summary);
                    }
                    const s = summary.parsed;
                    results.push({
                        conversationId: c.conversationId,
                        title: s.title,
                        mtimeMs: c.mtimeMs,
                        activeTokens: s.activeTokens,
                        usedPct: s.usedPct,
                        contextLimit: s.activeModel.contextLimit,
                        compactionLimit: s.compactionLimit,
                        compactionPct: s.compactionPct,
                        compactionWarning: s.compactionWarning,
                        compactionEvents: s.compactionEvents,
                        tierLabel: s.activeModel.tierLabel,
                        modelName: s.activeModel.displayName,
                        zone: s.zone,
                        plannerSteps: s.plannerSteps,
                        pendingFirstResponse: s.pendingFirstResponse
                    });
                } catch {}
            }
            return results;
        }

        function resolveContextPayload(params = {}) {
            const brainDir = findBrainDir(params.brainDir);
            const rawCfg = params.config && typeof params.config === 'object' ? params.config : {};
            const cleanCfg = sanitizeSettings(rawCfg);
            const cfg = {
                ...BASE_CONFIG,
                ...cleanCfg,
                customModels: cleanCfg.customModels ? { ...cleanCfg.customModels } : {}
            };

            const effectiveModelOverride = (typeof params.modelOverride === 'string' && isSafeModelId(params.modelOverride))
                ? params.modelOverride.trim()
                : cfg.modelOverride;

            const analyzeOpts = {
                brainDir,
                modelOverride: effectiveModelOverride,
                compactWarnPct: cfg.compactWarnPct,
                customModels: cfg.customModels
            };

            const recent = listRecentConversations({
                brainDir,
                limit: params.limit || 15,
                compactWarnPct: cfg.compactWarnPct,
                customModels: cfg.customModels
            });

            const discoveredModels = discoverModels({
                brainDir,
                customModels: cfg.customModels,
                domModels: params.domModels
            });

            const globalFallback = detectLatestGlobalModel(brainDir);
            const defProf = resolveModelProfile(
                effectiveModelOverride && effectiveModelOverride !== 'auto'
                    ? effectiveModelOverride
                    : (globalFallback || 'auto'),
                cfg.customModels
            );
            const defaultModel = {
                id: defProf.id,
                displayName: defProf.displayName,
                family: defProf.family,
                contextLimit: defProf.contextLimit,
                compactionLimit: defProf.compactionLimit || defaultCompactionLimit(defProf.contextLimit),
                attentionThreshold: defProf.attentionThreshold,
                tierLabel: defProf.tierLabel,
                isDualPhase: Boolean(defProf.isDualPhase)
            };

            const safeNonAuto = (v) => (typeof v === 'string' && isSafeConvId(v) && v.trim() !== 'auto') ? v.trim() : '';
            const reqId = safeNonAuto(params.requestedConvId);
            const manualId = safeNonAuto(cfg.selectedConvId);
            const renId = safeNonAuto(params.rendererConvId);
            const hstId = safeNonAuto(params.hostConvId);

            let sessionState = 'no_sessions';
            let resolvedBy = 'none';
            let targetConversationId = '';
            let analysis = null;

            if (reqId) {
                targetConversationId = reqId;
                analysis = analyzeConversationDir(reqId, analyzeOpts);
                resolvedBy = 'manual';
                sessionState = analysis ? (analysis.pendingFirstResponse ? 'pending' : 'active') : 'empty_new';
            } else if (manualId) {
                targetConversationId = manualId;
                analysis = analyzeConversationDir(manualId, analyzeOpts);
                resolvedBy = 'manual';
                sessionState = analysis ? (analysis.pendingFirstResponse ? 'pending' : 'active') : 'empty_new';
            } else if (renId) {
                targetConversationId = renId;
                analysis = analyzeConversationDir(renId, analyzeOpts);
                if (analysis) {
                    resolvedBy = 'renderer';
                    sessionState = analysis.pendingFirstResponse ? 'pending' : 'active';
                } else {
                    resolvedBy = 'empty_new';
                    sessionState = 'empty_new';
                }
            } else if (hstId) {
                targetConversationId = hstId;
                analysis = analyzeConversationDir(hstId, analyzeOpts);
                if (analysis) {
                    resolvedBy = 'host';
                    sessionState = analysis.pendingFirstResponse ? 'pending' : 'active';
                } else {
                    resolvedBy = 'empty_new';
                    sessionState = 'empty_new';
                }
            } else if (params.isNewSessionUi === true) {
                resolvedBy = 'empty_new';
                sessionState = 'empty_new';
                targetConversationId = '';
                analysis = null;
            } else if (recent.length > 0) {
                targetConversationId = recent[0].conversationId;
                analysis = analyzeConversationDir(targetConversationId, analyzeOpts);
                resolvedBy = analysis ? 'latest_activity' : 'none';
                sessionState = analysis ? (analysis.pendingFirstResponse ? 'pending' : 'active') : 'no_sessions';
            }

            return {
                config: cfg,
                sessionState,
                resolvedBy,
                targetConversationId,
                hostConversationId: hstId,
                defaultModel,
                modelCatalog: discoveredModels,
                discoveredModels,
                recentConversations: recent,
                analysis
            };
        }

        return {
            MODEL_CATALOG,
            MODEL_TIERS,
            CATEGORY_META,
            BASE_CONFIG,
            SAFE_MODEL_RE,
            SAFE_CONV_RE,
            isSafeModelId,
            isSafeConvId,
            sanitizeCustomModels,
            sanitizeSettings,
            formatTokens,
            formatFullTokens,
            buildCompactSummary,
            resolveModelProfile,
            estimateTokens,
            classifyToolName,
            reconcileCategories,
            analyzeTranscriptText,
            analyzeConversationDir,
            listRecentConversations,
            detectLatestGlobalModel,
            discoverModels,
            resolveContextPayload,
            findBrainDir
        };
    }

    return {
        MODEL_CATALOG,
        MODEL_TIERS,
        CATEGORY_META,
        BASE_CONFIG,
        SAFE_MODEL_RE,
        SAFE_CONV_RE,
        isSafeModelId,
        isSafeConvId,
        sanitizeCustomModels,
        sanitizeSettings,
        createSettingsStore,
        formatTokens,
        formatFullTokens,
        buildCompactSummary,
        resolveModelProfile,
        estimateTokens,
        classifyToolName,
        reconcileCategories,
        analyzeTranscriptText,
        createContextAnalyzer
    };
});
