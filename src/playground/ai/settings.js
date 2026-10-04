/**
 * 模型设置的存取。
 *
 * 设置本体（供应商 / base_url / 模型 id / api_key / 思考档位）存哪儿分两种情况：
 *   - **网页版：cookie**。key 是秘密，按用户要求放 cookie（非 HttpOnly 才能被前端读出来
 *     自己塞 Authorization 头，也就是说 XSS 能读到它，与 localStorage 同级）。BYOK，服务端不参与。
 *   - **桌面版：主进程的文件**。xce:// 是自定义协议，Chromium 不给它写 cookie
 *     （渲染端的 document.cookie 静默失败，主进程的 session.cookies.set 直接报 invalid domain），
 *     所以改存 userData 下的 settings.json。preload 在页面脚本之前同步取一份快照，
 *     这里启动时探测一次写进常量，读取全同步 —— loadSettings 在 render 里就调，等不了 IPC。
 *     写走 settingsWrite 异步落盘，失败的只是这一次落盘（下次启动退回上一份）。
 *
 * 另外几样仍放 localStorage（两端一致）：从接口拉回来的模型清单（不是秘密，还可能上百条，
 * cookie 的 4KB 装不下）、用户在设置里写的自定义提示词、用户自己添加的供应商清单
 * （多条，见 custom-providers.js），以及**每家供应商各自的密钥表**。
 * 密钥单独一张表按供应商 id 存：多供应商来回切的时候，一个字段会被覆盖成上一家的 key，
 * 用户每次都得重贴一遍 —— 分开存就各自恢复自己那把。
 */
import {getProvider, keyRequired, PROVIDERS, resolveModel, thinkingOf} from './providers.js';
import {customProviders, saveCustomProviders} from './custom-providers.js';
import {clampMaxSteps} from './loop.js';

const COOKIE_NAME = 'xce_ai_model';
const MODELS_KEY = 'xce_ai_models';
const KEYS_KEY = 'xce_ai_keys';
const USER_PROMPT_KEY = 'xce_ai_prompt';
// 老版本只有一条「自定义」（id 固定是 custom），搬进自定义列表时用这个 id
const LEGACY_CUSTOM_ID = 'custom-legacy';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 半年

const readCookie = name => {
    const target = `${name}=`;
    for (const part of document.cookie.split(';')) {
        const trimmed = part.trim();
        if (trimmed.startsWith(target)) {
            try {
                return decodeURIComponent(trimmed.slice(target.length));
            } catch (e) {
                return null;
            }
        }
    }
    return null;
};

const writeCookie = (name, value) => {
    const encoded = encodeURIComponent(value);
    document.cookie = `${name}=${encoded}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`;
};

/**
 * 桌面版（Electron 壳）的设置通道，启动时探测一次，运行期不再变。
 * settingsWrite 只有桌面版的 preload 才挂；网页版探测为 null，下面一律走 cookie，行为与从前一致。
 */
const desktopBridge = (typeof window === 'object' && window.EditorPreload &&
    typeof window.EditorPreload.settingsWrite === 'function') ? window.EditorPreload : null;

/** 桌面版的内存副本：启动时由 preload 的快照喂进来，之后是本会话的真相（读同步、写异步落盘） */
let desktopCache = desktopBridge ? (desktopBridge.settingsSnapshot || null) : null;

/**
 * 读设置本体
 * @returns {string|null} 桌面版读内存副本，网页版读 cookie；没存过就是 null
 */
const readRawSettings = () => (desktopBridge ? desktopCache : readCookie(COOKIE_NAME));

const writeRawSettings = raw => {
    if (desktopBridge) {
        desktopCache = raw;
        // 落盘失败就只丢这一次写（下次启动退回上一份），别让界面卡在等待上
        desktopBridge.settingsWrite(raw).catch(() => {});
        return;
    }
    writeCookie(COOKIE_NAME, raw);
};

const clearRawSettings = () => {
    if (desktopBridge) {
        desktopCache = null;
        desktopBridge.settingsWrite(null).catch(() => {});
        return;
    }
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
};

// ---------------------------------------------------------------------------
// 拉取到的模型清单缓存
// ---------------------------------------------------------------------------

const cacheKey = (providerId, baseUrl) => `${providerId}|${baseUrl || ''}`;

const readModelCache = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(MODELS_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
};

