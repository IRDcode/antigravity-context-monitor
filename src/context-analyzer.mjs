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
    resolveModelProfile,
    estimateTokens,
    classifyToolName,
    reconcileCategories,
    analyzeTranscriptText
} = core;

export const {
    analyzeConversationDir,
    listRecentConversations,
    findBrainDir,
    createContextAnalyzer
} = { ...defaultAnalyzer, createContextAnalyzer: core.createContextAnalyzer };
