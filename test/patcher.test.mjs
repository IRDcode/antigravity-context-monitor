import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as asar from '@electron/asar';
import {
    MODEL_CATALOG,
    MODEL_TIERS,
    analyzeConversationDir,
    analyzeTranscriptText,
    buildCompactSummary,
    createContextAnalyzer,
    createSettingsStore,
    detectLatestGlobalModel,
    discoverModels,
    resolveContextPayload,
    resolveModelProfile,
    sanitizeSettings
} from '../src/context-analyzer.mjs';
import {
    ANCHOR,
    FALLBACK_ANCHOR,
    LEGACY_ANCHOR,
    PATCH_MARKER,
    PatchError,
    computeExpectedPayloadHash,
    extractPayloadHash,
    findInjectionAnchor,
    getDefaultAppAsarPath,
    getPatchStatus,
    getSidecarInstallDir,
    isSidecarPluginInstalled,
    parseCliArgs,
    patchAsar,
    resolveAsarTarget,
    restoreAsar,
    runDoctor,
    syncCoreToSidecar
} from '../src/patcher.mjs';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ag-ctx-mon-'));

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listUnpackedEntries(asarPath) {
    const raw = asar.getRawHeader(asarPath);
    const out = [];
    function walk(node, prefix) {
        for (const [k, v] of Object.entries(node.files || {})) {
            const p = prefix ? `${prefix}/${k}` : k;
            if ('files' in v) walk(v, p);
            else if (v.unpacked) out.push(p);
        }
    }
    walk(raw.header, '');
    return out.sort();
}

async function createSampleAsar(dir, utilsCode, pkgVersion = '2.34.0') {
    const src = path.join(dir, 'src');
    fs.mkdirSync(path.join(src, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ name: 'antigravity', version: pkgVersion }));
    fs.writeFileSync(path.join(src, 'dist', 'utils.js'), utilsCode);
    const asarPath = path.join(dir, 'app.asar');
    await asar.createPackage(src, asarPath);
    return asarPath;
}

test('v2.34.0 model catalog, ceilings, compaction defaults, and dynamic resolution', () => {
    assert.ok(MODEL_CATALOG.length >= 36);

    const claudeModels = MODEL_CATALOG.filter((m) => m.family === 'claude');
    assert.equal(claudeModels.length, 8);
    for (const m of claudeModels) {
        assert.equal(m.contextLimit, 200000);
        assert.equal(m.compactionLimit, 170000);
        assert.equal(m.tierLabel, '200k');
        assert.equal(resolveModelProfile(m.id).contextLimit, 200000);
        assert.equal(resolveModelProfile(m.displayName).contextLimit, 200000);
    }

    // Claude Max, 1M / 840k variants
    const opusMax = resolveModelProfile('Claude Opus 5.5 (Max)');
    assert.equal(opusMax.id, 'claude-opus-5-5-max');
    assert.equal(opusMax.contextLimit, 200000);
    const sonnetMax = resolveModelProfile('Claude Sonnet 5.5 (Max)');
    assert.equal(sonnetMax.id, 'claude-sonnet-5-5-max');
    assert.equal(sonnetMax.contextLimit, 200000);

    const claude840k = resolveModelProfile('claude-1m_840k');
    assert.equal(claude840k.family, 'claude');
    assert.equal(claude840k.contextLimit, 1000000);
    assert.equal(claude840k.compactionLimit, 840000);
    assert.equal(claude840k.tierLabel, '1M');

    const claude1m = resolveModelProfile('Claude Opus 5.5 (1M)');
    assert.equal(claude1m.contextLimit, 1000000);
    assert.equal(claude1m.compactionLimit, 500000);

    // Gemini 4 Neon / Carbon / Hydrogen / Argon / 3.x / Orchestrator
    const neonX = resolveModelProfile('Gemini 4 Neon (Extra High)');
    assert.equal(neonX.id, 'gemini-4-neon-xhigh');
    assert.equal(neonX.contextLimit, 1000000);
    assert.equal(neonX.compactionLimit, 500000);

    const carbon = resolveModelProfile('Gemini 4 Carbon (High)');
    assert.equal(carbon.id, 'gemini-4-carbon-high');
    assert.equal(carbon.contextLimit, 1000000);

    const hydroOrch = resolveModelProfile('Gemini 4 Hydrogen (Orchestrator)');
    assert.equal(hydroOrch.id, 'gemini-4-hydrogen-orchestrator');
    assert.equal(hydroOrch.isDualPhase, true);
    assert.equal(hydroOrch.contextLimit, 1000000);

    const neonOrch = resolveModelProfile('Orchestrator · Gemini 4 Neon Extra High');
    assert.equal(neonOrch.id, 'orchestrator-gemini-4-neon-xhigh');
    assert.equal(neonOrch.isDualPhase, true);

    const futureOrch = resolveModelProfile('Custom Orchestrator Beta');
    assert.equal(futureOrch.isDualPhase, true);

    // GPT-OSS 120B & 20B
    assert.equal(resolveModelProfile('GPT-OSS 120B (Medium)').contextLimit, 128000);
    assert.equal(resolveModelProfile('GPT-OSS 20B').contextLimit, 128000);

    // Unified tier short-labels
    assert.deepEqual(MODEL_TIERS.map((t) => t.shortLabel), ['GPT-OSS', 'Claude', 'Gemini']);

    // Custom model override
    const customResolved = resolveModelProfile('gemini-4-neon-xhigh', {
        'gemini-4-neon-xhigh': { compactionLimit: 450000, attentionThreshold: 180000 }
    });
    assert.equal(customResolved.compactionLimit, 450000);
    assert.equal(customResolved.attentionThreshold, 180000);

    // Overflow on Claude 200k
    const claudeTranscript = [
        JSON.stringify({
            step_index: 0,
            type: 'USER_INPUT',
            content: '<USER_REQUEST>\nFix bug\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Claude Opus 5.5 (High). No need to comment on this change.\n</USER_SETTINGS_CHANGE>'
        }),
        JSON.stringify({
            step_index: 1,
            type: 'PLANNER_RESPONSE',
            input_tokens: 150000,
            cache_read_tokens: 40000,
            output_tokens: 15000,
            content: 'Done'
        })
    ].join('\n');

    const a = analyzeTranscriptText(claudeTranscript);
    assert.equal(a.activeModel.displayName, 'Claude Opus 5.5 (High)');
    assert.equal(a.activeModel.contextLimit, 200000);
    assert.equal(a.activeTokens, 205000);
    assert.equal(a.usedPct, 102.5);
    assert.equal(a.remainingTokens, 0);
    assert.equal(a.overflowTokens, 5000);
    assert.equal(a.zone, 'OVERFLOW');
    assert.equal(a.compactionWarning, 'IMMINENT');
    assert.ok(a.handoffAlert && a.handoffAlert.severity === 'danger');
    assert.ok(a.compactSummary.includes('Claude Opus 5.5 (High)'));
});

