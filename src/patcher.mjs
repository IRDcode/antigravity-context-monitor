import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as asar from '@electron/asar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

export const PATCH_MARKER = '/* ANTIGRAVITY CONTEXT MONITOR v2.0 */';
export const PATCH_END = '/* END ANTIGRAVITY CONTEXT MONITOR */';
export const ANCHOR = 'void loadHubWindowUrl(win, url, { skipBootstrapMint });';
export const LEGACY_ANCHOR = 'void win.loadURL(url);';
export const FALLBACK_ANCHOR = 'await win.loadURL(url);';

// Ordered by priority:
// 1) v2.34.0+ createWindow -> loadHubWindowUrl(win, url, ...) where win & hubContents are in scope once per window
// 2) Legacy v2.32/v2.33 createWindow -> void win.loadURL(url);
// 3) Fallback invokeWindowLoadUrl -> await win.loadURL(url);
const ANCHOR_PATTERNS = [
    /\bvoid\s+loadHubWindowUrl\(\s*win\s*,\s*url(?:\s*,\s*(?:\{[^;\n]*\}|[A-Za-z_$][\w$.]*))?\s*\)\s*;/,
    /\bvoid\s+win\.loadURL\(\s*url\s*\)\s*;/,
    /\bawait\s+win\.loadURL\(\s*url\s*\)\s*;/
];

const CURRENT_BLOCK_RE = /\/\* ANTIGRAVITY CONTEXT MONITOR[\s\S]*?\/\* END ANTIGRAVITY CONTEXT MONITOR \*\/\r?\n?/;
const PAYLOAD_HASH_RE = /\/\* AG_CTX_PAYLOAD_SHA256:\s*([0-9a-f]{12,64})\s*\*\//i;
const RTL_START_RE = /\/\* (?:ANTIGRAVITY PERSIAN RTL|ANTIGRAVITY RTL HARDENED|ANTIGRAVITY RTL PATCH|FALIZ RTL CORE|FANTIGRAVITY RTL CORE)/;
const RTL_BLOCK_RE = /\/\* (?:ANTIGRAVITY PERSIAN RTL|ANTIGRAVITY RTL HARDENED|ANTIGRAVITY RTL PATCH|FALIZ RTL CORE|FANTIGRAVITY RTL CORE)[\s\S]*?\/\* END (?:ANTIGRAVITY PERSIAN RTL|ANTIGRAVITY RTL HARDENED|ANTIGRAVITY RTL PATCH|FALIZ RTL CORE|FANTIGRAVITY RTL CORE) \*\//;
const WRAPPED_ANCHOR_TAIL_RE = /((?:void|await)\s+(?:win\.loadURL|loadHubWindowUrl)\([^\n;]*\);)\s*\/\* END [^*]+\*\/\s*$/;

const ASAR_BLOCK_SIZE = 4 * 1024 * 1024;
const UTILS_REL_PATH = 'dist/utils.js';
const FONT_REL_PATH = 'dist/Vazirmatn-Variable.woff2';
const SIDECAR_PLUGIN_DIR_NAME = 'context-monitor';

export class PatchError extends Error {
    constructor(code, message, { causeText = '', fix = '', details = undefined, exitCode = 1 } = {}) {
        super(message);
        this.name = 'PatchError';
        this.code = code;
        this.causeText = causeText;
        this.fix = fix;
        this.details = details;
        this.exitCode = exitCode;
    }
}

export function findInjectionAnchor(code) {
    if (typeof code !== 'string') return null;
    for (const pattern of ANCHOR_PATTERNS) {
        const match = pattern.exec(code);
        if (match) return match[0];
    }
    return null;
}

export function extractPayloadHash(code) {
    if (typeof code !== 'string') return null;
    const blockMatch = CURRENT_BLOCK_RE.exec(code);
    if (!blockMatch) return null;
    const hashMatch = PAYLOAD_HASH_RE.exec(blockMatch[0]);
    return hashMatch ? hashMatch[1].toLowerCase() : null;
}

export function getCandidateAppAsarPaths() {
    const candidates = [];
    if (process.platform === 'win32') {
        if (process.env.LOCALAPPDATA) {
            candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity', 'resources', 'app.asar'));
            candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity', 'resources', 'app.asar'));
            candidates.push(path.join(process.env.LOCALAPPDATA, 'Antigravity', 'resources', 'app.asar'));
        }
        if (process.env.PROGRAMFILES) {
            candidates.push(path.join(process.env.PROGRAMFILES, 'Antigravity', 'resources', 'app.asar'));
            candidates.push(path.join(process.env.PROGRAMFILES, 'antigravity', 'resources', 'app.asar'));
        }
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/Antigravity.app/Contents/Resources/app.asar');
        candidates.push(path.join(os.homedir(), 'Applications', 'Antigravity.app', 'Contents', 'Resources', 'app.asar'));
    } else {
        candidates.push(
            '/opt/Antigravity/resources/app.asar',
            '/opt/antigravity/resources/app.asar',
            '/usr/lib/antigravity/resources/app.asar',
            path.join(os.homedir(), '.local', 'share', 'antigravity', 'resources', 'app.asar')
        );
    }
    return [...new Set(candidates)];
}

export function getDefaultAppAsarPath() {
    return getCandidateAppAsarPaths().find((p) => fs.existsSync(p)) || null;
}

export function resolveAsarTarget(customPath) {
    if (!customPath) {
        return getDefaultAppAsarPath();
    }
    const resolved = path.resolve(customPath);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        const direct = path.join(resolved, 'app.asar');
        const nested = path.join(resolved, 'resources', 'app.asar');
        if (fs.existsSync(direct)) return direct;
        if (fs.existsSync(nested)) return nested;
    }
    return resolved;
}

