import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('./context-core.cjs');
const defaultAnalyzer = core.createContextAnalyzer({ fs, path, os });

export const {
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
    analyzeTranscriptText
} = core;

export const {
    analyzeConversationDir,
    listRecentConversations,
    detectLatestGlobalModel,
    discoverModels,
    resolveContextPayload,
    findBrainDir,
    createContextAnalyzer
} = { ...defaultAnalyzer, createContextAnalyzer: core.createContextAnalyzer };
