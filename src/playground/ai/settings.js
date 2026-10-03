/**
 * 模型设置的存取。
 *
 * 分两处存，因为两类数据的性质不同：
 *   - **cookie**：供应商 / base_url / 模型 id / api_key / 思考档位。key 是秘密，
 *     按用户要求放 cookie（非 HttpOnly 才能被前端读出来自己塞 Authorization 头，
 *     也就是说 XSS 能读到它，与 localStorage 同级）。BYOK，服务端不参与。
 *   - **localStorage**：从接口拉回来的模型清单。它不是秘密，还可能上百条，
 *     cookie 的 4KB 装不下。
 */
import {getProvider, PROVIDERS, resolveModel, thinkingOf} from './providers.js';

const COOKIE_NAME = 'xce_ai_model';
const MODELS_KEY = 'xce_ai_models';
const USER_PROMPT_KEY = 'xce_ai_prompt';
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
        apiKey: '',
        effort: defaultEffort(provider.id, first)
    };
};

export const DEFAULT_SETTINGS = {
    ...defaultSettingsFor('deepseek'),
    apiKey: '',
    userPrompt: loadUserPrompt()
};

export const loadSettings = () => {
    const raw = readCookie(COOKIE_NAME);
    if (!raw) return {...DEFAULT_SETTINGS};
    try {
        const parsed = JSON.parse(raw);
        const providerId = getProvider(parsed.providerId).id;
        const provider = getProvider(providerId);
        const baseUrl = parsed.baseUrl === void 0 ? provider.baseUrl : parsed.baseUrl;
        const models = loadModelCache(providerId, baseUrl);
        const known = provider.models.concat(models);
        const model = known.find(m => m.id === parsed.modelId) || known[0] || null;
        return {
            providerId,
            baseUrl,
            modelId: model ? model.id : '',
            models,
            apiKey: parsed.apiKey || '',
            effort: parsed.effort || defaultEffort(providerId, model),
            // 用户自定义的限额（数字），没存过就是 undefined = 自动
            contextWindow: Number(parsed.contextWindow) > 0 ? Number(parsed.contextWindow) : void 0,
            maxOutputTokens: Number(parsed.maxOutputTokens) > 0 ? Number(parsed.maxOutputTokens) : void 0,
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
    writeCookie(COOKIE_NAME, JSON.stringify({
        providerId: settings.providerId,
        baseUrl: settings.baseUrl,
        modelId: settings.modelId,
        apiKey: settings.apiKey,
        effort: settings.effort,
        ...limits
    }));
    // 提示词单独存（不进 cookie，见 loadUserPrompt 的注释）
    saveUserPrompt(settings.userPrompt);
    return settings;
};

export const clearSettings = () => {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
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

export const hasApiKey = settings =>
    !!(settings.apiKey && settings.apiKey.trim()) || settings.providerId === 'ollama';