function wrapFsError(err, action, targetPath) {
    if (err instanceof PatchError) return err;
    const code = err && err.code;
    if (code === 'EBUSY') {
        return new PatchError('FILE_LOCKED', `Cannot ${action} because ${path.basename(targetPath)} is locked by another process.`, {
            causeText: 'Antigravity Desktop, a tray/helper process, or an antivirus scanner is holding the file handle open.',
            fix: 'Close Antigravity completely (check the Windows System Tray / Task Manager) and retry.',
            details: { path: targetPath, sysCode: code },
            exitCode: 2
        });
    }
    if (code === 'EACCES' || code === 'EPERM') {
        return new PatchError('PERMISSION_DENIED', `Permission denied while attempting to ${action}: ${targetPath}`, {
            causeText: 'The installation directory requires elevated privileges.',
            fix: process.platform === 'win32'
                ? 'Right-click Launch-Antigravity-Context.bat (or PowerShell) and choose "Run as administrator".'
                : 'Run the command with sufficient permissions for the installation folder.',
            details: { path: targetPath, sysCode: code }
        });
    }
    if (code === 'ENOSPC') {
        return new PatchError('DISK_FULL', `Not enough free disk space to ${action}: ${targetPath}`, {
            causeText: 'Temporary ASAR repacking could not complete due to low disk space.',
            fix: 'Free at least 30 MB on the target drive and retry.',
            details: { path: targetPath, sysCode: code }
        });
    }
    if (code === 'ENOENT') {
        return new PatchError('ASAR_NOT_FOUND', `Target file not found: ${targetPath}`, {
            causeText: 'The expected app.asar file does not exist at this path.',
            fix: 'Verify Antigravity Desktop is installed, or pass --path "<full path to app.asar>".',
            details: { path: targetPath, sysCode: code }
        });
    }
    return new PatchError('FS_ERROR', `Filesystem failure during ${action}: ${err.message}`, {
        causeText: err.message,
        fix: 'Run `node src/patcher.mjs doctor` and inspect permissions and disk health.',
        details: { path: targetPath, sysCode: code }
    });
}

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function isAntigravityRunningForAsar(asarPath) {
    if (!asarPath) return false;
    if (process.platform !== 'win32') return false;
    const expectedExe = path.resolve(path.dirname(asarPath), '..', 'Antigravity.exe').toLowerCase();
    try {
        const out = execFileSync(
            'powershell.exe',
            [
                '-NoProfile',
                '-Command',
                "Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path"
            ],
            { encoding: 'utf8', timeout: 5000, windowsHide: true }
        );
        return out
            .split(/\r?\n/)
            .map((l) => l.trim().toLowerCase())
            .filter(Boolean)
            .some((p) => p === expectedExe);
    } catch {
        return false;
    }
}

function computeAsarIntegrity(data) {
    const hash = crypto.createHash('SHA256').update(data).digest('hex');
    const blocks = [];
    for (let offset = 0; offset < data.length; offset += ASAR_BLOCK_SIZE) {
        const end = Math.min(offset + ASAR_BLOCK_SIZE, data.length);
        blocks.push(crypto.createHash('SHA256').update(data.subarray(offset, end)).digest('hex'));
    }
    if (data.length === 0) {
        blocks.push(crypto.createHash('SHA256').update(data).digest('hex'));
    }
    return { algorithm: 'SHA256', hash, blockSize: ASAR_BLOCK_SIZE, blocks };
}

function encodeAsarPickleHeader(headerObj) {
    const jsonStr = JSON.stringify(headerObj);
    const jsonBuf = Buffer.from(jsonStr, 'utf8');
    const alignedLen = jsonBuf.length + ((4 - (jsonBuf.length % 4)) % 4);
    const headerPayloadLen = 4 + alignedLen;

    const headerPickle = Buffer.alloc(4 + headerPayloadLen);
    headerPickle.writeUInt32LE(headerPayloadLen, 0);
    headerPickle.writeInt32LE(jsonBuf.length, 4);
    jsonBuf.copy(headerPickle, 8);

    const sizePickle = Buffer.alloc(8);
    sizePickle.writeUInt32LE(4, 0);
    sizePickle.writeUInt32LE(headerPickle.length, 4);
    return Buffer.concat([sizePickle, headerPickle]);
}

function readUtilsFromAsar(asarPath) {
    asar.uncache(asarPath);
    asar.getRawHeader(asarPath);
    return asar.extractFile(asarPath, UTILS_REL_PATH).toString('utf8');
}

function readAppVersionFromAsar(asarPath) {
    try {
        asar.uncache(asarPath);
        const pkg = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8'));
        return typeof pkg.version === 'string' ? pkg.version : null;
    } catch {
        return null;
    }
}

function hasAsarEntry(asarPath, relPath) {
    try {
        asar.uncache(asarPath);
        const info = asar.statFile(asarPath, relPath);
        return Boolean(info && 'size' in info);
    } catch {
        return false;
    }
}

function hasAnyContextComment(code) {
    return code.includes('/* ANTIGRAVITY CONTEXT MONITOR');
}

function hasAnyRtlComment(code) {
    return (
        code.includes('/* ANTIGRAVITY PERSIAN RTL') ||
        code.includes('/* ANTIGRAVITY RTL') ||
        code.includes('/* FALIZ RTL') ||
        code.includes('/* FANTIGRAVITY RTL')
    );
}

function stripOwnPatch(code) {
    if (!CURRENT_BLOCK_RE.test(code)) return null;
    return code.replace(CURRENT_BLOCK_RE, '');
}

function stripRtlBlock(code) {
    const match = RTL_BLOCK_RE.exec(code);
    if (!match) return code;
    const innerAnchor = WRAPPED_ANCHOR_TAIL_RE.exec(match[0]);
    if (innerAnchor) {
        return code.slice(0, match.index) + innerAnchor[1] + code.slice(match.index + match[0].length);
    }
    let end = match.index + match[0].length;
    if (code.slice(end, end + 2) === '\r\n') end += 2;
    else if (code[end] === '\n') end += 1;
    return code.slice(0, match.index) + code.slice(end);
}

function stripAllKnownMods(code) {
    let out = code;
    if (CURRENT_BLOCK_RE.test(out)) {
        out = out.replace(CURRENT_BLOCK_RE, '');
    }
    out = stripRtlBlock(out);
    return out;
}