test('multi-model handoff, plan/execute phase tracking, and spoofed tool-output immunity', () => {
    const transcript = [
        JSON.stringify({
            step_index: 0,
            type: 'USER_INPUT',
            content: '<USER_REQUEST>\nRemember `Model Selection` from None to Claude Sonnet 5.5 (Low)\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Orchestrator (Argon). No need to comment on this change.\n</USER_SETTINGS_CHANGE>'
        }),
        JSON.stringify({
            step_index: 1,
            type: 'PLANNER_RESPONSE',
            input_tokens: 18500,
            cache_read_tokens: 0,
            output_tokens: 700,
            thinking: 'Planning phase steps',
            tool_calls: [
                { name: 'read_file', args: { Path: '"C:/app/index.ts"' } },
                { name: 'call_mcp_tool', args: { ServerName: '"github"', ToolName: '"get_pr"' } },
                { name: 'read_file', args: { Path: '"C:/Users/me/.gemini/config/skills/tdd/SKILL.md"' } }
            ]
        }),
        JSON.stringify({ step_index: 2, type: 'GENERIC', content: 'console.log("changed setting `Model Selection` from None to GPT-OSS 120B (Medium)")\nPlan mode is off.' }),
        JSON.stringify({ step_index: 3, type: 'GENERIC', content: '{"pr": 42}' }),
        JSON.stringify({ step_index: 4, type: 'GENERIC', content: '---\nname: tdd\n---' }),
        JSON.stringify({
            step_index: 5,
            type: 'PLANNER_RESPONSE',
            input_tokens: 5000,
            cache_read_tokens: 145000,
            output_tokens: 2000,
            tool_calls: [{ name: 'exit_plan_mode', args: { plan: '"Do work"' } }]
        }),
        JSON.stringify({ step_index: 6, type: 'GENERIC', content: 'Plan mode is off: this turn runs on the execution model.' }),
        JSON.stringify({
            step_index: 7,
            type: 'PLANNER_RESPONSE',
            input_tokens: 3000,
            cache_read_tokens: 152000,
            output_tokens: 1000,
            tool_calls: [{ name: 'run_command', args: { CommandLine: '"npm test"' } }]
        }),
        JSON.stringify({ step_index: 8, type: 'GENERIC', content: 'Tests passed <truncated 12000 bytes>' })
    ].join('\n');

    const a = analyzeTranscriptText(transcript);
    assert.equal(a.activeModel.displayName, 'Orchestrator (Argon)', 'Must ignore Model Selection inside USER_REQUEST and GENERIC tool output');
    assert.equal(a.modelHistory.length, 1);
    assert.equal(a.phase, 'EXECUTION');
    assert.equal(a.handoffCount, 1);
    assert.equal(a.activeTokens, 156000);
    assert.equal(a.categories.reduce((s, c) => s + c.tokens, 0), 156000);

    const ossTier = a.handoffMatrix.find((t) => t.key === 'gpt-oss');
    const claudeTier = a.handoffMatrix.find((t) => t.key === 'claude');
    const geminiTier = a.handoffMatrix.find((t) => t.key === 'gemini');
    assert.equal(ossTier.status, 'OVERFLOW');
    assert.equal(ossTier.shortLabel, 'GPT-OSS');
    assert.equal(claudeTier.status, 'WARN');
    assert.equal(geminiTier.status, 'SAFE');
});

test('CHECKPOINT compaction vs Browser Session Checkpoint vs step_index rewind/retry rollback', () => {
    // 1. Real CHECKPOINT compaction + Browser Session Checkpoint ignored + no double-count on post-checkpoint drop
    const checkpointTranscript = [
        JSON.stringify({
            step_index: 0,
            type: 'USER_INPUT',
            created_at: '2026-11-22T01:00:00Z',
            content: '<USER_REQUEST>\nRefactor core\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 4 Neon (XHigh). No need to comment.\n</USER_SETTINGS_CHANGE>'
        }),
        JSON.stringify({
            step_index: 1,
            type: 'PLANNER_RESPONSE',
            created_at: '2026-11-22T01:01:00Z',
            input_tokens: 12000,
            cache_read_tokens: 495000,
            output_tokens: 1200,
            content: 'Working...'
        }),
        // Browser checkpoint must NOT be counted as session compaction
        JSON.stringify({
            step_index: 2,
            type: 'CHECKPOINT',
            created_at: '2026-11-22T01:02:00Z',
            content: '# Browser Session Checkpoint\nCurrent URL: http://localhost:3000'
        }),
        // Real compaction CHECKPOINT with pre-compaction tokens
        JSON.stringify({
            step_index: 3,
            type: 'CHECKPOINT',
            created_at: '2026-11-22T01:03:00Z',
            input_tokens: 512400,
            cache_read_tokens: 0,
            output_tokens: 6100,
            content: '# Resuming from a compaction\n\nSummary of progress so far.'
        }),
        // Post-compaction turn drops from 512k -> 25k: must populate postCompactTokens, NOT double count!
        JSON.stringify({
            step_index: 4,
            type: 'PLANNER_RESPONSE',
            created_at: '2026-11-22T01:04:00Z',
            input_tokens: 25100,
            cache_read_tokens: 0,
            output_tokens: 500,
            content: 'Continuing after compaction.'
        }),
        // Legacy {{ CHECKPOINT 0 }} marker
        JSON.stringify({
            step_index: 5,
            type: 'CHECKPOINT',
            created_at: '2026-11-22T01:05:00Z',
            content: '{{ CHECKPOINT 0 }}\n**The earlier parts of this conversation were compacted.**'
        }),
        JSON.stringify({
            step_index: 6,
            type: 'PLANNER_RESPONSE',
            created_at: '2026-11-22T01:06:00Z',
            input_tokens: 22000,
            cache_read_tokens: 0,
            output_tokens: 400,
            content: 'After second checkpoint.'
        })
    ].join('\n');

    const cp = analyzeTranscriptText(checkpointTranscript);
    assert.equal(cp.compactionEvents, 2, 'Should count both real CHECKPOINTs, ignore Browser Session Checkpoint, and never double-count post-checkpoint drop');
    assert.equal(cp.compactionHistory.length, 2);
    assert.equal(cp.compactionHistory[0].source, 'checkpoint');
    assert.equal(cp.compactionHistory[0].preCompactTokens, 512400);
    assert.equal(cp.compactionHistory[0].postCompactTokens, 25100);
    assert.equal(cp.compactionLimit, 512400, 'Should adapt compactionLimit to observed CHECKPOINT peak in session');
    assert.equal(cp.compactionLimitSource, 'observed_session');

    // 2. step_index rewind/retry rollback (47 -> 33, prompt drops 108k -> 81k) must NOT trigger compaction or keep dead branch weights
    const rewindTranscript = [
        JSON.stringify({ step_index: 30, type: 'USER_INPUT', content: '<USER_REQUEST>\nBase task\n</USER_REQUEST>' }),
        JSON.stringify({ step_index: 31, type: 'PLANNER_RESPONSE', input_tokens: 78000, cache_read_tokens: 0, output_tokens: 500, content: 'Base reply' }),
        // Abandoned branch (steps 33..47) with massive terminal noise + 108k prompt
        JSON.stringify({ step_index: 33, type: 'USER_INPUT', content: '<USER_REQUEST>\nBad branch\n</USER_REQUEST>' }),
        JSON.stringify({
            step_index: 34,
            type: 'PLANNER_RESPONSE',
            input_tokens: 82000,
            cache_read_tokens: 0,
            output_tokens: 500,
            tool_calls: [{ name: 'run_command', args: { CommandLine: '"npm run huge-dead-log"' } }]
        }),
        JSON.stringify({ step_index: 35, type: 'GENERIC', content: 'DEAD_LOG '.repeat(5000) }),
        JSON.stringify({ step_index: 47, type: 'PLANNER_RESPONSE', input_tokens: 108000, cache_read_tokens: 0, output_tokens: 900, content: 'Dead end' }),
        // Rewind back to step_index 33!
        JSON.stringify({ step_index: 33, type: 'USER_INPUT', content: '<USER_REQUEST>\nRetried clean prompt\n</USER_REQUEST>' }),
        JSON.stringify({ step_index: 34, type: 'PLANNER_RESPONSE', input_tokens: 81000, cache_read_tokens: 0, output_tokens: 600, content: 'Clean retry reply' })
    ].join('\n');

    const rw = analyzeTranscriptText(rewindTranscript);
    assert.equal(rw.compactionEvents, 0, 'Rewind must NEVER falsely increment compactionEvents');
    assert.equal(rw.compactionHistory.length, 0);
    assert.equal(rw.rewindEvents, 1);
    assert.equal(rw.activeTokens, 81600);
    assert.equal(rw.plannerSteps, 2, 'Dead branch planner steps must be rolled back');
    const termCat = rw.categories.find((c) => c.key === 'terminal');
    assert.ok(termCat.pct < 25, `Dead branch terminal weight must be discarded on rewind (got ${termCat.pct}%)`);
});