/**
 * 取某家（某个 base_url）下缓存到的模型清单
 * @param {string} providerId 供应商 id
 * @param {string} baseUrl 该供应商的 base_url（自定义端点是用户填的，所以要一起当 key）
 * @returns {Array<object>} 缓存的模型条目，没有就空数组
 */
export const loadModelCache = (providerId, baseUrl) => {
    const entry = readModelCache()[cacheKey(providerId, baseUrl)];
    return entry && Array.isArray(entry.models) ? entry.models : [];
};

export const saveModelCache = (providerId, baseUrl, models) => {
    try {
        const all = readModelCache();
        all[cacheKey(providerId, baseUrl)] = {models, fetchedAt: Date.now()};
        localStorage.setItem(MODELS_KEY, JSON.stringify(all));
    } catch (e) {
        // 存不下就算了
    }
    return models;
};

// ---------------------------------------------------------------------------
// 密钥表：一家供应商一把钥匙
// ---------------------------------------------------------------------------

const readKeys = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(KEYS_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
};

/**
 * 取某家的密钥
 * @param {string} providerId 供应商 id
 * @returns {string} 密钥，没存过就是空串
 */
export const loadProviderKey = providerId => {
    const key = readKeys()[providerId];
    return typeof key === 'string' ? key : '';
};

const saveProviderKey = (providerId, apiKey) => {
    if (!providerId) return;
    try {
        const all = readKeys();
        if (apiKey) all[providerId] = apiKey;
        else delete all[providerId];
        localStorage.setItem(KEYS_KEY, JSON.stringify(all));
    } catch (e) {
        // 存不下就算了
    }
};

// ---------------------------------------------------------------------------
// 设置本身
// ---------------------------------------------------------------------------

/**
 * 用户在设置里写的自定义提示词。拼在系统提示词后面（见 prompt.js）。
 * 放 localStorage 不放 cookie：它不是秘密，还可能写挺长，而 cookie 只有 4KB
 * 而且每次同域请求都会上行。
 * @returns {string} 自定义提示词，没写过就是空串
 */
export const loadUserPrompt = () => {
    try {
        return localStorage.getItem(USER_PROMPT_KEY) || '';
    } catch (e) {
        return '';
    }
};

/**
 * @param {string} text 自定义提示词，空串等于清掉
 * @returns {string} 存下来的值
 */
export const saveUserPrompt = text => {
    try {
        if (text) localStorage.setItem(USER_PROMPT_KEY, text);
        else localStorage.removeItem(USER_PROMPT_KEY);
    } catch (e) {
        // 存不下就算了
    }
    return text || '';
};

/**
 * 模型默认的思考档位：接口声明过 default_level 就用它，否则用「高」
 * @param {string} providerId 供应商 id
 * @param {object} model 模型条目，可能没有
 * @returns {string} 档位 value；这家没有思考档位就是空串
 */
const defaultEffort = (providerId, model) => {
    const thinking = thinkingOf(providerId, model ? model.id : '');
    if (!thinking) return '';
    if (model && model.defaultLevel && thinking.levels.some(level => level.value === model.defaultLevel)) {
        return model.defaultLevel;
    }
    const preferred = thinking.levels.find(level => level.value === 'high');
    return preferred ? preferred.value : thinking.levels[thinking.levels.length - 1].value;
};

/**
 * 某家供应商的出厂设置（还没读过 cookie 时用）
 * @param {string} providerId 供应商 id
 * @returns {object} 一份不含 apiKey 的设置
 */
export const defaultSettingsFor = providerId => {
    const provider = getProvider(providerId);
    const cached = loadModelCache(providerId, provider.baseUrl);
    const first = cached[0] || provider.models[0];
    return {
        providerId: provider.id,
        baseUrl: provider.baseUrl,
        modelId: first ? first.id : '',
        models: cached,
        apiKey: loadProviderKey(provider.id),
        effort: defaultEffort(provider.id, first)
    };
};

export const DEFAULT_SETTINGS = {
    ...defaultSettingsFor('deepseek'),
    userPrompt: loadUserPrompt()
};