function inspectBackup(backupPath) {
    if (!fs.existsSync(backupPath)) {
        return { exists: false, state: 'none', appVersion: null };
    }
    try {
        const utils = readUtilsFromAsar(backupPath);
        new vm.Script(utils, { filename: 'backup:dist/utils.js' });
        const appVersion = readAppVersionFromAsar(backupPath);
        if (hasAnyContextComment(utils) || hasAnyRtlComment(utils) || hasAsarEntry(backupPath, FONT_REL_PATH)) {
            return { exists: true, state: 'patched', appVersion };
        }
        return { exists: true, state: 'clean', appVersion };
    } catch (err) {
        return { exists: true, state: 'corrupt', error: err.message, appVersion: null };
    }
}

export function getSidecarInstallDir(homeDir = os.homedir()) {
    return path.join(homeDir, '.gemini', 'config', 'plugins', SIDECAR_PLUGIN_DIR_NAME);
}

export function syncCoreToSidecar() {
    const coreSrc = path.join(__dirname, 'context-core.cjs');
    const corePanelDest = path.resolve(__dirname, '..', 'sidecar', 'sidecars', 'panel', 'context-core.cjs');
    if (fs.existsSync(coreSrc) && fs.existsSync(path.dirname(corePanelDest))) {
        fs.copyFileSync(coreSrc, corePanelDest);
        return true;
    }
    return false;
}

export function installSidecarPlugin({ homeDir = os.homedir(), remove = false } = {}) {
    const destDir = getSidecarInstallDir(homeDir);
    if (remove) {
        if (fs.existsSync(destDir)) {
            try {
                fs.rmSync(destDir, { recursive: true, force: true });
                return { installed: false, removed: true, path: destDir };
            } catch (err) {
                return {
                    installed: isSidecarPluginInstalled(homeDir),
                    removed: false,
                    path: destDir,
                    warning: err && err.message ? err.message : String(err)
                };
            }
        }
        return { installed: false, removed: false, path: destDir };
    }

    syncCoreToSidecar();
    const srcDir = path.resolve(__dirname, '..', 'sidecar');
    if (!fs.existsSync(srcDir)) {
        return { installed: false, reason: 'sidecar source folder missing', path: destDir };
    }
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    fs.cpSync(srcDir, destDir, { recursive: true, force: true });
    const coreSrc = path.join(__dirname, 'context-core.cjs');
    const coreDest = path.join(destDir, 'sidecars', 'panel', 'context-core.cjs');
    if (fs.existsSync(coreSrc)) {
        fs.copyFileSync(coreSrc, coreDest);
    }
    return { installed: true, path: destDir };
}

export function isSidecarPluginInstalled(homeDir = os.homedir()) {
    const destDir = getSidecarInstallDir(homeDir);
    return (
        fs.existsSync(path.join(destDir, 'plugin.json')) &&
        fs.existsSync(path.join(destDir, 'sidecars', 'panel', 'sidecar.json')) &&
        fs.existsSync(path.join(destDir, 'sidecars', 'panel', 'main.mjs')) &&
        fs.existsSync(path.join(destDir, 'sidecars', 'panel', 'context-core.cjs'))
    );
}

function readBundleAssets() {
    const corePath = path.join(__dirname, 'context-core.cjs');
    const runtimePath = path.join(__dirname, 'runtime-patch.js');
    for (const reqPath of [corePath, runtimePath]) {
        if (!fs.existsSync(reqPath)) {
            throw new PatchError('MISSING_BUNDLE_ASSET', `Required asset missing: ${path.basename(reqPath)}`, {
                causeText: `Expected file at ${reqPath} was deleted or incomplete.`,
                fix: 'Re-clone or re-extract the complete antigravity-context-monitor package.'
            });
        }
    }
    return {
        coreCode: fs.readFileSync(corePath, 'utf8'),
        runtimeTemplate: fs.readFileSync(runtimePath, 'utf8')
    };
}

export function computeExpectedPayloadHash() {
    return buildStampedPayload().payloadHash;
}

function buildStampedPayload(assets = readBundleAssets()) {
    const rendered = assets.runtimeTemplate.replace('__CONTEXT_CORE__', () => assets.coreCode).trimEnd();
    const normalized = rendered.replace(/\r\n/g, '\n');
    const payloadHash = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
    const hashComment = `/* AG_CTX_PAYLOAD_SHA256: ${payloadHash} */`;
    let runtimeCode;
    if (normalized.startsWith(PATCH_MARKER)) {
        runtimeCode = PATCH_MARKER + '\n' + hashComment + normalized.slice(PATCH_MARKER.length);
    } else {
        runtimeCode = PATCH_MARKER + '\n' + hashComment + '\n' + normalized;
    }
    return { payloadHash, runtimeCode };
}

export function getPatchStatus(asarPath) {
    const checkedPaths = asarPath ? [asarPath] : getCandidateAppAsarPaths();
    let expectedPayloadHash = null;
    try {
        expectedPayloadHash = computeExpectedPayloadHash();
    } catch {}

    if (!asarPath || !fs.existsSync(asarPath)) {
        return {
            exists: false,
            state: 'missing',
            running: false,
            hasBackup: false,
            backupState: 'none',
            sidecarInstalled: isSidecarPluginInstalled(),
            expectedPayloadHash,
            checkedPaths
        };
    }

    try {
        if (fs.statSync(asarPath).isDirectory()) {
            return {
                exists: false,
                state: 'not_a_file',
                asarPath,
                running: false,
                hasBackup: false,
                backupState: 'none',
                sidecarInstalled: isSidecarPluginInstalled(),
                expectedPayloadHash
            };
        }
        const utils = readUtilsFromAsar(asarPath);
        const installedPayloadHash = extractPayloadHash(utils);
        let state = 'unpatched';
        if (utils.includes(PATCH_MARKER)) {
            if (expectedPayloadHash && installedPayloadHash === expectedPayloadHash) {
                state = 'patched';
            } else {
                state = 'legacy_or_stale';
            }
        } else if (hasAnyContextComment(utils)) {
            state = 'legacy_or_stale';
        }
        const anchorMatch = findInjectionAnchor(utils);
        const backupInfo = inspectBackup(`${asarPath}.bak`);
        return {
            exists: true,
            asarPath,
            appVersion: readAppVersionFromAsar(asarPath),
            state,
            payloadHash: installedPayloadHash,
            expectedPayloadHash,
            needsUpgrade: state === 'legacy_or_stale',
            rtlPresent: hasAnyRtlComment(utils),
            hasAnchor: Boolean(anchorMatch) || state !== 'unpatched',
            anchorMatch,
            hasBackup: backupInfo.exists,
            backupState: backupInfo.state,
            sidecarInstalled: isSidecarPluginInstalled(),
            running: isAntigravityRunningForAsar(asarPath)
        };
    } catch (err) {
        const backupInfo = inspectBackup(`${asarPath}.bak`);
        return {
            exists: true,
            asarPath,
            state: 'corrupt',
            corruptReason: err.message,
            payloadHash: null,
            expectedPayloadHash,
            needsUpgrade: false,
            rtlPresent: false,
            hasAnchor: false,
            anchorMatch: null,
            hasBackup: backupInfo.exists,
            backupState: backupInfo.state,
            sidecarInstalled: isSidecarPluginInstalled(),
            running: isAntigravityRunningForAsar(asarPath)
        };
    }
}

