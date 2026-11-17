/* ANTIGRAVITY CONTEXT MONITOR — CORE ANALYZER (CLEAN-ROOM, ZERO EXTERNAL DEPS) */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.__agContextCoreFactory = factory;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MODEL_CATALOG = [
        // Claude 5.5 (200k Context Window)
        { id: 'claude-opus-5-5-high', displayName: 'Claude Opus 5.5 (High)', family: 'claude', contextLimit: 200000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },
        { id: 'claude-opus-5-5-medium', displayName: 'Claude Opus 5.5 (Medium)', family: 'claude', contextLimit: 200000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },
        { id: 'claude-opus-5-5-low', displayName: 'Claude Opus 5.5 (Low)', family: 'claude', contextLimit: 200000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },
        { id: 'claude-sonnet-5-5-high', displayName: 'Claude Sonnet 5.5 (High)', family: 'claude', contextLimit: 200000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },
        { id: 'claude-sonnet-5-5-medium', displayName: 'Claude Sonnet 5.5 (Medium)', family: 'claude', contextLimit: 200000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },
        { id: 'claude-sonnet-5-5-low', displayName: 'Claude Sonnet 5.5 (Low)', family: 'claude', contextLimit: 200000, attentionThreshold: 120000, tierLabel: '200k', isDualPhase: false },

        // GPT-OSS (128k Context Window)
        { id: 'gpt-oss-120b-medium', displayName: 'GPT-OSS 120B (Medium)', family: 'gpt-oss', contextLimit: 128000, attentionThreshold: 80000, tierLabel: '128k', isDualPhase: false },

        // Gemini 3.8 & Gemini 4 (1M Context Window)
        { id: 'gemini-3.8-flash-high', displayName: 'Gemini 3.8 Flash (High)', family: 'gemini', contextLimit: 1000000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-3.8-flash-medium', displayName: 'Gemini 3.8 Flash (Medium)', family: 'gemini', contextLimit: 1000000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-3.8-flash-low', displayName: 'Gemini 3.8 Flash (Low)', family: 'gemini', contextLimit: 1000000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-argon-high', displayName: 'Gemini 4 Argon (High)', family: 'gemini', contextLimit: 1000000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-argon-medium', displayName: 'Gemini 4 Argon (Medium)', family: 'gemini', contextLimit: 1000000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-argon-low', displayName: 'Gemini 4 Argon (Low)', family: 'gemini', contextLimit: 1000000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-hydrogen-xhigh', displayName: 'Gemini 4 Hydrogen (XHigh)', family: 'gemini', contextLimit: 1000000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-hydrogen-high', displayName: 'Gemini 4 Hydrogen (High)', family: 'gemini', contextLimit: 1000000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-hydrogen-medium', displayName: 'Gemini 4 Hydrogen (Medium)', family: 'gemini', contextLimit: 1000000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },
        { id: 'gemini-4-hydrogen-low', displayName: 'Gemini 4 Hydrogen (Low)', family: 'gemini', contextLimit: 1000000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: false },

        // Orchestrator Dual-Phase Mode (1M Context Window, Plan/Execute split)
        { id: 'gemini-pro-orchestrator-g1-pro', displayName: 'Orchestrator (Argon)', family: 'orchestrator', contextLimit: 1000000, attentionThreshold: 150000, tierLabel: '1M', isDualPhase: true }
    ];

    const MODEL_TIERS = [
        { key: 'gpt-oss', label: 'GPT-OSS 120B', ceiling: 128000, tierLabel: '128k' },
        { key: 'claude', label: 'Claude 5.5', ceiling: 200000, tierLabel: '200k' },
        { key: 'gemini', label: 'Gemini / Orchestrator', ceiling: 1000000, tierLabel: '1M' }
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
    const SAFE_ID_RE = /^[A-Za-z0-9._-]+$/;

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

    function resolveModelProfile(input) {
        const raw = String(input || '').trim();
        const key = normalizeModelKey(raw);
        if (!key || key === 'auto' || key === 'none') {
            return {
                id: 'gemini-4-hydrogen-xhigh',
                displayName: 'Auto (Gemini 1M)',
                family: 'gemini',
                contextLimit: 1000000,
                attentionThreshold: 150000,
                tierLabel: '1M',
                isDualPhase: false,
                inferred: true
            };
        }

        const exact = MODEL_CATALOG.find(
            (m) => m.id.toLowerCase() === key || m.displayName.toLowerCase() === key
        );
        if (exact) {
            return { ...exact, inferred: false };
        }

        if (key.includes('orchestrator')) {
            return {
                id: raw,
                displayName: raw,
                family: 'orchestrator',
                contextLimit: 1000000,
                attentionThreshold: 150000,
                tierLabel: '1M',
                isDualPhase: true,
                inferred: false
            };
        }
        if (key.includes('claude')) {
            return {
                id: raw,
                displayName: raw,
                family: 'claude',
                contextLimit: 200000,
                attentionThreshold: 120000,
                tierLabel: '200k',
                isDualPhase: false,
                inferred: false
            };
        }
        if (key.includes('gpt-oss') || key.includes('gpt_oss') || /\bgpt-?(?:4|5|oss)\b/i.test(key) || /\bo[134]\b/i.test(key)) {
            return {
                id: raw,
                displayName: raw,
                family: 'gpt-oss',
                contextLimit: 128000,
                attentionThreshold: 80000,
                tierLabel: '128k',
                isDualPhase: false,
                inferred: false
            };
        }
        if (key.includes('gemini')) {
            return {
                id: raw,
                displayName: raw,
                family: 'gemini',
                contextLimit: 1000000,
                attentionThreshold: 150000,
                tierLabel: '1M',
                isDualPhase: false,
                inferred: false
            };
        }

        return {
            id: raw,
            displayName: raw,
            family: 'gemini',
            contextLimit: 1000000,
            attentionThreshold: 150000,
            tierLabel: '1M',
            isDualPhase: false,
            inferred: true
        };
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

    function analyzeTranscriptText(text, opts = {}) {
        const lines = String(text || '').split(/\r?\n/);
        const weights = makeZeroWeights();
        const modelHistory = [];
        const spawnedSubagents = [];
        const seenSubagentIds = new Set();
        const pendingTools = [];

        let totalSteps = 0;
        let plannerSteps = 0;
        let firstStepIndex = null;
        let lastStepIndex = null;
        let firstPlannerTokens = null;
        let lastPlanner = null;
        let prevPromptTokens = null;
        let totalOutputTokensGenerated = 0;
        let cacheMissCount = 0;
        let compactionEvents = 0;
        let title = '';
        let startedAt = null;
        let updatedAt = null;

        let currentPhase = 'SINGLE';
        let sawDualPhaseSignal = false;
        let handoffCount = 0;

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

            totalSteps++;
            if (typeof step.step_index === 'number') {
                if (firstStepIndex === null) firstStepIndex = step.step_index;
                lastStepIndex = step.step_index;
            }
            if (step.created_at) {
                if (!startedAt) startedAt = step.created_at;
                updatedAt = step.created_at;
            }

            const content = typeof step.content === 'string' ? step.content : '';

            if (step.type === 'USER_INPUT') {
                // Reset any unclosed pending tool queue from an interrupted previous turn
                pendingTools.length = 0;

                for (const ch of extractModelChangesFromUserInput(content)) {
                    const profile = resolveModelProfile(ch.to);
                    modelHistory.push({
                        stepIndex: step.step_index ?? totalSteps - 1,
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

                if (firstPlannerTokens === null) {
                    firstPlannerTokens = promptTok;
                    const preambleBase = Math.max(0, promptTok - weights.messages);
                    if ((firstStepIndex ?? 0) <= 2) {
                        const effectiveBase = Math.min(preambleBase, 30000);
                        const mcpBase = Math.round(effectiveBase * (Number(opts.mcpBaselineRatio) || 0.14));
                        const skillsBase = Math.round(effectiveBase * (Number(opts.skillsBaselineRatio) || 0.20));
                        const sysBase = Math.max(0, effectiveBase - mcpBase - skillsBase);
                        weights.system_rules += sysBase;
                        weights.mcp += mcpBase;
                        weights.skills += skillsBase;
                        if (preambleBase > effectiveBase) {
                            weights.files += preambleBase - effectiveBase;
                        }
                    } else {
                        // Rotated / windowed transcript starting mid-conversation
                        const fixedSystem = Math.min(preambleBase, 18500);
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
                    if (cacheTok === 0 && inTok > 25000) {
                        cacheMissCount++;
                    }
                    if (prevPromptTokens !== null && prevPromptTokens > 30000 && promptTok < prevPromptTokens * 0.78 && (prevPromptTokens - promptTok) > 10000) {
                        compactionEvents++;
                        // Reset volatile conversational weights to reflect post-compaction live window
                        weights.files = Math.round(weights.files * 0.18);
                        weights.terminal = Math.round(weights.terminal * 0.12);
                        weights.reasoning_subagents = Math.round(weights.reasoning_subagents * 0.15);
                        weights.messages = Math.max(400, Math.round(weights.messages * 0.25));
                    }
                }

                prevPromptTokens = promptTok;
                lastPlanner = {
                    stepIndex: step.step_index ?? totalSteps - 1,
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

            if (step.type === 'ERROR_MESSAGE') {
                weights.terminal += Math.max(20, estimateTokens(step.error || content));
            }
        }

        const latestSessionModel = modelHistory.length > 0
            ? resolveModelProfile(modelHistory[modelHistory.length - 1].to)
            : (opts.globalFallbackModel ? { ...resolveModelProfile(opts.globalFallbackModel), inferred: true } : resolveModelProfile('auto'));

        const hasOverride = Boolean(opts.modelOverride && opts.modelOverride !== 'auto');
        const activeModel = hasOverride ? resolveModelProfile(opts.modelOverride) : latestSessionModel;

        const activeTokens = lastPlanner ? lastPlanner.activeTokens : 0;
        const promptTokens = lastPlanner ? lastPlanner.promptTokens : 0;
        const inputTokens = lastPlanner ? lastPlanner.inputTokens : 0;
        const cacheReadTokens = lastPlanner ? lastPlanner.cacheReadTokens : 0;
        const outputTokens = lastPlanner ? lastPlanner.outputTokens : 0;

        const contextLimit = activeModel.contextLimit;
        const attentionThreshold = activeModel.attentionThreshold;
        const usedPct = Number(((activeTokens / contextLimit) * 100).toFixed(1));
        const remainingTokens = Math.max(0, contextLimit - activeTokens);
        const overflowTokens = Math.max(0, activeTokens - contextLimit);
        const attentionUsedPct = Number(((activeTokens / attentionThreshold) * 100).toFixed(1));
        const cacheHitRatePct = promptTokens > 0 ? Number(((cacheReadTokens / promptTokens) * 100).toFixed(1)) : 0;

        let zone = 'OPTIMAL';
        if (activeTokens >= contextLimit) zone = 'OVERFLOW';
        else if (usedPct >= 80) zone = 'CRITICAL';
        else if (activeTokens >= attentionThreshold || usedPct >= 60) zone = 'ATTENTION_WARN';

        const handoffMatrix = buildHandoffMatrix(activeTokens);

        // Detect cross-model handoff ceiling hazards
        let handoffAlert = null;
        if (activeTokens >= contextLimit) {
            handoffAlert = {
                severity: 'danger',
                message: `Context (${activeTokens.toLocaleString()} tok) exceeds ${activeModel.displayName} ceiling (${activeModel.tierLabel}).`
            };
        } else if (modelHistory.length > 1) {
            const narrowestSwitch = modelHistory.reduce((min, item) => Math.min(min, item.contextLimit), Infinity);
            if (activeTokens >= narrowestSwitch && contextLimit > narrowestSwitch) {
                handoffAlert = {
                    severity: 'warn',
                    message: `Session switched models; current ${activeTokens.toLocaleString()} tok exceeds earlier narrower ${Math.round(narrowestSwitch / 1000)}k ceiling.`
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

        const categories = reconcileCategories(weights, activeTokens);

        return {
            title: title || 'Untitled Session',
            startedAt,
            updatedAt,
            totalSteps,
            plannerSteps,
            firstStepIndex: firstStepIndex ?? 0,
            lastStepIndex: lastStepIndex ?? 0,
            rotatedWindow: (firstStepIndex ?? 0) > 2,
            activeTokens,
            promptTokens,
            inputTokens,
            cacheReadTokens,
            outputTokens,
            totalOutputTokensGenerated,
            cacheHitRatePct,
            cacheMissCount,
            compactionEvents,
            activeModel: {
                id: activeModel.id,
                displayName: activeModel.displayName,
                family: activeModel.family,
                contextLimit,
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
            if (!convId || !SAFE_ID_RE.test(convId) || /^\.+$/.test(convId)) return null;
            return path.join(brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl');
        }

        function readHead(filePath, maxBytes = 8192) {
            const fd = fs.openSync(filePath, 'r');
            try {
                const buf = Buffer.allocUnsafe(maxBytes);
                const n = fs.readSync(fd, buf, 0, maxBytes, 0);
                return buf.subarray(0, n).toString('utf8');
            } finally {
                fs.closeSync(fd);
            }
        }

        const summaryCache = new Map();

        function detectLatestGlobalModel(brainDir) {
            try {
                if (!fs.existsSync(brainDir)) return null;
                const entries = fs.readdirSync(brainDir, { withFileTypes: true })
                    .filter((d) => d.isDirectory() && SAFE_ID_RE.test(d.name))
                    .map((d) => {
                        const tp = getTranscriptPath(brainDir, d.name);
                        let mtimeMs = 0;
                        try {
                            if (tp && fs.existsSync(tp)) mtimeMs = fs.statSync(tp).mtimeMs;
                        } catch {}
                        return { id: d.name, tp, mtimeMs };
                    })
                    .filter((x) => x.mtimeMs > 0)
                    .sort((a, b) => b.mtimeMs - a.mtimeMs);

                for (const item of entries.slice(0, 8)) {
                    const head = readHead(item.tp, 8192);
                    const firstLine = head.split(/\r?\n/)[0];
                    if (!firstLine) continue;
                    try {
                        const step = JSON.parse(firstLine);
                        if (step && step.type === 'USER_INPUT') {
                            const changes = extractModelChangesFromUserInput(step.content);
                            if (changes.length > 0) return changes[changes.length - 1].to;
                        }
                    } catch {}
                }
            } catch {}
            return null;
        }

        function readSubagentSummary(brainDir, convId, visited, fallbackHint) {
            if (visited.has(convId)) return null;
            visited.add(convId);
            const tp = getTranscriptPath(brainDir, convId);
            if (!tp || !fs.existsSync(tp)) return null;
            try {
                const raw = fs.readFileSync(tp, 'utf8');
                const parsed = analyzeTranscriptText(raw, {
                    globalFallbackModel: fallbackHint || undefined
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
            const analysis = analyzeTranscriptText(raw, {
                modelOverride: opts.modelOverride || 'auto',
                globalFallbackModel: globalFallback,
                mcpBaselineRatio: ratios.mcpBaselineRatio,
                skillsBaselineRatio: ratios.skillsBaselineRatio
            });

            const visited = new Set([convId]);
            let offloadedTokens = 0;
            const enrichedSubagents = analysis.subagents.map((sub) => {
                let hint = null;
                if (sub.requestedModel === 'flash') hint = 'gemini-3.8-flash-medium';
                else if (sub.requestedModel === 'flash_lite') hint = 'gemini-3.8-flash-low';
                else if (sub.requestedModel === 'pro') hint = 'gemini-4-argon-high';
                else if (sub.requestedModel === 'inherit' || !sub.requestedModel) hint = analysis.activeModel.id;
                const summary = readSubagentSummary(brainDir, sub.conversationId, visited, hint);
                if (summary) offloadedTokens += summary.activeTokens;
                return {
                    ...sub,
                    activeTokens: summary ? summary.activeTokens : 0,
                    plannerSteps: summary ? summary.plannerSteps : 0,
                    model: summary ? summary.model : (hint ? resolveModelProfile(hint).displayName : sub.requestedModel),
                    available: Boolean(summary)
                };
            });

            return {
                conversationId: convId,
                transcriptPath: tp,
                fileSize: stat.size,
                mtimeMs: stat.mtimeMs,
                ...analysis,
                subagents: enrichedSubagents,
                offloadedTokens
            };
        }

        function listRecentConversations(opts = {}) {
            const brainDir = findBrainDir(opts.brainDir);
            if (!fs.existsSync(brainDir)) return [];
            const dbDir = findConversationsDbDir(brainDir);
            const limit = Math.max(1, Math.min(50, Number(opts.limit) || 15));
            const globalFallback = detectLatestGlobalModel(brainDir);

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
                    const cacheKey = `${tpStat.mtimeMs}:${tpStat.size}:${globalFallback || ''}`;
                    let summary = summaryCache.get(c.conversationId);
                    if (!summary || summary.cacheKey !== cacheKey) {
                        const raw = fs.readFileSync(c.tp, 'utf8');
                        const parsed = analyzeTranscriptText(raw, { globalFallbackModel: globalFallback });
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
                        tierLabel: s.activeModel.tierLabel,
                        modelName: s.activeModel.displayName,
                        zone: s.zone,
                        plannerSteps: s.plannerSteps
                    });
                } catch {}
            }
            return results;
        }

        return {
            MODEL_CATALOG,
            MODEL_TIERS,
            CATEGORY_META,
            resolveModelProfile,
            estimateTokens,
            classifyToolName,
            reconcileCategories,
            analyzeTranscriptText,
            analyzeConversationDir,
            listRecentConversations,
            findBrainDir
        };
    }

    return {
        MODEL_CATALOG,
        MODEL_TIERS,
        CATEGORY_META,
        resolveModelProfile,
        estimateTokens,
        classifyToolName,
        reconcileCategories,
        analyzeTranscriptText,
        createContextAnalyzer
    };
});