export const loadSettings = () => {
    const raw = readRawSettings();
    if (!raw) return {...DEFAULT_SETTINGS};
    try {
        const parsed = JSON.parse(raw);
        // 老设置的「自定义供应商」只有一条，地址和密钥都存在设置本体里。现在自定义是多条、各存各的，
        // 所以把它搬成列表里的一条（密钥跟着搬过去，用户不用重填），再把这条设为当前供应商。
        let providerId = parsed.providerId;
        if (providerId === 'custom') {
            const existing = customProviders().find(p => p.id === LEGACY_CUSTOM_ID);
            if (!existing) {
                saveCustomProviders(customProviders().concat([{
                    id: LEGACY_CUSTOM_ID,
                    name: '自定义供应商',
                    wire: 'openai',
                    baseUrl: parsed.baseUrl || ''
                }]));
            }
            providerId = LEGACY_CUSTOM_ID;
        }
        providerId = getProvider(providerId).id;
        // 老设置的密钥是跟着设置本体走的，现在每家一把钥匙存在密钥表里 —— 第一次读到就搬过去，
        // 用户不用重填（预设和那条老「自定义」都走这一条）
        if (parsed.apiKey && !loadProviderKey(providerId)) saveProviderKey(providerId, parsed.apiKey);
        const provider = getProvider(providerId);
        const baseUrl = parsed.baseUrl === void 0 ? provider.baseUrl : parsed.baseUrl;
        const models = loadModelCache(providerId, baseUrl);
        const known = provider.models.concat(models);
        // 清单里找不到就保留用户手填的那个 id（自定义供应商刚建、还没拉清单时只有它）
        const model = known.find(m => m.id === parsed.modelId) || known[0] ||
            (parsed.modelId ? {id: parsed.modelId} : null);
        return {
            providerId,
            baseUrl,
            modelId: model ? model.id : '',
            models,
            apiKey: loadProviderKey(providerId),
            effort: parsed.effort || defaultEffort(providerId, model),
            // 用户自定义的限额（数字），没存过就是 undefined = 自动
            contextWindow: Number(parsed.contextWindow) > 0 ? Number(parsed.contextWindow) : void 0,
            maxOutputTokens: Number(parsed.maxOutputTokens) > 0 ? Number(parsed.maxOutputTokens) : void 0,
            // 单轮往返上限：存过就夹进 5~120，没存过 undefined = 用默认值（见 loop.js 的 maxStepsOf）
            maxSteps: Number(parsed.maxSteps) > 0 ? clampMaxSteps(parsed.maxSteps) : void 0,
            userPrompt: loadUserPrompt()
        };
    } catch (e) {
        return {...DEFAULT_SETTINGS};
    }
};

export const saveSettings = settings => {
    // 空串/非法值不存 —— 存 undefined 的意思就是「自动，用模型元数据」
    const limits = {};
    if (Number(settings.contextWindow) > 0) limits.contextWindow = Number(settings.contextWindow);
    if (Number(settings.maxOutputTokens) > 0) limits.maxOutputTokens = Number(settings.maxOutputTokens);
    if (Number(settings.maxSteps) > 0) limits.maxSteps = clampMaxSteps(settings.maxSteps);
    // 密钥按供应商 id 进密钥表，设置本体不带它（切供应商时各自恢复自己那把）
    saveProviderKey(settings.providerId, (settings.apiKey || '').trim());
    writeRawSettings(JSON.stringify({
        providerId: settings.providerId,
        baseUrl: settings.baseUrl,
        modelId: settings.modelId,
        effort: settings.effort,
        ...limits
    }));
    // 提示词单独存（不进 cookie，见 loadUserPrompt 的注释）
    saveUserPrompt(settings.userPrompt);
    return settings;
};

export const clearSettings = () => {
    clearRawSettings();
    try {
        localStorage.removeItem(KEYS_KEY);
    } catch (e) {
        // 清不掉就算了，设置本体已经清了
    }
    return {...DEFAULT_SETTINGS};
};

/**
 * 给界面用的一行摘要。**绝不回显 key 本身**
 * @param {object} settings 当前设置
 * @returns {string} 例如「DeepSeek · DeepSeek-V4.1-Flash」
 */
export const describeSettings = settings => {
    const provider = PROVIDERS.find(p => p.id === settings.providerId) || getProvider(settings.providerId);
    const model = resolveModel(settings);
    const label = model ? model.name : settings.modelId;
    return `${provider.name} · ${label}`;
};

// 本地端点（Ollama / 自建的 vLLM 之类）不需要密钥，别拿「没填 key」挡住用户
export const hasApiKey = settings =>
    !keyRequired(getProvider(settings.providerId), settings.baseUrl) ||
    !!(settings.apiKey && settings.apiKey.trim());
