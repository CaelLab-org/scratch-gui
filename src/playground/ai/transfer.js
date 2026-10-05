/**
 * 配置导出 / 导入合并（`.output.xce`）。
 *
 * 为什么整这一套：密钥、自定义供应商、提示词、记忆、技能全都存在**这台机器的浏览器里**
 * （网页版是 cookie + localStorage，桌面版是 userData/settings.json + localStorage），
 * 换台机器就全丢，用户等于从零配一遍 —— 这是他自己提的需求（「不然用户无法迁移」）。
 *
 * 文件是一段 JSON 文本，名字 `<...>.output.xce`。**默认带 API 密钥**（不带就迁不了机器，
 * 迁移是这套东西存在的主要理由），但导出页上给一个勾选框可以不带，并且明确警示
 * 「这个文件等于你的密钥」。导入时**文件里的值覆盖同名项，本地独有的项原样保留** ——
 * 合并而不是替换，所以在一台已经配好的机器上导入老文件不会把它掏空。
 *
 * 不含**对话记录**：那是会话库（store.js）里的东西，体量大、也不属于「配置」——
 * 对话走下面第二个格式 `.chat.xce`（单条导出 / 整库导出 / 合并导入，见后半段）。
 * 也不含拉回来的模型清单缓存（那是一次性的缓存，同一把 key 随时能重新拉）。
 */

import {
    loadSettings, saveSettings, loadAllProviderKeys, mergeProviderKeys
} from './settings.js';
import {loadCustomProviders, saveCustomProviders} from './custom-providers.js';
import {loadMemories, saveMemory} from './memory.js';
import {loadUserSkills, saveUserSkill} from './user-skills.js';
import {exportConversation, exportAllConversations} from './store.js';

// 认这个标记才算自家文件：别人家的 json / 随便一个文件丢进来，宁可不认也不要乱写。
// 两个格式标记放一起：两个解析器都要拿它们互相指路（拿了对话文件来导配置之类）
const FORMAT = 'xce-ai-config';
const VERSION = 1;
export const CONFIG_EXTENSION = '.output.xce';
const CHAT_FORMAT = 'xce-ai-chat';

// 导出文件里带上导出时的应用版本（构建时由 webpack 注入），以后翻老文件不用猜是哪一版导的
const APP_VERSION = process.env.XCE_VERSION || '';

/**
 * 把当前这台机器上的 AI 配置收成一份可导出的对象
 * @param {object} [opts] {includeKeys} 含不含 API 密钥（默认含）
 * @returns {object} 配置对象
 */
export const collectConfig = ({includeKeys = true} = {}) => {
    const settings = loadSettings();
    return {
        format: FORMAT,
        type: 'config',
        version: VERSION,
        appVersion: APP_VERSION,
        app: 'XMUER Coding Engine',
        exportedAt: new Date().toISOString(),
        settings: {
            providerId: settings.providerId,
            baseUrl: settings.baseUrl,
            modelId: settings.modelId,
            effort: settings.effort,
            contextWindow: settings.contextWindow,
            maxOutputTokens: settings.maxOutputTokens,
            maxSteps: settings.maxSteps,
            userPrompt: settings.userPrompt || ''
        },
        // 不带密钥时给 null（而不是 {}）：导入那边据此知道「这份文件里没有密钥」，
        // 于是不动本地已有的那把钥匙
        keys: includeKeys ? loadAllProviderKeys() : null,
        customProviders: loadCustomProviders(),
        memories: loadMemories(),
        skills: loadUserSkills()
    };
};

/**
 * 导出用的文件名：`xce-ai-config-20261004.output.xce`
 * @param {Date} [now] 当前时间
 * @returns {string} 文件名
 */
export const configFileName = (now = new Date()) => {
    const pad = value => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    return `xce-ai-config-${stamp}${CONFIG_EXTENSION}`;
};

/**
 * 触发下载（只在这一个地方碰 DOM —— 解析和合并那边都是纯的，能无头测）
 * @param {object} config collectConfig 的结果
 * @param {string} [filename] 文件名，不给就按今天算
 * @returns {boolean} 提交给浏览器了没有
 */