function rebuildAsarWithOverrides(srcAsarPath, destTmpPath, overrides, removals = new Set()) {
    const raw = asar.getRawHeader(srcAsarPath);
    const dataStart = 8 + raw.headerSize;
    const totalSize = fs.statSync(srcAsarPath).size;
    const origDataSize = totalSize - dataStart;
    if (origDataSize < 0) {
        throw new PatchError('CORRUPT_ASAR', `Corrupt ASAR archive header in ${srcAsarPath}.`, {
            causeText: 'ASAR headerSize exceeds total file size.',
            fix: 'Run `restore` if a clean .bak backup exists, or reinstall Antigravity Desktop.'
        });
    }
    const origDataBuf = Buffer.alloc(origDataSize);
    const fd = fs.openSync(srcAsarPath, 'r');
    try {
        let pos = 0;
        while (pos < origDataSize) {
            const n = fs.readSync(fd, origDataBuf, pos, origDataSize - pos, dataStart + pos);
            if (n <= 0) break;
            pos += n;
        }
    } finally {
        fs.closeSync(fd);
    }

    const headerClone = structuredClone(raw.header);
    const pendingOverrides = new Map(Object.entries(overrides));
    const chunks = [];
    let nextOffset = 0;
    const dedupOffsets = new Map();

    function processDirectory(dirNode, prefix) {
        for (const [name, entry] of Object.entries(dirNode.files)) {
            const relPath = prefix ? `${prefix}/${name}` : name;
            if (removals.has(relPath)) {
                delete dirNode.files[name];
                continue;
            }
            if ('link' in entry) continue;
            if ('files' in entry) {
                processDirectory(entry, relPath);
                continue;
            }
            if (entry.unpacked) continue;
            if (pendingOverrides.has(relPath)) {
                const buf = pendingOverrides.get(relPath);
                pendingOverrides.delete(relPath);
                entry.offset = String(nextOffset);
                entry.size = buf.length;
                entry.integrity = computeAsarIntegrity(buf);
                chunks.push(buf);
                nextOffset += buf.length;
                continue;
            }
            if (entry.size <= 0) {
                entry.offset = '0';
                continue;
            }
            const dedupKey = `${entry.offset}:${entry.size}`;
            if (dedupOffsets.has(dedupKey)) {
                entry.offset = dedupOffsets.get(dedupKey);
                continue;
            }
            const origOff = Number(entry.offset);
            if (!Number.isFinite(origOff) || origOff + entry.size > origDataBuf.length) {
                throw new PatchError('CORRUPT_ASAR', `Entry "${relPath}" points outside archive data bounds.`, {
                    causeText: 'ASAR internal table is truncated or damaged.',
                    fix: 'Run `restore` if app.asar.bak is clean, otherwise reinstall Antigravity Desktop.'
                });
            }
            const slice = origDataBuf.subarray(origOff, origOff + entry.size);
            const assigned = String(nextOffset);
            dedupOffsets.set(dedupKey, assigned);
            entry.offset = assigned;
            chunks.push(slice);
            nextOffset += slice.length;
        }
    }

    processDirectory(headerClone, '');

    for (const [relPath, buf] of pendingOverrides.entries()) {
        const parts = relPath.split('/');
        const fileName = parts.pop();
        let cursor = headerClone;
        for (const seg of parts) {
            if (!cursor.files[seg]) {
                cursor.files[seg] = { files: Object.create(null) };
            }
            cursor = cursor.files[seg];
        }
        cursor.files[fileName] = {
            offset: String(nextOffset),
            size: buf.length,
            integrity: computeAsarIntegrity(buf)
        };
        chunks.push(buf);
        nextOffset += buf.length;
    }

    const headerBuf = encodeAsarPickleHeader(headerClone);
    const outFd = fs.openSync(destTmpPath, 'w');
    try {
        fs.writeSync(outFd, headerBuf);
        for (const c of chunks) {
            if (c.length > 0) fs.writeSync(outFd, c);
        }
    } finally {
        fs.closeSync(outFd);
    }
}

