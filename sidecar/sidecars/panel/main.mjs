import fs, { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path, { basename, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Response, SidecarApp } from 'sidecar_sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const core = require(join(HERE, 'context-core.cjs'));
const analyzer = core.createContextAnalyzer({ fs, path, os });
const settingsStore = core.createSettingsStore({ fs, path, os });

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

app.api('/api/context', (data = {}) => {
    const brainDir = resolveBrainRoot();
    const cfg = settingsStore.readSettings();
    const isNewSessionUi = data.isNewSession === '1' || data.isNewSession === 'true';

    return analyzer.resolveContextPayload({
        brainDir,
        config: cfg,
        requestedConvId: typeof data.convId === 'string' ? data.convId : '',
        hostConvId: typeof data.hostConvId === 'string' ? data.hostConvId : '',
        isNewSessionUi,
        modelOverride: typeof data.modelOverride === 'string' ? data.modelOverride : undefined,
        limit: 20
    });
}, 'GET');

app.api('/api/config', (data = {}) => {
    const next = settingsStore.writeSettingsPatch(data);
    return { ok: true, config: next };
}, 'POST');

app.run();