export const downloadConfig = (config, filename = configFileName()) => {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return false;
    const blob = new Blob([JSON.stringify(config, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // 立刻回收：文件已经在下载队列里了，URL 留着只是占内存
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
};

/**
 * 读一份导入文件（先认格式，再谈内容）
 * @param {string} text 文件原文
 * @returns {object} {config} 或 {error} —— 认不出来就只说哪里不对，绝不猜着写
 */
export const parseConfig = text => {
    let parsed;
    try {
        parsed = JSON.parse(String(text || ''));
    } catch (e) {
        return {error: '这不是一个配置文件（读不出 JSON）'};
    }
    if (!parsed || typeof parsed !== 'object') return {error: '文件内容不是一个配置对象'};
    if (parsed.format !== FORMAT) {
        // 拿错文件是高频操作（两类都是 .xce），type / format 有一个能对上就指路
        if (parsed.type === 'chat' || parsed.format === CHAT_FORMAT) {
            return {error: '这是对话文件（.chat.xce），对话记录要用同一页下面的「导入对话记录」'};
        }
        return {error: `看起来不是 XCE 的配置文件（format 是 ${JSON.stringify(parsed.format)}）`};
    }
    const version = Number(parsed.version);
    if (!(version >= 1) || version > VERSION) {
        return {error: `文件版本是 ${parsed.version}，这个版本的编辑器读不了`};
    }
    return {config: parsed};
};

/**
 * 合并一份配置进来：**文件里的值覆盖同名项，本地独有的留着**。
 *
 * 记忆和技能按**名字**合并（同名覆盖、名字没见过的补上）；自定义供应商按 id 合并；
 * 密钥按供应商 id 合并（一家一把，文件里的赢）。设置本体（当前供应商 / 模型 / 限额 /
 * 提示词）整份采用文件里的值 —— 那本来就是「你上次那套设置」。
 *
 * @param {object} config parseConfig 出来的配置
 * @returns {object} 摘要 {settings, keys, providers, memories, skills, warnings}
 */
export const mergeConfig = config => {
    const summary = {
        // 文件是哪一版导的（老文件没这个字段就是空串），导入完报给用户 —— 出问题时能一眼对上是哪一代产物
        sourceVersion: config.appVersion || '',
        settings: [],
        keys: 0,
        providers: {added: 0, updated: 0},
        memories: {added: 0, updated: 0},
        skills: {added: 0, updated: 0},
        warnings: []
    };

    // 设置本体：有的字段才写（老文件可能没有限额字段）
    if (config.settings && typeof config.settings === 'object') {
        const incoming = config.settings;
        const current = loadSettings();
        // 文件里没有的字段（undefined）保留本地值 —— 合并不是「用一份空的把你清掉」
        const keep = (value, fallback) => (value === void 0 ? fallback : value);
        saveSettings({
            ...current,
            providerId: keep(incoming.providerId, current.providerId),
            baseUrl: keep(incoming.baseUrl, current.baseUrl),
            modelId: keep(incoming.modelId, current.modelId),
            effort: keep(incoming.effort, current.effort),
            contextWindow: keep(incoming.contextWindow, current.contextWindow),
            maxOutputTokens: keep(incoming.maxOutputTokens, current.maxOutputTokens),
            maxSteps: keep(incoming.maxSteps, current.maxSteps),
            // 提示词是用户的字，空串 = 文件里确实没写，那就别覆盖本地的
            userPrompt: incoming.userPrompt || current.userPrompt
        });
        summary.settings.push('模型与限额');
        if (incoming.userPrompt) summary.settings.push('自定义提示词');
    } else {
        summary.warnings.push('文件里没有设置本体，只合并了清单');
    }

    if (config.keys && typeof config.keys === 'object') {
        summary.keys = mergeProviderKeys(config.keys);
    } else if (config.keys === null) {
        summary.warnings.push('这份文件导出时没带密钥，本地的密钥保持不动');
    }

    if (Array.isArray(config.customProviders)) {
        const current = loadCustomProviders();
        const merged = current.slice();
        for (const entry of config.customProviders) {
            if (!entry || !entry.id || !entry.baseUrl) continue;
            const index = merged.findIndex(item => item.id === entry.id);
            if (index === -1) {
                merged.push(entry);
                summary.providers.added++;
            } else {
                merged[index] = {...merged[index], ...entry};
                summary.providers.updated++;
            }
        }
        saveCustomProviders(merged);
    }

    if (Array.isArray(config.memories)) {
        for (const entry of config.memories) {
            if (!entry || !entry.name) continue;
            const result = saveMemory({
                name: entry.name,
                description: entry.description,
                type: entry.type,
                body: entry.body
            });
            if (!result.memory) {
                summary.warnings.push(`记忆「${entry.name}」没能导入：${result.error || '格式不对'}`);
            } else if (result.created) {
                summary.memories.added++;
            } else {
                summary.memories.updated++;
            }
        }
    }

    if (Array.isArray(config.skills)) {
        for (const entry of config.skills) {
            if (!entry || !entry.name || !entry.body) continue;
            const result = saveUserSkill({
                name: entry.name,
                description: entry.description,
                body: entry.body
            });
            if (result.error) summary.warnings.push(`技能「${entry.name}」没能导入：${result.error}`);
            else if (result.created) summary.skills.added++;
            else summary.skills.updated++;
        }
    }

    return summary;
};

// ---------------------------------------------------------------------------
// 对话记录导出 / 导入（`.chat.xce`）
//
// 跟上面的配置迁移是两回事：这里搬的是会话库里的对话（messages + items + 用量）。
// 单条导出挂历史列表（把一条对话带给别人 / 换台机器接着聊），整库导出和导入挂在
// 备份页。导入是**合并**：id 对得上的算同一条对话，撞车了**不覆盖**，把两边都列出来
// 让用户裁决（文件为准 / 本地为准 / 两条都留）；id 没见过的直接补进来。
// 文件里是完整聊天记录，可能带私密内容 —— 导出页上要提醒一句。
// ---------------------------------------------------------------------------

const CHAT_VERSION = 1;
export const CHAT_EXTENSION = '.chat.xce';

/**
 * 收一份可导出的对话文件。ids 不给 / 给 null = 整库导出；给 id 数组 = 只导这几条。
 * @param {string[]|null} [ids] 会话 id 列表
 * @returns {object} 文件对象
 */
export const collectChatFile = ids => {
    const conversations = ids ?
        ids.map(id => exportConversation(id)).filter(Boolean) :
        exportAllConversations();
    return {
        format: CHAT_FORMAT,
        type: 'chat',
        version: CHAT_VERSION,
        appVersion: APP_VERSION,
        app: 'XMUER Coding Engine',
        exportedAt: new Date().toISOString(),
        conversations
    };
};

// 文件名里的标题做个清洗：路径分隔符和 Windows 禁字符去掉，掐到 40 字
const fileNameSlug = title => String(title || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);

/**
 * 导出用的文件名。单条：`xce-chat-对话标题-20261005.chat.xce`；整库：`xce-chat-all-…`
 * @param {string} [title] 对话标题（不给 = 整库导出的名字）
 * @param {Date} [now] 当前时间
 * @returns {string} 文件名
 */
export const chatFileName = (title = '', now = new Date()) => {
    const pad = value => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const slug = title ? fileNameSlug(title) : 'all';
    return `xce-chat-${slug}-${stamp}${CHAT_EXTENSION}`;
};

/**
 * 触发一份对话文件的下载（跟 downloadConfig 同一个套路，只在这一处碰 DOM）
 * @param {object} file collectChatFile 的结果
 * @param {string} [filename] 文件名，不给就按内容算（单条取标题，整库叫 all）
 * @returns {boolean} 提交给浏览器了没有
 */
export const downloadChat = (file, filename) => {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return false;
    const name = filename ||
        chatFileName(file.conversations.length === 1 ? file.conversations[0].title : '');
    const blob = new Blob([JSON.stringify(file, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
};

/**
 * 读一份对话文件（先认格式，再谈内容）
 * @param {string} text 文件原文
 * @returns {object} {conversations} 或 {error}
 */
export const parseChat = text => {
    let parsed;
    try {
        parsed = JSON.parse(String(text || ''));
    } catch (e) {
        return {error: '这不是一个对话文件（读不出 JSON）'};
    }
    if (!parsed || typeof parsed !== 'object') return {error: '文件内容不是一个对话对象'};
    if (parsed.format !== CHAT_FORMAT) {
        // 帮一把拿错文件的人：配置文件和对话文件都是 .xce，别让 ta 对着「格式不对」发懵
        if (parsed.type === 'config' || parsed.format === FORMAT) {
            return {error: '这是配置文件（.output.xce），配置要用同一页上面的「导入」'};
        }
        return {error: `看起来不是 XCE 的对话文件（format 是 ${JSON.stringify(parsed.format)}）`};
    }
    const version = Number(parsed.version);
    if (!(version >= 1) || version > CHAT_VERSION) {
        return {error: `文件版本是 ${parsed.version}，这个版本的编辑器读不了`};
    }
    if (!Array.isArray(parsed.conversations)) return {error: '文件里没有对话列表'};
    return {conversations: parsed.conversations};
};