export function buildInjectedUtils(baseUtilsCode) {
    const anchor = findInjectionAnchor(baseUtilsCode);
    if (!anchor) {
        throw new PatchError(
            'ANCHOR_NOT_FOUND',
            `Injection anchor not found in ${UTILS_REL_PATH} (expected loadHubWindowUrl or win.loadURL startup call).`,
            {
                causeText: 'This Antigravity release changed the internal startup hook inside dist/utils.js.',
                fix: 'Your original app.asar was NOT modified. Check for an updated release.'
            }
        );
    }
    const { runtimeCode } = buildStampedPayload();
    const eol = baseUtilsCode.includes('\r\n') ? '\r\n' : '\n';
    const runtimeWithEol = eol === '\r\n' ? runtimeCode.replace(/\n/g, '\r\n') : runtimeCode;

    let injected;
    const rtlMatch = RTL_START_RE.exec(baseUtilsCode);
    if (rtlMatch) {
        // Place Context Monitor right BEFORE the RTL block so both blocks remain strictly disjoint siblings.
        const idx = rtlMatch.index;
        injected = baseUtilsCode.slice(0, idx) + runtimeWithEol + eol + baseUtilsCode.slice(idx);
    } else {
        injected = baseUtilsCode.replace(anchor, () => runtimeWithEol + eol + anchor);
    }

    try {
        new vm.Script(injected, { filename: UTILS_REL_PATH });
    } catch (err) {
        throw new PatchError('SCRIPT_SYNTAX_ERROR', `Generated payload failed JavaScript syntax verification: ${err.message}`, {
            causeText: err.message,
            fix: 'Your original app.asar was NOT modified. Verify src/runtime-patch.js and src/context-core.cjs.'
        });
    }
    return injected;
}

function assertValidAsarTarget(asarPath) {
    if (!asarPath) {
        throw new PatchError('ASAR_NOT_FOUND', 'Could not locate Antigravity Desktop app.asar automatically.', {
            causeText: 'None of the standard Antigravity Desktop installation paths contained resources/app.asar.',
            fix: 'Pass the exact path explicitly: `node src/patcher.mjs patch --path "C:\\path\\to\\resources\\app.asar"`',
            details: { checkedPaths: getCandidateAppAsarPaths() }
        });
    }
    if (!fs.existsSync(asarPath)) {
        throw new PatchError('ASAR_NOT_FOUND', `app.asar not found at: ${asarPath}`, {
            causeText: 'The specified or default Antigravity app.asar path does not exist.',
            fix: 'Verify Antigravity Desktop is installed, or pass `--path "<full path to app.asar>"`.'
        });
    }
    if (fs.statSync(asarPath).isDirectory()) {
        throw new PatchError('PATH_NOT_FILE', `Expected an app.asar file path, got a directory: ${asarPath}`, {
            causeText: 'The target path points to a directory rather than an app.asar file.',
            fix: 'Pass the full path ending in `app.asar`.'
        });
    }
}

export function patchAsar(asarPath, { ifNeeded = false, syncSidecar = true, homeDir = os.homedir() } = {}) {
    assertValidAsarTarget(asarPath);

    const status = getPatchStatus(asarPath);
    if (status.state === 'corrupt') {
        if (status.hasBackup && status.backupState === 'clean') {
            throw new PatchError('CORRUPT_ASAR', `app.asar appears corrupted (${status.corruptReason}), but a clean .bak exists.`, {
                causeText: status.corruptReason,
                fix: 'Run `node src/patcher.mjs restore` first to roll back to your clean backup, then run `patch`.'
            });
        }
        throw new PatchError('CORRUPT_ASAR', `Cannot read app.asar (${status.corruptReason}).`, {
            causeText: status.corruptReason,
            fix: 'Reinstall Antigravity Desktop cleanly before applying the patch.'
        });
    }
    if (ifNeeded && status.state === 'patched') {
        const sidecar = syncSidecar ? installSidecarPlugin({ homeDir }) : null;
        return {
            changed: false,
            status: 'already_patched',
            asarPath,
            appVersion: status.appVersion || null,
            payloadHash: status.payloadHash || null,
            sidecar
        };
    }
    if (status.running) {
        throw new PatchError('ANTIGRAVITY_RUNNING', 'Antigravity.exe is currently running and holding app.asar open.', {
            causeText: 'Windows locks open ASAR files while the Electron app or its System Tray process is running.',
            fix: 'Quit Antigravity completely (check System Tray) or launch via Launch-Antigravity-Context.bat.',
            exitCode: 2
        });
    }

    try {
        fs.accessSync(path.dirname(asarPath), fs.constants.W_OK);
    } catch (err) {
        throw wrapFsError(err, 'access installation folder', asarPath);
    }

    const backupPath = `${asarPath}.bak`;
    let currentUtils;
    try {
        currentUtils = readUtilsFromAsar(asarPath);
    } catch (err) {
        throw wrapFsError(err, 'read app.asar', asarPath);
    }

    const backupInfo = inspectBackup(backupPath);
    const hasSiblingMod = hasAnyRtlComment(currentUtils);
    let baseUtilsForInject;
    let needBackupFromCleanBuild = false;

    if (status.state === 'unpatched') {
        baseUtilsForInject = currentUtils;
        if (hasSiblingMod) {
            const sameVersionClean = backupInfo.state === 'clean' && backupInfo.appVersion === status.appVersion;
            needBackupFromCleanBuild = !sameVersionClean;
        }
    } else {
        baseUtilsForInject = stripOwnPatch(currentUtils);
        if (!baseUtilsForInject) {
            throw new PatchError('LEGACY_PATCH_UNRECOVERABLE', 'Existing Context Monitor block cannot be stripped cleanly.', {
                causeText: 'Modified dist/utils.js lacked matching start/end markers.',
                fix: 'Run restore or reinstall official Antigravity Desktop.'
            });
        }
        needBackupFromCleanBuild = backupInfo.state !== 'clean';
    }

    const matchedAnchor = findInjectionAnchor(baseUtilsForInject);
    const expectedPayloadHash = computeExpectedPayloadHash();
    const injectedUtils = buildInjectedUtils(baseUtilsForInject);

    if (status.state === 'unpatched' && !hasSiblingMod) {
        try {
            const bakTmp = `${backupPath}.tmp-${process.pid}`;
            fs.copyFileSync(asarPath, bakTmp);
            fs.renameSync(bakTmp, backupPath);
        } catch (err) {
            throw wrapFsError(err, 'create backup app.asar.bak', backupPath);
        }
    } else if (needBackupFromCleanBuild) {
        const bakTmp = `${backupPath}.tmp-${process.pid}`;
        try {
            const pureCleanUtils = stripAllKnownMods(baseUtilsForInject);
            new vm.Script(pureCleanUtils, { filename: 'clean-backup:dist/utils.js' });
            rebuildAsarWithOverrides(
                asarPath,
                bakTmp,
                { [UTILS_REL_PATH]: Buffer.from(pureCleanUtils, 'utf8') },
                new Set([FONT_REL_PATH])
            );
            asar.uncache(bakTmp);
            asar.getRawHeader(bakTmp);
            fs.renameSync(bakTmp, backupPath);
        } catch (err) {
            asar.uncache(bakTmp);
            fs.rmSync(bakTmp, { force: true });
            throw wrapFsError(err, 'repair clean backup app.asar.bak', backupPath);
        }
    }

    const tmpPath = `${asarPath}.tmp-${process.pid}`;
    try {
        rebuildAsarWithOverrides(asarPath, tmpPath, {
            [UTILS_REL_PATH]: Buffer.from(injectedUtils, 'utf8')
        });

        asar.uncache(tmpPath);
        asar.getRawHeader(tmpPath);
        const verifiedUtils = asar.extractFile(tmpPath, UTILS_REL_PATH).toString('utf8');
        new vm.Script(verifiedUtils, { filename: UTILS_REL_PATH });
        if (!verifiedUtils.includes(PATCH_MARKER) || extractPayloadHash(verifiedUtils) !== expectedPayloadHash) {
            throw new PatchError('POST_PACK_VERIFY_FAILED', 'Post-pack ASAR verification failed.', {
                causeText: 'Extracted dist/utils.js in staged ASAR lacked expected marker or payload SHA-256.',
                fix: 'Your original app.asar was NOT overwritten. Retry once.'
            });
        }

        try {
            fs.copyFileSync(tmpPath, asarPath);
            asar.uncache(asarPath);
        } catch (writeErr) {
            let rolledBack = false;
            if (!hasSiblingMod && inspectBackup(backupPath).state === 'clean') {
                try {
                    fs.copyFileSync(backupPath, asarPath);
                    asar.uncache(asarPath);
                    rolledBack = true;
                } catch {}
            }
            const wrapped = wrapFsError(writeErr, 'write patched app.asar', asarPath);
            if (!rolledBack && !hasSiblingMod) {
                wrapped.fix = `CRITICAL: Partial write occurred. Manually copy "${backupPath}" over "${asarPath}".`;
            }
            throw wrapped;
        }

        const sidecar = syncSidecar ? installSidecarPlugin({ homeDir }) : null;
        return {
            changed: true,
            status: 'patched',
            upgraded: status.state === 'legacy_or_stale',
            payloadHash: expectedPayloadHash,
            anchorMatch: matchedAnchor,
            asarPath,
            backupPath,
            appVersion: status.appVersion || null,
            rtlPreserved: hasSiblingMod,
            sidecar
        };
    } catch (err) {
        throw wrapFsError(err, 'patch app.asar', asarPath);
    } finally {
        asar.uncache(tmpPath);
        fs.rmSync(tmpPath, { force: true });
    }
}

