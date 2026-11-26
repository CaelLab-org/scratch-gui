/*
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / XMUER Coding Engine
 * Licensed under the GNU Affero General Public License, Version 3 (AGPL-3.0-only)
 * https://www.gnu.org/licenses/agpl-3.0.txt
 * Source: https://github.com/CaelLab-org/scratch-gui
 * Project: https://engine.xmuer.online/
 */

/**
 * 外置 AI 的系统提示词。
 *
 * 跟面板里那份**同源**（同一个 buildSystemPrompt），差别只在渠道事实：
 * 没有面板、没有提问卡片、模型由对方的客户端决定（编辑器不知道）。
 * 不另写一份，是因为工具规矩、积木格式、项目约束这些内容一旦分叉，外置 AI 就会慢慢跑偏。
 */

import {buildSystemPrompt} from './prompt.js';
import {memoryIndexText} from './memory.js';
import {loadSettings} from './settings.js';
import {isDesktopMode} from './online.js';

export const buildExternalInstructions = ({port, tools}) => {
    // 拼提示词失败不能把整条桥带下去：任何一项读不到就用空值，至少工具清单还能照常发。
    const safe = (read, fallback) => {
        try {
            const value = read();
            return typeof value === 'undefined' || value === null ? fallback : value;
        } catch (error) {
            return fallback;
        }
    };
    const settings = safe(loadSettings, {}) || {};
    return buildSystemPrompt({
        currentSprite: safe(() => port && port.currentSpriteName(), ''),
        extensions: safe(() => port && port.loadedExtensions(), []),
        // 跟面板一样只给 UTC 日期；要准确时间让对方调 xce_get_time
        date: new Date().toISOString()
            .slice(0, 10),
        modelInfo: {
            name: 'unknown — an external AI client is reading this, so the editor cannot know the model',
            // 外置通道一律把图发出去；对方模型看不见的话，提示词里已经让对方直说
            supportsImage: true,
            contextWindow: '',
            maxOutputTokens: ''
        },
        userPrompt: settings.userPrompt,
        toolNames: (tools || []).map(tool => tool.name),
        runtime: isDesktopMode() ? 'desktop' : 'web',
        memoryIndex: safe(memoryIndexText, ''),
        projectAgent: safe(() => port && port.readAgentNote().text, ''),
        projectMemoryIndex: safe(() => port && port.readMemoryIndex(), ''),
        external: true
    });
};