test('compactWarnPct, compactionLimit (~500k on 1M), compactionWarning, and USER_INPUT-only pending state', () => {
    const makeTurn = (promptTok) => [
        JSON.stringify({
            step_index: 0,
            type: 'USER_INPUT',
            content: '<USER_REQUEST>\nWork\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 4 Neon (XHigh).\n</USER_SETTINGS_CHANGE>'
        }),
        JSON.stringify({
            step_index: 1,
            type: 'PLANNER_RESPONSE',
            input_tokens: promptTok,
            cache_read_tokens: 0,
            output_tokens: 0
        })
    ].join('\n');

    const safe = analyzeTranscriptText(makeTurn(300000), { compactWarnPct: 70 });
    assert.equal(safe.compactionLimit, 500000);
    assert.equal(safe.compactionPct, 60);
    assert.equal(safe.tokensUntilCompaction, 200000);
    assert.equal(safe.compactionWarning, 'NONE');

    const approaching = analyzeTranscriptText(makeTurn(360000), { compactWarnPct: 70 });
    assert.equal(approaching.compactionPct, 72);
    assert.equal(approaching.tokensUntilCompaction, 140000);
    assert.equal(approaching.compactionWarning, 'APPROACHING');

    // Raising compactWarnPct to 80 suppresses warning at 72%
    const customThreshold = analyzeTranscriptText(makeTurn(360000), { compactWarnPct: 80 });
    assert.equal(customThreshold.compactionWarning, 'NONE');

    const imminent = analyzeTranscriptText(makeTurn(460000), { compactWarnPct: 70 });
    assert.equal(imminent.compactionPct, 92);
    assert.equal(imminent.compactionWarning, 'IMMINENT');
    assert.equal(imminent.zone, 'CRITICAL');

    // USER_INPUT-only pending state
    const pendingTranscript = JSON.stringify({
        step_index: 0,
        type: 'USER_INPUT',
        content: '<USER_REQUEST>\nAnalyze this large architecture specification before responding.\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 4 Carbon (High).\n</USER_SETTINGS_CHANGE>'
    });
    const pending = analyzeTranscriptText(pendingTranscript);
    assert.equal(pending.pendingFirstResponse, true);
    assert.ok(pending.estimatedPendingPromptTokens > 0);
    assert.equal(pending.activeTokens, 0);
    assert.equal(pending.compactionWarning, 'NONE');
    assert.equal(pending.categories.reduce((s, c) => s + c.tokens, 0), pending.estimatedPendingPromptTokens);
    assert.ok(pending.categories.find((c) => c.key === 'messages').tokens > 0);
});