export function restoreAsar(asarPath, { strictBackup = false, removeSidecar = true, homeDir = os.homedir() } = {}) {
    assertValidAsarTarget(asarPath);

    if (isAntigravityRunningForAsar(asarPath)) {
        throw new PatchError('ANTIGRAVITY_RUNNING', 'Antigravity.exe is currently running and holding app.asar open.', {
            causeText: 'Windows locks open ASAR files while the Electron app is running.',
            fix: 'Quit Antigravity completely (check System Tray) before restoring.',
            exitCode: 2
        });
    }

    const backupPath = `${asarPath}.bak`;
    const backupInfo = inspectBackup(backupPath);
    const status = getPatchStatus(asarPath);
    const currentUtils = status.state !== 'corrupt' ? readUtilsFromAsar(asarPath) : '';
    const hasSiblingRtl = hasAnyRtlComment(currentUtils);

    const sidecarResult = removeSidecar ? installSidecarPlugin({ homeDir, remove: true }) : null;

    if (status.state === 'unpatched') {
        if (!hasSiblingRtl && backupInfo.exists && backupInfo.state === 'patched') {
            fs.rmSync(backupPath, { force: true });
        }
        return {
            restored: false,
            mode: 'already_original',
            asarPath,
            sidecar: sidecarResult,
            message: 'Context Monitor is not applied to app.asar.'
        };
    }

    // If RTL sibling mod is still active, strip ONLY Context Monitor and preserve clean .bak + RTL + original anchor.
    if (hasSiblingRtl && (status.state === 'patched' || status.state === 'legacy_or_stale')) {
        const withoutCtx = stripOwnPatch(currentUtils);
        if (!withoutCtx) {
            throw new PatchError('RESTORE_VERIFY_FAILED', 'Could not cleanly strip Context Monitor block while preserving RTL.', {
                causeText: 'Context Monitor markers were malformed.',
                fix: 'Restore all mods together or reinstall Antigravity Desktop.'
            });
        }
        new vm.Script(withoutCtx, { filename: UTILS_REL_PATH });
        const tmpPath = `${asarPath}.restore-${process.pid}`;
        try {
            rebuildAsarWithOverrides(asarPath, tmpPath, { [UTILS_REL_PATH]: Buffer.from(withoutCtx, 'utf8') });
            asar.uncache(tmpPath);
            const verifiedUtils = asar.extractFile(tmpPath, UTILS_REL_PATH).toString('utf8');
            if (hasAnyContextComment(verifiedUtils) || !hasAnyRtlComment(verifiedUtils)) {
                throw new PatchError('RESTORE_VERIFY_FAILED', 'Sibling-preserving strip verification failed.', {
                    causeText: 'Unexpected block state after stripping Context Monitor.',
                    fix: 'Run full restore or reinstall Antigravity Desktop.'
                });
            }
            fs.copyFileSync(tmpPath, asarPath);
            asar.uncache(asarPath);
            return {
                restored: true,
                mode: 'strip_preserve_sibling',
                asarPath,
                rtlPreserved: true,
                sidecar: sidecarResult
            };
        } catch (err) {
            throw wrapFsError(err, 'strip Context Monitor while preserving RTL', asarPath);
        } finally {
            asar.uncache(tmpPath);
            fs.rmSync(tmpPath, { force: true });
        }
    }

    // Primary path: byte-exact restoration from verified clean app.asar.bak when no other mods remain.
    if (backupInfo.state === 'clean') {
        try {
            const bakHash = sha256File(backupPath);
            fs.copyFileSync(backupPath, asarPath);
            asar.uncache(asarPath);
            const restoredHash = sha256File(asarPath);
            if (restoredHash !== bakHash) {
                throw new PatchError('RESTORE_VERIFY_FAILED', 'Restored app.asar SHA-256 did not match backup.', {
                    causeText: 'File copy verification mismatch after restoring backup.',
                    fix: `Backup is still safe at "${backupPath}". Retry.`
                });
            }
            fs.unlinkSync(backupPath);
            return { restored: true, mode: 'exact_backup', asarPath, sha256: restoredHash, sidecar: sidecarResult };
        } catch (err) {
            throw wrapFsError(err, 'restore from app.asar.bak', asarPath);
        }
    }

    if (!strictBackup && (status.state === 'patched' || status.state === 'legacy_or_stale')) {
        const cleanUtils = stripOwnPatch(currentUtils);
        if (cleanUtils) {
            new vm.Script(cleanUtils, { filename: UTILS_REL_PATH });
            const tmpPath = `${asarPath}.restore-${process.pid}`;
            try {
                rebuildAsarWithOverrides(asarPath, tmpPath, { [UTILS_REL_PATH]: Buffer.from(cleanUtils, 'utf8') });
                asar.uncache(tmpPath);
                const verifiedUtils = asar.extractFile(tmpPath, UTILS_REL_PATH).toString('utf8');
                if (hasAnyContextComment(verifiedUtils)) {
                    throw new PatchError('RESTORE_VERIFY_FAILED', 'Fallback strip verification failed.', {
                        causeText: 'Context Monitor markers remained after strip rebuild.',
                        fix: 'Reinstall Antigravity Desktop cleanly.'
                    });
                }
                fs.copyFileSync(tmpPath, asarPath);
                asar.uncache(asarPath);
                if (backupInfo.exists) fs.rmSync(backupPath, { force: true });
                return { restored: true, mode: 'strip_fallback', asarPath, sidecar: sidecarResult };
            } catch (err) {
                throw wrapFsError(err, 'rebuild unpatched app.asar', asarPath);
            } finally {
                asar.uncache(tmpPath);
                fs.rmSync(tmpPath, { force: true });
            }
        }
    }

    throw new PatchError('NO_BACKUP', `No clean backup found at: ${backupPath}`, {
        causeText: 'app.asar.bak is missing or invalid and automatic strip could not proceed.',
        fix: 'Reinstall official Antigravity Desktop.'
    });
}

