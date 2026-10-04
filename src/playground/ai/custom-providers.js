/**
 * 用户自己添加的供应商（可以有多条：各自命名、协议、地址、模型）。
 *
 * 为什么不跟主设置一起放 cookie：cookie 只有 4KB，几条供应商很容易顶满
 * （和「拉回来的模型清单」同理）。所以放 localStorage —— 安全级别跟 cookie 一样（XSS 都能读到），
 * 但容量大得多。**密钥不在这里**：每家一把钥匙统一放在 settings.js 的密钥表里（按供应商 id 取，
 * 切换供应商时各自恢复自己的那把），免得「预设有预设的存法、自定义有自定义的存法」两套规则打架。
 *
 * 读有缓存：getProvider 会在渲染里被反复调用，每次都 JSON.parse 一遍太亏。
 * 所以写操作统一走这里的出口（写完刷缓存），读的人直接拿列表。
 */

const STORAGE_KEY = 'xce_ai_providers';

/** 界面上可选的两条线格式 */
export const WIRES = [
    {value: 'openai', label: 'OpenAI 兼容（/chat/completions）'},
    {value: 'anthropic', label: 'Anthropic（/v1/messages）'}
];

/** 列表里没写协议时按哪条走 */
export const DEFAULT_WIRE = 'openai';

let cache = null;

// 只要求有 id：用户是一边打字一边填地址的，中途的空 base_url 也得能原样存回来
const sanitize = raw => {
    if (!raw || typeof raw !== 'object' || !raw.id) return null;
    return {
        id: String(raw.id),
        name: String(raw.name || '').trim() || '自定义供应商',
        wire: raw.wire === 'anthropic' ? 'anthropic' : DEFAULT_WIRE,
        baseUrl: String(raw.baseUrl || '').trim(),
        // 非标准路径的兼容端点（MiniMax 那种），留空就按协议默认
        path: String(raw.path || '').trim(),
        // 形同预设供应商：预设清单永远是空的，真实清单靠「拉取模型列表」缓存（见 settings.js）
        models: [],
        custom: true
    };
};

/**
 * @returns {Array<object>} 用户添加的供应商（形同 PROVIDERS 里的条目）
 */
export const loadCustomProviders = () => {
    if (cache) return cache;
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        cache = (Array.isArray(parsed) ? parsed : []).map(sanitize).filter(Boolean);
    } catch (e) {
        cache = [];
    }
    return cache;
};

/**
 * @param {Array<object>} list 整份清单（增删改都走这里）
 * @returns {Array<object>} 存下来的清单
 */
export const saveCustomProviders = list => {
    cache = (list || []).map(sanitize).filter(Boolean);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (e) {
        // 存不下就算了，内存里这份照样有效
    }
    return cache;
};

// 读的别名，让调用处读起来像「拿当前清单」
export const customProviders = loadCustomProviders;

/**
 * 新供应商的 id。预设 id 都是纯字母，加前缀不会撞
 * @returns {string} 形如 custom-ab12cd3ef4 的 id
 */
export const newCustomProviderId = () => {
    const random = Math.random()
        .toString(36)
        .slice(2, 8);
    const stamp = Date.now()
        .toString(36)
        .slice(-4);
    return `custom-${random}${stamp}`;
};