test('discoverModels, detectLatestGlobalModel mid-session switches, and createSettingsStore customModels', () => {
    const root = tmpDir();
    try {
        const brain = path.join(root, 'brain');
        const c1 = 'aaaaaaaa-1111-1111-1111-111111111111';
        const c2 = 'bbbbbbbb-2222-2222-2222-222222222222';
        fs.mkdirSync(path.join(brain, c1, '.system_generated', 'logs'), { recursive: true });
        fs.mkdirSync(path.join(brain, c2, '.system_generated', 'logs'), { recursive: true });

        // c1 starts with Gemini 3.8 Flash, then switches > 12KB later mid-session to a future model
        const bigPadding = 'x'.repeat(12000);
        fs.writeFileSync(
            path.join(brain, c1, '.system_generated', 'logs', 'transcript.jsonl'),
            [
                JSON.stringify({
                    step_index: 0,
                    type: 'USER_INPUT',
                    created_at: '2026-11-22T01:00:00Z',
                    content: '<USER_REQUEST>\nStart\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 3.8 Flash (High).\n</USER_SETTINGS_CHANGE>'
                }),
                JSON.stringify({ step_index: 1, type: 'GENERIC', content: bigPadding }),
                JSON.stringify({
                    step_index: 2,
                    type: 'USER_INPUT',
                    created_at: '2026-11-22T02:00:00Z',
                    content: '<USER_REQUEST>\nSwitch\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from Gemini 3.8 Flash (High) to Gemini 5 Xenon (Ultra).\n</USER_SETTINGS_CHANGE>'
                })
            ].join('\n')
        );

        // Older session c2
        fs.writeFileSync(
            path.join(brain, c2, '.system_generated', 'logs', 'transcript.jsonl'),
            JSON.stringify({
                step_index: 0,
                type: 'USER_INPUT',
                created_at: '2026-11-21T01:00:00Z',
                content: '<USER_REQUEST>\nOld\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Claude Opus 5.5 (High).\n</USER_SETTINGS_CHANGE>'
            })
        );

        assert.equal(detectLatestGlobalModel(brain), 'Gemini 5 Xenon (Ultra)', 'Must read mid-session model switches past 8KB head');

        const discovered = discoverModels({
            brainDir: brain,
            customModels: {
                'my-custom-2m': { contextLimit: 2000000, compactionLimit: 900000, attentionThreshold: 300000, isDualPhase: false },
                '__proto__': { contextLimit: 999999 }
            },
            domModels: [
                'Gemini 4 Neon (Extra High)', // duplicate of built-in XHigh -> must dedupe!
                'Claude Sonnet 6.0 (Max)',     // new future model from DOM -> must appear!
                '<script>alert(1)</script>',   // unsafe -> must reject!
                'Random Button Text'           // non-model UI text -> must reject!
            ]
        });

        assert.ok(discovered.some((m) => m.id === 'my-custom-2m' && m.contextLimit === 2000000 && m.source === 'custom'));
        assert.ok(discovered.some((m) => m.id === 'Gemini 5 Xenon (Ultra)' && m.source === 'transcript'));
        assert.ok(discovered.some((m) => m.id === 'Claude Sonnet 6.0 (Max)' && m.contextLimit === 200000 && m.source === 'dom'));
        assert.equal(discovered.filter((m) => /^gemini 4 neon.*(?:xhigh|extra high)/i.test(m.displayName)).length, 1, 'Extra High & XHigh must deduplicate');
        assert.ok(!discovered.some((m) => m.source === 'dom' && /gemini 4 neon/i.test(m.displayName)), 'DOM alias for built-in Neon Extra High must not duplicate');
        assert.ok(!discovered.some((m) => m.id.includes('script') || m.id.includes('Random')));

        // Settings store persistence & sanitization
        const cfgFile = path.join(root, 'settings.json');
        const store = createSettingsStore({ fs, path, os, settingsPath: cfgFile });
        const saved = store.writeSettingsPatch({
            compactWarnPct: 78,
            modelOverride: 'Orchestrator · Gemini 4 Neon Extra High',
            customModels: {
                'custom-model-a': { contextLimit: 500000, compactionLimit: 350000, attentionThreshold: 120000, isDualPhase: true },
                'bad<model>': { contextLimit: 100000 }
            }
        });
        assert.equal(saved.compactWarnPct, 78);
        assert.equal(saved.modelOverride, 'Orchestrator · Gemini 4 Neon Extra High');
        assert.deepEqual(Object.keys(saved.customModels), ['custom-model-a']);
        assert.equal(store.readSettings().customModels['custom-model-a'].compactionLimit, 350000);

        const sanitized = sanitizeSettings({ selectedConvId: '../escape/path', compactWarnPct: 12 });
        assert.equal(sanitized.selectedConvId, undefined);
        assert.equal(sanitized.compactWarnPct, undefined);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('New Session (empty_new) non-fallback behavior for both Titlebar and Sidecar', () => {
    const root = tmpDir();
    try {
        const brain = path.join(root, 'brain');
        const oldConv = '11111111-1111-1111-1111-111111111111';
        const freshUuid = '99999999-9999-9999-9999-999999999999';
        fs.mkdirSync(path.join(brain, oldConv, '.system_generated', 'logs'), { recursive: true });
        fs.writeFileSync(
            path.join(brain, oldConv, '.system_generated', 'logs', 'transcript.jsonl'),
            [
                JSON.stringify({ step_index: 0, type: 'USER_INPUT', content: '<USER_REQUEST>\nPrevious chat\n</USER_REQUEST>' }),
                JSON.stringify({ step_index: 1, type: 'PLANNER_RESPONSE', input_tokens: 95000, cache_read_tokens: 0, output_tokens: 500 })
            ].join('\n')
        );

        // 1. Titlebar empty New Session screen (rendererConvId === '' + isNewSessionUi === true) must NOT fall back to recent[0]
        const emptyTitlebar = resolveContextPayload({
            brainDir: brain,
            config: { selectedConvId: 'auto', modelOverride: 'auto' },
            rendererConvId: '',
            isNewSessionUi: true
        });
        assert.equal(emptyTitlebar.sessionState, 'empty_new');
        assert.equal(emptyTitlebar.resolvedBy, 'empty_new');
        assert.equal(emptyTitlebar.analysis, null);
        assert.equal(emptyTitlebar.recentConversations.length, 1);

        // 2. Titlebar fresh UUID with no transcript.jsonl yet must NOT fall back to recent[0]
        const freshTitlebar = resolveContextPayload({
            brainDir: brain,
            config: { selectedConvId: 'auto', modelOverride: 'auto' },
            rendererConvId: freshUuid,
            isNewSessionUi: false
        });
        assert.equal(freshTitlebar.sessionState, 'empty_new');
        assert.equal(freshTitlebar.resolvedBy, 'empty_new');
        assert.equal(freshTitlebar.targetConversationId, freshUuid);
        assert.equal(freshTitlebar.analysis, null);

        // 3. Sidecar hostConvId with no transcript yet must NOT fall back to recent[0]
        const freshSidecar = resolveContextPayload({
            brainDir: brain,
            config: { selectedConvId: 'auto', modelOverride: 'auto' },
            hostConvId: freshUuid
        });
        assert.equal(freshSidecar.sessionState, 'empty_new');
        assert.equal(freshSidecar.resolvedBy, 'empty_new');
        assert.equal(freshSidecar.hostConversationId, freshUuid);
        assert.equal(freshSidecar.analysis, null);

        // 4. Existing hostConvId resolves active session
        const activeSidecar = resolveContextPayload({
            brainDir: brain,
            config: { selectedConvId: 'auto', modelOverride: 'auto' },
            hostConvId: oldConv
        });
        assert.equal(activeSidecar.sessionState, 'active');
        assert.equal(activeSidecar.resolvedBy, 'host');
        assert.equal(activeSidecar.analysis.activeTokens, 95500);

        // 5. Once freshUuid receives USER_INPUT, it transitions to pending
        fs.mkdirSync(path.join(brain, freshUuid, '.system_generated', 'logs'), { recursive: true });
        fs.writeFileSync(
            path.join(brain, freshUuid, '.system_generated', 'logs', 'transcript.jsonl'),
            JSON.stringify({ step_index: 0, type: 'USER_INPUT', content: '<USER_REQUEST>\nHello new session\n</USER_REQUEST>' })
        );
        const pendingSidecar = resolveContextPayload({
            brainDir: brain,
            config: { selectedConvId: 'auto', modelOverride: 'auto' },
            hostConvId: freshUuid
        });
        assert.equal(pendingSidecar.sessionState, 'pending');
        assert.equal(pendingSidecar.resolvedBy, 'host');
        assert.equal(pendingSidecar.analysis.pendingFirstResponse, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('rotated transcripts, compaction drops, and isolated subagent discovery', () => {
    const root = tmpDir();
    try {
        const brain = path.join(root, 'brain');
        const parentId = '11111111-1111-1111-1111-111111111111';
        const childId = '22222222-2222-2222-2222-222222222222';
        fs.mkdirSync(path.join(brain, parentId, '.system_generated', 'logs'), { recursive: true });
        fs.mkdirSync(path.join(brain, childId, '.system_generated', 'logs'), { recursive: true });

        fs.writeFileSync(
            path.join(brain, parentId, '.system_generated', 'logs', 'transcript.jsonl'),
            [
                JSON.stringify({
                    step_index: 469,
                    type: 'USER_INPUT',
                    content: '<USER_REQUEST>\nContinue render check\n</USER_REQUEST>'
                }),
                JSON.stringify({
                    step_index: 470,
                    type: 'PLANNER_RESPONSE',
                    input_tokens: 500000,
                    cache_read_tokens: 0,
                    output_tokens: 1000,
                    tool_calls: [{ name: 'invoke_subagent', args: { Role: '"Codebase Researcher"', TypeName: '"research"', Model: '"flash"' } }]
                }),
                JSON.stringify({
                    step_index: 471,
                    type: 'GENERIC',
                    content: `Created the following subagent:\n{"conversationId": "${childId}"}`
                }),
                // Monotonic compaction drop in rotated log lacking CHECKPOINT
                JSON.stringify({
                    step_index: 472,
                    type: 'PLANNER_RESPONSE',
                    input_tokens: 80000,
                    cache_read_tokens: 10000,
                    output_tokens: 500,
                    content: 'Compacted'
                })
            ].join('\n')
        );

        fs.writeFileSync(
            path.join(brain, childId, '.system_generated', 'logs', 'transcript.jsonl'),
            JSON.stringify({
                step_index: 1,
                type: 'PLANNER_RESPONSE',
                input_tokens: 42000,
                cache_read_tokens: 0,
                output_tokens: 800
            })
        );

        const a = analyzeConversationDir(parentId, { brainDir: brain });
        assert.equal(a.rotatedWindow, true);
        assert.equal(a.compactionEvents, 1);
        assert.equal(a.compactionHistory[0].source, 'prompt_drop');
        assert.equal(a.activeTokens, 90500);
        assert.equal(a.categories.reduce((s, c) => s + c.tokens, 0), 90500);
        assert.equal(a.subagents.length, 1);
        assert.equal(a.subagents[0].conversationId, childId);
        assert.equal(a.subagents[0].activeTokens, 42800);
        assert.equal(a.offloadedTokens, 42800);
        assert.ok(buildCompactSummary(a).includes('Compaction:'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('multi-anchor patching (v2.34.0 loadHubWindowUrl, legacy, invokeWindowLoadUrl), SHA-256 upgrade, and WeakSet idempotency', async () => {
    const root = tmpDir();
    try {
        // 1. Priority ordering verification
        const bothAnchors = `async function invokeWindowLoadUrl(win, url) {\n    await win.loadURL(url);\n}\nfunction createWindow(win, url, hubContents) {\n    const skipBootstrapMint = false;\n    void loadHubWindowUrl(win, url, { skipBootstrapMint });\n    return win;\n}\n`;
        assert.equal(findInjectionAnchor(bothAnchors), ANCHOR);
        assert.equal(findInjectionAnchor('void win.loadURL(url);'), LEGACY_ANCHOR);
        assert.equal(findInjectionAnchor('async function f(win, url) { await win.loadURL(url); }'), FALLBACK_ANCHOR);

        // 2. Patch + SHA-256 upgrade test on v2.34.0 loadHubWindowUrl
        const dir234 = path.join(root, 'v234');
        fs.mkdirSync(dir234);
        const asar234 = await createSampleAsar(dir234, bothAnchors, '2.34.0');
        const origHash = sha256File(asar234);

        const p1 = patchAsar(asar234, { ifNeeded: true, syncSidecar: false });
        assert.equal(p1.changed, true);
        assert.equal(p1.anchorMatch, ANCHOR);
        assert.equal(p1.payloadHash, computeExpectedPayloadHash());

        const p2 = patchAsar(asar234, { ifNeeded: true, syncSidecar: false });
        assert.equal(p2.changed, false);
        assert.equal(p2.status, 'already_patched');

        // Simulate stale payload SHA-256 inside app.asar -> patch --if-needed MUST automatically upgrade
        const patchedUtils = asar.extractFile(asar234, 'dist/utils.js').toString('utf8');
        const staleUtils = patchedUtils.replace(/AG_CTX_PAYLOAD_SHA256:\s*[0-9a-f]+/i, 'AG_CTX_PAYLOAD_SHA256: 0000000000000000');
        assert.notEqual(extractPayloadHash(staleUtils), computeExpectedPayloadHash());
        const staleDir = path.join(root, 'stale');
        fs.mkdirSync(staleDir);
        const staleAsar = await createSampleAsar(staleDir, staleUtils, '2.34.0');

        const staleStatus = getPatchStatus(staleAsar);
        assert.equal(staleStatus.state, 'legacy_or_stale');
        assert.equal(staleStatus.needsUpgrade, true);

        const upgraded = patchAsar(staleAsar, { ifNeeded: true, syncSidecar: false });
        assert.equal(upgraded.changed, true);
        assert.equal(upgraded.upgraded, true);
        assert.equal(getPatchStatus(staleAsar).state, 'patched');

        const restored234 = restoreAsar(asar234, { removeSidecar: false });
        assert.equal(restored234.mode, 'exact_backup');
        assert.equal(sha256File(asar234), origHash);

        // 3. Fallback invokeWindowLoadUrl (await win.loadURL(url);) + WeakSet multi-invoke idempotency
        const dirFallback = path.join(root, 'fallback');
        fs.mkdirSync(dirFallback);
        const fallbackCode = `
let __hubMap = new WeakMap();
function getHubWebContents(win) { return __hubMap.get(win); }
exports.setHub = (win, wc) => __hubMap.set(win, wc);
exports.invokeWindowLoadUrl = async function invokeWindowLoadUrl(win, url) {
    await win.loadURL(url);
};
`;
        const asarFb = await createSampleAsar(dirFallback, fallbackCode, '2.35.0');
        const pFb = patchAsar(asarFb, { ifNeeded: true, syncSidecar: false });
        assert.equal(pFb.changed, true);
        assert.equal(pFb.anchorMatch, FALLBACK_ANCHOR);

        const fbUtils = asar.extractFile(asarFb, 'dist/utils.js').toString('utf8');
        const mod = { exports: {} };
        const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
        new Function('module', 'exports', 'require', '__dirname', fbUtils)(mod, mod.exports, createRequire(import.meta.url), srcDir);

        const listenerCounts = {};
        const win = {
            loadURL: async () => {},
            on: (ev) => { listenerCounts['win:' + ev] = (listenerCounts['win:' + ev] || 0) + 1; }
        };
        const wc = {
            on: (ev) => { listenerCounts['wc:' + ev] = (listenerCounts['wc:' + ev] || 0) + 1; },
            once: (ev) => { listenerCounts['wc:once:' + ev] = (listenerCounts['wc:once:' + ev] || 0) + 1; },
            getURL: () => 'http://127.0.0.1:4555/',
            isDestroyed: () => false,
            executeJavaScript: () => Promise.resolve()
        };
        mod.exports.setHub(win, wc);

        // Invoke 3 times on same window/WebContents -> WeakSet must keep listener count at 1
        await mod.exports.invokeWindowLoadUrl(win, 'http://127.0.0.1:4555/');
        await mod.exports.invokeWindowLoadUrl(win, 'http://127.0.0.1:4555/');
        await mod.exports.invokeWindowLoadUrl(win, 'http://127.0.0.1:4555/');
        assert.equal(listenerCounts['wc:dom-ready'], 1);
        assert.equal(listenerCounts['wc:console-message'], 1);
        assert.equal(listenerCounts['wc:did-navigate-in-page'], 1);
        assert.equal(listenerCounts['win:closed'], 1);

        const rFb = restoreAsar(asarFb, { removeSidecar: false });
        assert.equal(rFb.restored, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('security audit: 127.0.0.1 guard, config sanitization, zero network, module.exports intact, empty_new poll, valid JS', async () => {
    const root = tmpDir();
    const prevHome = process.env.HOME;
    const prevUserProfile = process.env.USERPROFILE;
    try {
        process.env.HOME = root;
        process.env.USERPROFILE = root;

        const asarPath = await createSampleAsar(
            root,
            'function loadHubWindowUrl() {}\nexports.createWindow = (win, url, hubContents) => {\n    const skipBootstrapMint = false;\n    void loadHubWindowUrl(win, url, { skipBootstrapMint });\n    return win;\n};\n'
        );
        patchAsar(asarPath, { syncSidecar: true, homeDir: root });
        assert.equal(isSidecarPluginInstalled(root), true);
        assert.ok(fs.existsSync(path.join(getSidecarInstallDir(root), 'sidecars', 'panel', 'context-core.cjs')));

        const utilsCode = asar.extractFile(asarPath, 'dist/utils.js').toString('utf8');
        assert.ok(!utilsCode.includes('api.github.com'));
        assert.ok(!utilsCode.includes('openExternal'));
        assert.ok(!/\bfetch\s*\(/.test(utilsCode));
        assert.ok(!utilsCode.includes('a[href*="/brain/"]'), 'Unsafe /brain/ link fallback must be removed');

        const cfgPath = path.join(root, '.antigravity-context-monitor.json');
        fs.writeFileSync(cfgPath, JSON.stringify({
            modelOverride: '"><script>alert(1)</script>',
            selectedConvId: '../../etc/passwd',
            compactWarnPct: 999,
            evilKey: 'drop'
        }));

        const handlers = {};
        const winHandlers = {};
        let currentUrl = 'https://evil.example/page';
        const executedScripts = [];
        const win = {
            loadURL() {},
            on: (ev, fn) => { winHandlers[ev] = fn; }
        };
        const hubContents = {
            on: (ev, fn) => { handlers[ev] = fn; },
            once: (ev, fn) => { handlers[ev] = fn; },
            getURL: () => currentUrl,
            isDestroyed: () => false,
            executeJavaScript: (code) => { executedScripts.push(code); return Promise.resolve(); }
        };

        const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
        const mod = { exports: {} };
        new Function('module', 'exports', 'require', '__dirname', utilsCode)(mod, mod.exports, createRequire(import.meta.url), srcDir);
        assert.equal(typeof mod.exports.createWindow, 'function');

        mod.exports.createWindow(win, 'http://127.0.0.1:4555/', hubContents);
        assert.equal(typeof mod.exports.createWindow, 'function', 'Embedded context-core must never overwrite outer module.exports');

        // Untrusted origin must NOT inject or write config
        handlers['dom-ready']();
        assert.equal(executedScripts.length, 0);
        handlers['console-message']({}, 0, 'AG_CTX_SAVE|{"modelOverride":"claude-opus-5-5-high"}');
        assert.ok(JSON.parse(fs.readFileSync(cfgPath, 'utf8')).modelOverride.includes('script'));

        // Trusted 127.0.0.1 origin injects valid JS and sanitizes console config saves
        currentUrl = 'http://127.0.0.1:4555/';
        handlers['dom-ready']();
        assert.equal(executedScripts.length, 1);
        assert.doesNotThrow(() => new vm.Script(executedScripts[0]), 'Injected client script must parse cleanly');

        handlers['console-message']({ message: 'AG_CTX_SAVE|{"modelOverride":"claude-opus-5-5-high","compactWarnPct":80,"badKey":"ignored"}' });
        const saved = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        assert.equal(saved.modelOverride, 'claude-opus-5-5-high');
        assert.equal(saved.compactWarnPct, 80);
        assert.equal(saved.badKey, undefined);

        // AG_CTX_POLL with empty New Session emits sessionState === 'empty_new' and analysis === null
        handlers['console-message']({
            message: 'AG_CTX_POLL|{"detectedConvId":"","isNewSessionUi":true,"domModels":["Gemini 4 Neon (Extra High)"],"routeTransition":true}'
        });
        const lastPush = executedScripts[executedScripts.length - 1];
        assert.ok(lastPush.includes('"sessionState":"empty_new"'));
        assert.ok(lastPush.includes('"analysis":null'));

        winHandlers['closed']?.();

        const res = restoreAsar(asarPath, { removeSidecar: true, homeDir: root });
        assert.equal(res.restored, true);
        assert.equal(res.mode, 'exact_backup');
        assert.equal(isSidecarPluginInstalled(root), false);
    } finally {
        process.env.HOME = prevHome;
        process.env.USERPROFILE = prevUserProfile;
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('composable multi-mod coexistence with antigravity-rtl on v2.34.0 and legacy anchors in both orders', async () => {
    const rtlPatcherUrl = new URL('../../antigravity-rtl/src/patcher.mjs', import.meta.url);
    if (!fs.existsSync(fileURLToPath(rtlPatcherUrl))) return;
    const rtl = await import(rtlPatcherUrl.href);

    const root = tmpDir();
    try {
        const fixtures = [
            {
                name: 'v234',
                version: '2.34.0',
                code: 'function loadHubWindowUrl() {}\nmodule.exports = (win, url, hubContents) => {\n    const skipBootstrapMint = false;\n    void loadHubWindowUrl(win, url, { skipBootstrapMint });\n    return win;\n};\n'
            },
            {
                name: 'legacy',
                version: '2.32.1',
                code: 'module.exports = (win, url, hubContents) => {\n    void win.loadURL(url);\n    return win;\n};\n'
            }
        ];

        for (const fx of fixtures) {
            // Order A: RTL -> Context -> restore RTL -> restore Context
            const dirA = path.join(root, `${fx.name}-orderA`);
            fs.mkdirSync(dirA);
            const asarA = await createSampleAsar(dirA, fx.code, fx.version);
            const origHashA = sha256File(asarA);

            assert.equal(rtl.patchAsar(asarA, { ifNeeded: true }).changed, true);
            assert.equal(patchAsar(asarA, { ifNeeded: true, syncSidecar: false }).changed, true);

            const utilsA = asar.extractFile(asarA, 'dist/utils.js').toString('utf8');
            assert.ok(utilsA.includes(PATCH_MARKER));
            assert.ok(utilsA.includes(rtl.PATCH_MARKER));
            assert.doesNotThrow(() => new vm.Script(utilsA));

            const rRtl = rtl.restoreAsar(asarA);
            assert.equal(rRtl.mode, 'strip_preserve_sibling');
            assert.equal(getPatchStatus(asarA).state, 'patched');
            assert.equal(rtl.getPatchStatus(asarA).state, 'unpatched');

            const rCtx = restoreAsar(asarA, { removeSidecar: false });
            assert.equal(rCtx.mode, 'exact_backup');
            assert.equal(sha256File(asarA), origHashA);

            // Order B: Context -> RTL -> restore Context -> restore RTL
            const dirB = path.join(root, `${fx.name}-orderB`);
            fs.mkdirSync(dirB);
            const asarB = await createSampleAsar(dirB, fx.code, fx.version);
            const origHashB = sha256File(asarB);

            assert.equal(patchAsar(asarB, { ifNeeded: true, syncSidecar: false }).changed, true);
            assert.equal(rtl.patchAsar(asarB, { ifNeeded: true }).changed, true);

            const utilsB = asar.extractFile(asarB, 'dist/utils.js').toString('utf8');
            assert.ok(utilsB.includes(PATCH_MARKER));
            assert.ok(utilsB.includes(rtl.PATCH_MARKER));
            assert.doesNotThrow(() => new vm.Script(utilsB));

            const rCtxB = restoreAsar(asarB, { removeSidecar: false });
            assert.equal(rCtxB.mode, 'strip_preserve_sibling');
            assert.equal(rtl.getPatchStatus(asarB).state, 'patched');
            assert.equal(getPatchStatus(asarB).state, 'unpatched');

            const rRtlB = rtl.restoreAsar(asarB);
            assert.equal(rRtlB.mode, 'exact_backup');
            assert.equal(sha256File(asarB), origHashB);
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('CLI argument validation rejects missing or flag-adjacent values for --path, --conv, and --model', () => {
    assert.throws(() => parseCliArgs(['status', '--path']), (err) => err instanceof PatchError && err.code === 'MISSING_PATH_VALUE');
    assert.throws(() => parseCliArgs(['status', '--path', '--json']), (err) => err instanceof PatchError && err.code === 'MISSING_PATH_VALUE');
    assert.throws(() => parseCliArgs(['analyze', '--conv']), (err) => err instanceof PatchError && err.code === 'MISSING_CONV_VALUE');
    assert.throws(() => parseCliArgs(['analyze', '--conv', '--json']), (err) => err instanceof PatchError && err.code === 'MISSING_CONV_VALUE');
    assert.throws(() => parseCliArgs(['analyze', '--model']), (err) => err instanceof PatchError && err.code === 'MISSING_MODEL_VALUE');
    assert.throws(() => parseCliArgs(['analyze', '--model', '--json']), (err) => err instanceof PatchError && err.code === 'MISSING_MODEL_VALUE');

    const valid = parseCliArgs(['analyze', '--conv', '11111111-1111-1111-1111-111111111111', '--model', 'gemini-4-neon-xhigh', '--json']);
    assert.equal(valid.cmd, 'analyze');
    assert.equal(valid.convId, '11111111-1111-1111-1111-111111111111');
    assert.equal(valid.modelOverride, 'gemini-4-neon-xhigh');
    assert.equal(valid.json, true);
});

test('installed Antigravity app.asar copy (when present): preserves unpacked entries and diagnostics work', () => {
    const liveAsar = process.env.ANTIGRAVITY_ASAR_PATH || getDefaultAppAsarPath();
    if (!liveAsar || !fs.existsSync(liveAsar)) return;

    const root = tmpDir();
    try {
        const copyAsar = path.join(root, 'app.asar');
        fs.copyFileSync(liveAsar, copyAsar);
        const origUnpacked = listUnpackedEntries(copyAsar);
        assert.ok(origUnpacked.length > 0);
        assert.equal(resolveAsarTarget(copyAsar), copyAsar);

        const stBefore = getPatchStatus(copyAsar);
        assert.equal(stBefore.hasAnchor, true);
        if (stBefore.state === 'unpatched') {
            const p = patchAsar(copyAsar, { ifNeeded: true, syncSidecar: false });
            assert.equal(p.changed, true);
            const utils = asar.extractFile(copyAsar, 'dist/utils.js').toString('utf8');
            assert.ok(utils.includes(PATCH_MARKER));
            assert.equal(extractPayloadHash(utils), computeExpectedPayloadHash());
            assert.doesNotThrow(() => new vm.Script(utils));
            assert.deepEqual(listUnpackedEntries(copyAsar), origUnpacked);
            const pAgain = patchAsar(copyAsar, { ifNeeded: true, syncSidecar: false });
            assert.equal(pAgain.changed, false);
            assert.equal(pAgain.status, 'already_patched');
            const r = restoreAsar(copyAsar, { removeSidecar: false });
            assert.equal(r.restored, true);
        }

        const doc = runDoctor(copyAsar);
        assert.equal(doc.healthy, true);
        assert.equal(syncCoreToSidecar(), true);
        assert.throws(() => parseBogusCli(), { message: /./ });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

function parseBogusCli() {
    execFileSync(process.execPath, [fileURLToPath(new URL('../src/patcher.mjs', import.meta.url)), 'bogus', '--json'], { encoding: 'utf8', stdio: 'pipe' });
}

test('Phase 2 UI contract: shared kit parity, custom combobox, theme sync, no native <select>, security regexes', () => {
    const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
    const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8').replace(/\r\n/g, '\n');
    const norm = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    const runtime = read('src', 'runtime-patch.js');
    const core = read('src', 'context-core.cjs');
    const appJs = read('sidecar', 'sidecars', 'panel', 'app.js');
    const styles = read('sidecar', 'sidecars', 'panel', 'styles.css');
    const html = read('sidecar', 'sidecars', 'panel', 'index.html');

    // 1. Shared UI kit (JS + CSS) is byte-for-byte equivalent in Titlebar client and Sidecar panel.
    const kitJs = appJs.slice(appJs.indexOf('const CM_SAFE_MODEL_RE'), appJs.indexOf('/* Sidecar bootstrap */'));
    assert.ok(kitJs.includes('function createCombobox') && kitJs.includes('function createMonitorView'));
    assert.ok(norm(runtime).includes(norm(kitJs)), 'Titlebar client must embed the identical shared UI kit JS');
    const kitCss = styles.slice(styles.indexOf('.cm-root {'), styles.indexOf('html { background'));
    assert.ok(kitCss.length > 2000);
    assert.ok(norm(runtime).includes(norm(kitCss)), 'Titlebar client must embed the identical shared UI kit CSS');
    assert.ok(/#ag-ctx-drawer\s+\.cm-controls\s*\{[^}]*grid-template-columns:\s*1fr\b/.test(runtime), 'Titlebar 380px drawer must keep .cm-controls single-column regardless of window viewport width');

    // 2. Custom accessible combobox replaces every native <select>.
    for (const [name, text] of [['runtime-patch.js', runtime], ['app.js', appJs], ['index.html', html]]) {
        assert.ok(!/<select|<optgroup/i.test(text), `${name} must not contain native <select>/<optgroup>`);
        assert.ok(!/blur\(\)/.test(text.replace(/\.focus\([^)]*\)/g, '')) || name === 'index.html', `${name} must not blur() to dodge native dropdown collapse`);
    }
    for (const token of ['role="combobox"', 'role="listbox"', 'role="option"', 'aria-expanded', 'aria-controls', 'aria-activedescendant', 'aria-selected',
        "'ArrowDown'", "'ArrowUp'", "'Home'", "'End'", "'Enter'", "'Escape'", 'pointerdown', 'Reset to Live', 'Auto-Detect', 'Copy /compact Summary',
        'Approaching Compact', 'Compacting Soon', 'Compacts', 'Misses']) {
        assert.ok(kitJs.includes(token), `shared kit missing ${token}`);
    }
    assert.ok(!/hasFocus|activeElement\.tagName === 'SELECT'/.test(runtime), 'Titlebar must never freeze updates while a control has focus');

    // 3. Theme: host tokens only, light/dark sync from --background luminance, color-scheme, restraint.
    for (const [name, text] of [['styles.css', styles], ['runtime-patch.js', runtime]]) {
        assert.ok(!/--popover|--content\b|#60a5fa|#111114|#09090b/i.test(text), `${name} must not use non-existent host tokens or hard-coded AI-slop colors`);
        assert.ok(text.includes('color-scheme') && text.includes('prefers-reduced-motion') && text.includes('tabular-nums') && text.includes('color-mix(in srgb'));
        for (const tok of ['--background', '--foreground', '--card', '--card-border', '--secondary-foreground', '--muted-foreground', '--placeholder', '--border', '--primary', '--error', '--font-family', '--editor-font-family']) {
            assert.ok(text.includes(tok), `${name} missing host token ${tok}`);
        }
        assert.ok(!/rgba\(\s*(?:239|245|16|59)\b/.test(text), `${name} must not hard-code status rainbow borders`);
    }
    assert.ok(kitJs.includes("getPropertyValue('--background')") && kitJs.includes("attributeFilter: ['style', 'class']") && kitJs.includes('dataset.theme') && kitJs.includes('style.colorScheme'));
    assert.ok(runtime.includes('cmWatchScheme(() => [wrap, drawer])'), 'Titlebar wrapper and drawer must follow the host scheme');
    assert.ok(appJs.includes('cmWatchScheme(() => [document.documentElement, appRoot])'), 'Sidecar root must follow the host scheme');

    // 4. Real Antigravity chat selectors for New Session detection.
    for (const sel of ['[data-message-id]', '[data-testid="chat-message"]', '[data-testid="user-input-step"]', '.prose', '.markdown-body']) {
        assert.ok(runtime.includes(sel), `detectIsNewSessionUi missing ${sel}`);
    }

    // 5. Security invariants preserved.
    for (const [name, text] of [['runtime-patch.js', runtime], ['context-core.cjs', core]]) {
        assert.ok(!/\bfetch\s*\(/.test(text), `${name}: no fetch(`);
        assert.ok(!text.includes('openExternal') && !text.includes('api.github.com'), `${name}: no openExternal/api.github.com`);
    }
    assert.ok(!runtime.includes('a[href*="/brain/"]'));
    assert.ok(/const coreModule = \(\(\) => \{\s*const module = \{ exports: \{\} \};/.test(runtime));
    assert.equal(runtime.split('__CONTEXT_CORE__').length, 2, 'placeholder must appear exactly once');
    assert.ok(runtime.includes('pollTimer.unref()'));

    // 6. Persistence helpers behave (run the kit's pure helpers in a sandbox).
    const kit = vm.runInNewContext(`${kitJs}\n({ cmParseTokens, cmFmtTok, cmFmtInput, cmEsc, CM_SAFE_MODEL_RE });`, {});
    assert.equal(kit.cmParseTokens('200k'), 200000);
    assert.equal(kit.cmParseTokens(' 1.5M '), 1500000);
    assert.equal(kit.cmParseTokens('2,000'), 2000);
    assert.equal(kit.cmParseTokens('abc'), null);
    assert.equal(kit.cmParseTokens('-5'), null);
    assert.equal(kit.cmFmtInput(2000000), '2M');
    assert.equal(kit.cmFmtInput(200000), '200k');
    assert.equal(kit.cmFmtTok(162200), '162k');
    assert.equal(kit.cmEsc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    assert.ok(kit.CM_SAFE_MODEL_RE.test('Gemini 5 Xenon (Ultra)') && !kit.CM_SAFE_MODEL_RE.test('bad<script>'));
    assert.deepEqual(sanitizeSettings({ customModels: { 'Gemini 5 Xenon (Ultra)': { contextLimit: 2000000, compactionLimit: 1200000 } } }).customModels['Gemini 5 Xenon (Ultra)'],
        { contextLimit: 2000000, compactionLimit: 1200000 });

    // 7. The real injected client script loads without ReferenceErrors, is idempotent, and mounts nothing without an app shell.
    const tmpHome = tmpDir();
    const prevHome = process.env.HOME;
    const prevProfile = process.env.USERPROFILE;
    try {
        process.env.HOME = tmpHome;
        process.env.USERPROFILE = tmpHome;
        const handlers = {};
        const executed = [];
        const hub = {
            on: (ev, fn) => { handlers[ev] = fn; },
            once: () => {},
            getURL: () => 'http://127.0.0.1:4555/',
            isDestroyed: () => false,
            executeJavaScript: (code) => { executed.push(code); return Promise.resolve(); }
        };
        const rendered = runtime.replace('__CONTEXT_CORE__', () => core);
        new Function('win', 'hubContents', 'require', rendered)({ on() {} }, hub, createRequire(import.meta.url));
        handlers['dom-ready']();
        assert.equal(executed.length, 1);
        const script = executed[0];
        assert.doesNotThrow(() => new vm.Script(script));
        assert.ok(script.includes('role="combobox"') && script.includes('style.colorScheme') && script.includes('createMonitorView'));
        assert.ok(!/<select/i.test(script) && !/\bfetch\s*\(/.test(script) && !script.includes('openExternal'));

        const logs = [];
        const win = { location: { href: 'http://127.0.0.1:4555/', pathname: '/', hash: '' } };
        const sandbox = {
            window: win,
            document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], documentElement: {}, body: null, hidden: false, addEventListener() {} },
            console: { log: (m) => logs.push(m), error() {} },
            MutationObserver: class { observe() {} disconnect() {} },
            setInterval: () => 1,
            clearInterval() {},
            setTimeout: () => 1,
            requestAnimationFrame: (f) => f(),
            navigator: { userAgent: 'test' },
            history: {}
        };
        vm.runInNewContext(script, sandbox);
        assert.equal(win.__agContextMonitorMounted, true);
        assert.doesNotThrow(() => vm.runInNewContext(script, sandbox), 'second injection must be a no-op');
    } finally {
        process.env.HOME = prevHome;
        process.env.USERPROFILE = prevProfile;
        fs.rmSync(tmpHome, { recursive: true, force: true });
    }
});