export function runDoctor(asarPath) {
    const checks = [];
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    checks.push({
        id: 'node_runtime',
        status: nodeMajor >= 20 ? 'PASS' : 'FAIL',
        detail: `Node.js v${process.versions.node} (${process.platform}/${process.arch})`,
        fix: nodeMajor >= 20 ? '' : 'Install Node.js 20+ from https://nodejs.org/'
    });

    const configPath = path.join(os.homedir(), '.antigravity-context-monitor.json');
    if (!fs.existsSync(configPath)) {
        checks.push({ id: 'user_config', status: 'PASS', detail: `No custom config yet (${configPath}); safe defaults apply.` });
    } else {
        try {
            JSON.parse(fs.readFileSync(configPath, 'utf8'));
            checks.push({ id: 'user_config', status: 'PASS', detail: `Valid JSON config at ${configPath}` });
        } catch (err) {
            checks.push({ id: 'user_config', status: 'WARN', detail: `Malformed JSON at ${configPath}: ${err.message}`, fix: `Fix or delete ${configPath}` });
        }
    }

    try {
        readBundleAssets();
        checks.push({ id: 'bundle_assets', status: 'PASS', detail: `context-core.cjs and runtime-patch.js present (payload sha256: ${computeExpectedPayloadHash()}).` });
    } catch (err) {
        checks.push({ id: 'bundle_assets', status: 'FAIL', detail: err.message, fix: err.fix });
    }

    checks.push({
        id: 'sidecar_plugin',
        status: isSidecarPluginInstalled() ? 'PASS' : 'WARN',
        detail: isSidecarPluginInstalled()
            ? `Sidecar UI extension installed at ${getSidecarInstallDir()}`
            : `Sidecar UI extension not synced yet (run patch to install at ${getSidecarInstallDir()}).`
    });

    const st = getPatchStatus(asarPath);
    if (!st.exists) {
        checks.push({
            id: 'asar_target',
            status: 'FAIL',
            detail: asarPath ? `app.asar not found at ${asarPath}` : 'Antigravity Desktop app.asar not detected in standard locations.',
            fix: 'Install Antigravity Desktop or pass `--path "C:\\path\\to\\resources\\app.asar"`.'
        });
    } else if (st.state === 'corrupt') {
        checks.push({
            id: 'asar_target',
            status: 'FAIL',
            detail: `Corrupt app.asar at ${asarPath}: ${st.corruptReason}`,
            fix: st.backupState === 'clean' ? 'Run `node src/patcher.mjs restore`.' : 'Reinstall Antigravity Desktop.'
        });
    } else {
        checks.push({
            id: 'asar_target',
            status: 'PASS',
            detail: `Found Antigravity${st.appVersion ? ' v' + st.appVersion : ''} (${asarPath}) — state: ${st.state}${st.needsUpgrade ? ' (upgrade available)' : ''}${st.rtlPresent ? ' (coexisting with RTL)' : ''}`
        });
        checks.push({
            id: 'anchor_check',
            status: st.hasAnchor ? 'PASS' : 'FAIL',
            detail: st.hasAnchor
                ? `Startup hook "${st.anchorMatch || 'embedded'}" verified.`
                : `Missing expected startup hook (loadHubWindowUrl / win.loadURL) in ${UTILS_REL_PATH}.`
        });
        checks.push({
            id: 'backup_health',
            status: st.backupState === 'corrupt' || st.backupState === 'patched' ? 'WARN' : 'PASS',
            detail: `Backup (.bak) state: ${st.backupState}`
        });
        checks.push({
            id: 'process_lock',
            status: st.running ? 'WARN' : 'PASS',
            detail: st.running ? 'Antigravity.exe is currently running (close before patching/restoring).' : 'No locking Antigravity.exe process detected.'
        });
    }

    const hasFail = checks.some((c) => c.status === 'FAIL');
    const hasWarn = checks.some((c) => c.status === 'WARN');
    return {
        healthy: !hasFail,
        overall: hasFail ? 'FAIL' : (hasWarn ? 'WARN' : 'PASS'),
        asarStatus: st,
        checks
    };
}

