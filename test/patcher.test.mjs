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
    analyzeConversationDir,
    analyzeTranscriptText,
    resolveModelProfile
} from '../src/context-analyzer.mjs';
import {
    PATCH_MARKER,
    PatchError,
    getDefaultAppAsarPath,
    getPatchStatus,
    getSidecarInstallDir,
    isSidecarPluginInstalled,
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

async function createSampleAsar(dir, utilsCode, pkgVersion = '2.32.1') {
    const src = path.join(dir, 'src');
    fs.mkdirSync(path.join(src, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ name: 'antigravity', version: pkgVersion }));
    fs.writeFileSync(path.join(src, 'dist', 'utils.js'), utilsCode);
    const asarPath = path.join(dir, 'app.asar');
    await asar.createPackage(src, asarPath);
    return asarPath;
}

test('model catalog & ceilings: all 18 models mapped accurately; 200k and 128k never treated as 1M', () => {
    assert.equal(MODEL_CATALOG.length, 18);

    const claudeIds = MODEL_CATALOG.filter((m) => m.family === 'claude');
    assert.equal(claudeIds.length, 6);
    for (const m of claudeIds) {
        assert.equal(m.contextLimit, 200000);
        assert.equal(m.tierLabel, '200k');
        assert.equal(resolveModelProfile(m.id).contextLimit, 200000);
        assert.equal(resolveModelProfile(m.displayName).contextLimit, 200000);
    }

    const oss = resolveModelProfile('GPT-OSS 120B (Medium)');
    assert.equal(oss.contextLimit, 128000);
    assert.equal(oss.tierLabel, '128k');

    const orch = resolveModelProfile('Orchestrator (Argon)');
    assert.equal(orch.contextLimit, 1000000);
    assert.equal(orch.isDualPhase, true);

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
    assert.ok(a.handoffAlert && a.handoffAlert.severity === 'danger');
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
    assert.equal(claudeTier.status, 'WARN');
    assert.equal(geminiTier.status, 'SAFE');
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
                // Compaction drop: prompt drops from 500k -> 90k
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
        assert.equal(a.activeTokens, 90500);
        assert.equal(a.categories.reduce((s, c) => s + c.tokens, 0), 90500);
        assert.equal(a.subagents.length, 1);
        assert.equal(a.subagents[0].conversationId, childId);
        assert.equal(a.subagents[0].activeTokens, 42800);
        assert.equal(a.offloadedTokens, 42800);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('security audit: 127.0.0.1 guard, config sanitization, zero network, module.exports intact, valid JS', async () => {
    const root = tmpDir();
    const prevHome = process.env.HOME;
    const prevUserProfile = process.env.USERPROFILE;
    try {
        process.env.HOME = root;
        process.env.USERPROFILE = root;

        const asarPath = await createSampleAsar(
            root,
            'exports.createWindow = (win, url, hubContents) => {\n    void win.loadURL(url);\n    return win;\n};\n'
        );
        patchAsar(asarPath, { syncSidecar: true, homeDir: root });
        assert.equal(isSidecarPluginInstalled(root), true);
        assert.ok(fs.existsSync(path.join(getSidecarInstallDir(root), 'sidecars', 'panel', 'context-core.cjs')));

        const utilsCode = asar.extractFile(asarPath, 'dist/utils.js').toString('utf8');
        assert.ok(!utilsCode.includes('api.github.com'));
        assert.ok(!utilsCode.includes('openExternal'));
        assert.ok(!/\bfetch\s*\(/.test(utilsCode));

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
        let injectedScript = null;
        const win = {
            loadURL() {},
            on: (ev, fn) => { winHandlers[ev] = fn; }
        };
        const hubContents = {
            on: (ev, fn) => { handlers[ev] = fn; },
            once: (ev, fn) => { handlers[ev] = fn; },
            getURL: () => currentUrl,
            isDestroyed: () => false,
            executeJavaScript: (code) => { injectedScript = code; return Promise.resolve(); }
        };

        const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
        const mod = { exports: {} };
        new Function('module', 'exports', 'require', '__dirname', utilsCode)(mod, mod.exports, createRequire(import.meta.url), srcDir);
        assert.equal(typeof mod.exports.createWindow, 'function');

        mod.exports.createWindow(win, 'http://127.0.0.1:4555/', hubContents);
        assert.equal(typeof mod.exports.createWindow, 'function', 'Embedded context-core must never overwrite outer module.exports');

        // Untrusted origin must NOT inject or write config
        handlers['dom-ready']();
        assert.equal(injectedScript, null);
        handlers['console-message']({}, 0, 'AG_CTX_SAVE|{"modelOverride":"claude-opus-5-5-high"}');
        assert.equal(fs.existsSync(cfgPath), true);
        assert.ok(JSON.parse(fs.readFileSync(cfgPath, 'utf8')).modelOverride.includes('script'));

        // Trusted 127.0.0.1 origin injects valid JS and sanitizes console config saves
        currentUrl = 'http://127.0.0.1:4555/';
        handlers['dom-ready']();
        assert.ok(injectedScript);
        assert.doesNotThrow(() => new vm.Script(injectedScript), 'Injected client script must parse cleanly');

        handlers['console-message']({ message: 'AG_CTX_SAVE|{"modelOverride":"claude-opus-5-5-high","compactWarnPct":80,"badKey":"ignored"}' });
        const saved = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        assert.equal(saved.modelOverride, 'claude-opus-5-5-high');
        assert.equal(saved.compactWarnPct, 80);
        assert.equal(saved.badKey, undefined);

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

test('composable multi-mod coexistence with antigravity-rtl in both application orders', async () => {
    const rtlPatcherUrl = new URL('../../antigravity-rtl/src/patcher.mjs', import.meta.url);
    if (!fs.existsSync(fileURLToPath(rtlPatcherUrl))) return;
    const rtl = await import(rtlPatcherUrl.href);

    const root = tmpDir();
    try {
        const cleanCode = 'module.exports = (win, url, hubContents) => {\n    void win.loadURL(url);\n    return win;\n};\n';

        // Order A: RTL -> Context -> restore RTL -> restore Context
        const dirA = path.join(root, 'orderA');
        fs.mkdirSync(dirA);
        const asarA = await createSampleAsar(dirA, cleanCode);
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
        const dirB = path.join(root, 'orderB');
        fs.mkdirSync(dirB);
        const asarB = await createSampleAsar(dirB, cleanCode);
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
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
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
        if (stBefore.state === 'unpatched') {
            const p = patchAsar(copyAsar, { ifNeeded: true, syncSidecar: false });
            assert.equal(p.changed, true);
            const utils = asar.extractFile(copyAsar, 'dist/utils.js').toString('utf8');
            assert.ok(utils.includes(PATCH_MARKER));
            assert.doesNotThrow(() => new vm.Script(utils));
            assert.deepEqual(listUnpackedEntries(copyAsar), origUnpacked);
            restoreAsar(copyAsar, { removeSidecar: false });
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