export function parseCliArgs(argv) {
    const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'status';
    let customPath = null;
    let convId = null;
    let modelOverride = 'auto';
    let modelOverrideExplicit = false;

    const pathIdx = argv.indexOf('--path');
    if (pathIdx !== -1) {
        if (!argv[pathIdx + 1] || argv[pathIdx + 1].startsWith('-')) {
            throw new PatchError('MISSING_PATH_VALUE', 'Flag `--path` requires a file path argument.', {
                fix: 'Example: `node src/patcher.mjs status --path "C:\\path\\to\\resources\\app.asar"`'
            });
        }
        customPath = argv[pathIdx + 1];
    }

    const convIdx = argv.indexOf('--conv');
    if (convIdx !== -1) {
        if (!argv[convIdx + 1] || argv[convIdx + 1].startsWith('-')) {
            throw new PatchError('MISSING_CONV_VALUE', 'Flag `--conv` requires a conversation ID argument.', {
                fix: 'Example: `node src/patcher.mjs analyze --conv "<conversation-uuid>" --json`'
            });
        }
        convId = argv[convIdx + 1];
    }

    const modelIdx = argv.indexOf('--model');
    if (modelIdx !== -1) {
        if (!argv[modelIdx + 1] || argv[modelIdx + 1].startsWith('-')) {
            throw new PatchError('MISSING_MODEL_VALUE', 'Flag `--model` requires a model ID or display name argument.', {
                fix: 'Example: `node src/patcher.mjs analyze --model "claude-sonnet-5-5-high" --json`'
            });
        }
        modelOverride = argv[modelIdx + 1];
        modelOverrideExplicit = true;
    }

    return {
        cmd,
        convId,
        modelOverride,
        modelOverrideExplicit,
        ifNeeded: argv.includes('--if-needed'),
        strictBackup: argv.includes('--strict-backup'),
        json: argv.includes('--json'),
        asarPath: resolveAsarTarget(customPath)
    };
}

function formatErrorText(err) {
    const code = err.code || 'ERROR';
    const lines = [`[antigravity-context-monitor] ERROR (${code}): ${err.message}`];
    if (err.causeText) lines.push(`  Cause: ${err.causeText}`);
    if (err.fix) lines.push(`  Fix:   ${err.fix}`);
    return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
    let opts = { json: process.argv.includes('--json') };
    try {
        opts = parseCliArgs(process.argv.slice(2));
        let result;
        if (opts.cmd === 'status') {
            result = getPatchStatus(opts.asarPath);
        } else if (opts.cmd === 'doctor') {
            result = runDoctor(opts.asarPath);
        } else if (opts.cmd === 'patch') {
            result = patchAsar(opts.asarPath, { ifNeeded: opts.ifNeeded });
        } else if (opts.cmd === 'restore') {
            result = restoreAsar(opts.asarPath, { strictBackup: opts.strictBackup });
        } else if (opts.cmd === 'sync') {
            const coreSynced = syncCoreToSidecar();
            const sidecar = installSidecarPlugin();
            result = { synced: true, coreSynced, sidecar };
        } else if (opts.cmd === 'analyze') {
            const core = require('./context-core.cjs');
            const analyzer = core.createContextAnalyzer({ fs, path, os });
            const settingsStore = core.createSettingsStore({ fs, path, os });
            const cfg = settingsStore.readSettings();
            const recent = analyzer.listRecentConversations({
                limit: 10,
                customModels: cfg.customModels,
                compactWarnPct: cfg.compactWarnPct
            });
            const targetId = opts.convId || (recent[0]?.conversationId || '');
            const effectiveModel = opts.modelOverrideExplicit ? opts.modelOverride : cfg.modelOverride;
            result = {
                targetConversationId: targetId,
                discoveredModels: analyzer.discoverModels({ customModels: cfg.customModels }),
                analysis: targetId
                    ? analyzer.analyzeConversationDir(targetId, {
                        modelOverride: effectiveModel,
                        compactWarnPct: cfg.compactWarnPct,
                        customModels: cfg.customModels
                    })
                    : null,
                recentConversations: recent
            };
        } else {
            throw new PatchError('INVALID_COMMAND', `Unknown command: ${opts.cmd}`, {
                fix: 'Use one of: `status` | `doctor` | `patch [--if-needed]` | `restore [--strict-backup]` | `sync` | `analyze [--conv <id>] [--model <id>]`'
            });
        }

        if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
        } else if (opts.cmd === 'doctor') {
            console.log(`[antigravity-context-monitor] doctor: ${result.overall}`);
            for (const c of result.checks) {
                console.log(`  [${c.status}] ${c.id}: ${c.detail}`);
                if (c.fix) console.log(`         -> Fix: ${c.fix}`);
            }
        } else {
            console.log(`[antigravity-context-monitor] ${opts.cmd}: ${JSON.stringify(result)}`);
        }
        if (opts.cmd === 'doctor' && !result.healthy) {
            process.exit(1);
        }
    } catch (err) {
        if (opts.json) {
            console.error(JSON.stringify({
                error: err.message,
                code: err.code || 'ERROR',
                cause: err.causeText || '',
                fix: err.fix || '',
                details: err.details
            }, null, 2));
        } else {
            console.error(formatErrorText(err));
        }
        process.exit(err.exitCode || 1);
    }
}
