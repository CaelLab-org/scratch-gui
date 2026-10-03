/**
 * 模型接入层。设计照 dsh / ZCode 的模型层，三条规矩：
 *   1. 供应商差异是**数据**（base_url / 模型清单 / 思考字段形态），不是代码分支；
 *   2. 请求体用**纯函数**构造，逻辑不散在调用处；
 *   3. 流式里工具调用的 arguments 是**分片**到达的 —— 只字符串累加，收尾时才 JSON.parse。
 *
 * 对外只有两个东西：
 *   PROVIDERS / fetchProviderModels  —— 模型目录（人工预设 + 从接口实时拉）
 *   createCloudModel(config)         —— 与本地脚本模型同形状的 {name, complete}
 *
 * 两个实盘验证过的坑（2026-10-04 用真实 key 打过接口）：
 *   - DeepSeek 开思考时有工具调用，**assistant 消息必须把 reasoning_content 原样回传**，
 *     否则下一步直接 400「The reasoning_content in the thinking mode must be passed back to the API」。
 *   - 图片可以放在 `role: "tool"` 的消息里（content 用 [{type:'text'},{type:'image_url'}] 数组），
 *     模型确实看得到（实测让它读 1x1 像素，它答对了颜色）。
 */

// ---------------------------------------------------------------------------
// 模型目录
// ---------------------------------------------------------------------------

// 通用的思考档位。wire 就是最终塞进请求体的值，所以各家写法不同也能塞进同一份数据里。
const thinkingLevels = (field, levels) => ({
    field,
    levels: levels.map(([value, label, wire]) => ({value, label, wire: wire === void 0 ? value : wire}))
});

const LEVELS_4 = [
    ['none', '不思考（最快）', void 0],
    ['low', '低', void 0],
    ['high', '高（默认）', void 0],
    ['max', '最高', void 0]
];
const LEVELS_3 = [
    ['low', '低', void 0],
    ['high', '高（默认）', void 0],
    ['max', '最高', void 0]
];
const LEVELS_ONOFF = [
    ['off', '不思考', {type: 'disabled'}],
    ['on', '思考（默认）', {type: 'enabled'}]
];

// ⚠️ 预设的模型 id 会随供应商上下架而过期。界面上有「从接口拉取」按钮，
// 用用户自己的 key 打 GET {baseUrl}/models 拿真实清单 —— 预设只是开箱即用的默认值。
export const PROVIDERS = [
    {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        keyUrl: 'https://platform.deepseek.com/api_keys',
        note: '国内可直连，浏览器跨域实测放行',
        thinking: thinkingLevels('reasoning_effort', LEVELS_3),
        models: [
            {
                id: 'deepseek-flash',
                name: 'DeepSeek-V4.1-Flash',
                supportsImage: true,
                contextWindow: 1048576,
                note: '快，支持看图'
            },
            {
                id: 'deepseek-v4-pro',
                name: 'DeepSeek-V4-Pro',
                contextWindow: 1048576,
                note: '更强，不看图'
            }
        ]
    },
    {
        id: 'glm',
        name: '智谱 GLM',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
        note: '有免费档（glm-4.5-flash / glm-4.6v-flash）',
        thinking: thinkingLevels('thinking', LEVELS_ONOFF),
        models: [
            {id: 'glm-4.6', name: 'GLM-4.6', contextWindow: 200000, note: '旗舰'},
            {id: 'glm-4.5-air', name: 'GLM-4.5-Air', contextWindow: 128000, note: '轻量'},
            {id: 'glm-4.5-flash', name: 'GLM-4.5-Flash', contextWindow: 128000, note: '免费'},
            {
                id: 'glm-4.6v-flash',
                name: 'GLM-4.6V-Flash',
                supportsImage: true,
                contextWindow: 128000,
                note: '免费，支持看图'
            }
        ]
    },
    {
        id: 'kimi',
        name: 'Moonshot Kimi',
        baseUrl: 'https://api.moonshot.cn/v1',
        keyUrl: 'https://platform.moonshot.cn/console/api-keys',
        note: '旧 moonshot-v1-* 系列已下线',
        thinking: thinkingLevels('reasoning_effort', LEVELS_3),
        models: [
            {
                id: 'kimi-k3',
                name: 'Kimi K3',
                supportsImage: true,
                contextWindow: 1048576,
                note: '旗舰，原生看图'
            },
            {id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', contextWindow: 262144, note: '写代码'},
            {
                id: 'kimi-k2.6',
                name: 'Kimi K2.6',
                supportsImage: true,
                contextWindow: 262144,
                thinking: thinkingLevels('thinking', LEVELS_ONOFF)
            }
        ]
    },
    {
        id: 'dashscope',
        name: '阿里云百炼（通义千问）',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        keyUrl: 'https://bailian.console.aliyun.com/',
        note: '跨域放行 *；将来地址可能要求带 WorkspaceId',
        thinking: {
            field: 'enable_thinking',
            levels: [
                {value: 'off', label: '不思考', wire: false},
                {value: 'on', label: '思考（默认）', wire: true}
            ]
        },
        models: [
            {
                id: 'qwen3.8-max',
                name: 'Qwen3.8-Max',
                supportsImage: true,
                contextWindow: 1048576,
                note: '旗舰'
            },
            {id: 'qwen3.7-plus', name: 'Qwen3.7-Plus', contextWindow: 262144},
            {id: 'qwen3.7-flash', name: 'Qwen3.7-Flash', contextWindow: 262144, note: '快而便宜'},
            {
                id: 'qwen3-vl-plus',
                name: 'Qwen3-VL-Plus',
                supportsImage: true,
                contextWindow: 262144,
                note: '看图专用'
            }
        ]
    },
    {
        id: 'siliconflow',
        name: '硅基流动 SiliconFlow',
        baseUrl: 'https://api.siliconflow.cn/v1',
        keyUrl: 'https://cloud.siliconflow.cn/account/ak',
        note: '跨域最宽松；模型 id 带厂商前缀，建议用「拉取」拿真实清单',
        thinking: thinkingLevels('reasoning_effort', LEVELS_3),
        models: []
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        keyUrl: 'https://openrouter.ai/keys',
        note: '一个 key 通吃各家（模型 id 带厂商前缀）',
        thinking: thinkingLevels('reasoning_effort', LEVELS_4),
        models: [
            {
                id: 'deepseek/deepseek-v4.1-flash',
                name: 'DeepSeek V4.1 Flash',
                supportsImage: true,
                contextWindow: 1048576
            },
            {id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', supportsImage: true},
            {id: 'openai/gpt-5.6-sol', name: 'GPT-5.6 Sol', supportsImage: true},
            {
                id: 'google/gemini-3.8-flash',
                name: 'Gemini 3.8 Flash',
                supportsImage: true,
                contextWindow: 1048576
            }
        ]
    },
    {
        id: 'ark',
        name: '火山方舟（豆包）',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        keyUrl: 'https://console.volcengine.com/ark',
        note: '路径是 /api/v3，不是 /v1',
        thinking: thinkingLevels('thinking', LEVELS_ONOFF),
        models: [
            {
                id: 'doubao-seed-2.1-pro',
                name: '豆包 Seed 2.1 Pro',
                supportsImage: true,
                contextWindow: 262144
            },
            {
                id: 'doubao-seed-2.0-lite',
                name: '豆包 Seed 2.0 Lite',
                supportsImage: true,
                contextWindow: 262144
            }
        ]
    },
    {
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        keyUrl: 'https://platform.openai.com/api-keys',
        note: '跨域仅第三方实测，且 chat/completions 基本看不到思考内容',
        thinking: thinkingLevels('reasoning_effort', LEVELS_4),
        models: [
            {id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', supportsImage: true},
            {id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', supportsImage: true, note: '快而便宜'},
            {id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', supportsImage: true}
        ]
    },
    {
        id: 'groq',
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        keyUrl: 'https://console.groq.com/keys',
        note: '跨域仅第三方实测；快，适合小模型',
        thinking: thinkingLevels('reasoning_effort', LEVELS_4),
        models: [
            {id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B'},
            {id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B'},
            {id: 'qwen/qwen3-32b', name: 'Qwen3 32B'},
            {
                id: 'meta-llama/llama-4-scout-17b-16e-instruct',
                name: 'Llama 4 Scout',
                supportsImage: true
            }
        ]
    },
    {
        id: 'ollama',
        name: '本地 Ollama',
        baseUrl: 'http://localhost:11434/v1',
        keyUrl: '',
        note: '只在本机跑编辑器时可用：线上 HTTPS 页面调 http://localhost 会被浏览器按混合内容拦掉',
        includeUsage: false,
        models: []
    },
    {
        id: 'custom',
        name: 'OpenAI 兼容（自定义）',
        baseUrl: '',
        keyUrl: '',
        note: '自己填 base_url 和模型名，任何 OpenAI 兼容端点都能接',
        models: []
    }
];

export const getProvider = id => PROVIDERS.find(p => p.id === id) || PROVIDERS[0];

/**
 * 找出当前设置对应的「目录里的模型条目」。
 * 预设里没有的 id（比如刚从接口拉到的）返回一个只有 id 的壳，UI 照样能用。
 * @param {object} settings {providerId, modelId, models}  models 是拉取缓存
 * @returns {object|null} 模型条目
 */
export const resolveModel = settings => {
    if (!settings || !settings.modelId) return null;
    const provider = getProvider(settings.providerId);
    const fetched = (settings.models || []).find(m => m.id === settings.modelId);
    if (fetched) return fetched;
    return provider.models.find(m => m.id === settings.modelId) || {id: settings.modelId, name: settings.modelId};
};

/**
 * 当前生效的上下文窗口。优先级：用户在设置里填的 > 模型元数据声明的 > 兜底值。
 * @param {object} settings 当前设置
 * @param {number} fallback 目录里没写时的兜底窗口
 * @returns {number} 上下文窗口（token）
 */
export const contextWindowOf = (settings, fallback = 262144) => {
    const userSet = settings && Number(settings.contextWindow);
    if (userSet > 0) return userSet;
    return (resolveModel(settings) || {}).contextWindow || fallback;
};

/**
 * 当前生效的单次最大输出。优先级同上（模型元数据的 max_output_tokens > 8192 兜底）。
 * 用来在请求里带 max_tokens，防止模型一口气输出到失控（烧钱也烧上下文）。
 * @param {object} settings 当前设置
 * @param {number} fallback 元数据也没写时的兜底
 * @returns {number} 最大输出（token）
 */
export const maxOutputTokensOf = (settings, fallback = 8192) => {
    const userSet = settings && Number(settings.maxOutputTokens);
    if (userSet > 0) return userSet;
    return (resolveModel(settings) || {}).maxOutputTokens || fallback;
};

/**
 * 当前模型可否调思考档位（模型级 thinking: null 表示这家没有这个模型就砍掉）
 * @param {string} providerId 供应商 id
 * @param {string} modelId 模型 id
 * @returns {object|null} {field, levels} 或 null
 */
export const thinkingOf = (providerId, modelId) => {
    const provider = getProvider(providerId);
    const model = provider.models.find(m => m.id === modelId);
    if (model && model.thinking === null) return null;
    return (model && model.thinking) || provider.thinking || null;
};

// ---------------------------------------------------------------------------
// HTTP 错误说明
// ---------------------------------------------------------------------------

/**
 * 从响应里尽量挖出一句人能看懂的错误
 * @param {Response} response 失败的响应
 * @returns {Promise<string>} 给用户看的错误说明
 */
export const describeHttpError = async response => {
    let detail = '';
    try {
        const text = await response.text();
        try {
            const parsed = JSON.parse(text);
            detail = (parsed.error && (parsed.error.message || parsed.error.type)) || parsed.message || text;
        } catch (e) {
            detail = text;
        }
    } catch (e) {
        detail = '';
    }
    if (response.status === 401) return `密钥无效或已过期（401）。${detail}`;
    if (response.status === 402) return `余额不足（402）。${detail}`;
    if (response.status === 429) return `请求太频繁或被限流（429）。${detail}`;
    return `接口返回 ${response.status}。${detail}`;
};

// ---------------------------------------------------------------------------
// 从接口拉真实模型清单
// ---------------------------------------------------------------------------

// 各家 /models 的返回形状不一，这里按字段名挨个认。
// DeepSeek 给得最全：name / context_window / input_modalities / effort.supported_levels。
const normalizeModel = raw => {
    const id = raw.id || raw.model || raw.name;
    if (!id) return null;
    const modalities =
        raw.input_modalities || (raw.architecture && raw.architecture.input_modalities) || [];
    const hasImage = modalities.includes('image') ||
        /vl|vision|-v\b|v-flash/i.test(String(id)) ||
        !!(raw.modalities && raw.modalities.includes('image'));
    const effortInfo = raw.effort || {};
    const levels = effortInfo.supported_levels;
    const model = {
        id,
        name: raw.name || id,
        supportsImage: hasImage,
        note: '（从接口拉到）'
    };
    if (typeof raw.context_window === 'number') model.contextWindow = raw.context_window;
    else if (typeof raw.context_length === 'number') model.contextWindow = raw.context_length;
    if (typeof raw.max_output_tokens === 'number') model.maxOutputTokens = raw.max_output_tokens;
    if (Array.isArray(levels) && levels.length) model.supportedLevels = levels;
    if (effortInfo.default_level) model.defaultLevel = effortInfo.default_level;
    return model;
};

/**
 * GET {baseUrl}/models，用用户自己的 key。失败就把错误抛出去，由界面显示。
 * @param {object} opts {providerId, baseUrl, apiKey, signal}
 * @returns {Promise<Array<object>>} 归一化后的模型清单
 */
export const fetchProviderModels = async ({providerId, baseUrl, apiKey, signal}) => {
    const provider = getProvider(providerId);
    const url = `${(baseUrl || provider.baseUrl || '').replace(/\/+$/, '')}/models`;
    if (!url || url === '/models') throw new Error('还没填 base_url');
    const headers = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetch(url, {headers, signal});
    if (!response.ok) throw new Error(await describeHttpError(response));
    const payload = await response.json();
    const list = Array.isArray(payload) ? payload : (payload.data || payload.models || []);
    return list
        .map(normalizeModel)
        .filter(Boolean)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
};

// ---------------------------------------------------------------------------
// 请求体构造（纯函数）
// ---------------------------------------------------------------------------

// 内部消息 -> OpenAI 兼容的线上消息。工具的入参在这里才序列化成字符串。
//
// reasoning_content 必须回传：开思考时，带 tool_calls 的 assistant 消息要把它原样带回去，
// 否则下一轮 400（实测）。只有不带工具调用的普通回复不用回传，省上下文。
export const toWireMessages = messages => messages.map(message => {
    if (message.role === 'tool') {
        const images = message.images || [];
        if (!images.length) {
            return {
                role: 'tool',
                tool_call_id: message.toolCallId,
                content: String(message.content === void 0 ? '' : message.content)
            };
        }
        // 图片走 content 数组：实测 DeepSeek 认得这种写法
        return {
            role: 'tool',
            tool_call_id: message.toolCallId,
            content: [
                {type: 'text', text: String(message.content || '')},
                ...images.map(image => ({
                    type: 'image_url',
                    image_url: {url: image.url}
                }))
            ]
        };
    }
    if (message.role === 'assistant') {
        const wire = {role: 'assistant', content: message.content || null};
        if (message.toolCalls && message.toolCalls.length) {
            wire.tool_calls = message.toolCalls.map(call => ({
                id: call.id,
                type: 'function',
                function: {name: call.name, arguments: JSON.stringify(call.input || {})}
            }));
            if (message.reasoning) wire.reasoning_content = message.reasoning;
        }
        return wire;
    }
    return {role: message.role, content: message.content};
});

export const toWireTools = tools => tools.map(tool => ({
    type: 'function',
    function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
    }
}));

/**
 * @param {object} opts {model, messages, tools, temperature, effort, thinking, maxTokens, includeUsage}
 * @returns {object} 请求体
 */
export const buildRequestBody = ({
    model, messages, tools, temperature, effort, thinking, maxTokens, includeUsage = true
}) => {
    const body = {
        model,
        stream: true,
        messages: toWireMessages(messages),
        ...(includeUsage ? {stream_options: {include_usage: true}} : {}),
        ...(tools && tools.length ? {tools: toWireTools(tools)} : {}),
        ...(typeof temperature === 'number' ? {temperature} : {}),
        // 单次输出上限：防失控（也防把上下文一次性吃光）。元数据或用户设置里有就带
        ...(maxTokens > 0 ? {max_tokens: maxTokens} : {})
    };
    // 思考档位：字段名与取值形态都由供应商声明，这里只负责拼进去
    if (thinking && effort) {
        const level = thinking.levels.find(item => item.value === effort);
        if (level) body[thinking.field] = level.wire;
    }
    return body;
};

// ---------------------------------------------------------------------------
// SSE 分帧
// ---------------------------------------------------------------------------

/**
 * 把 SSE 字节流切成 data 负载。按 dsh 的做法：**不把没有结束标记的尾巴当成事件**。
 * @param {ReadableStream} body 流式响应体
 * @returns {AsyncGenerator<string>} 每个 data 负载（不含 "data: " 前缀）
 */
export const sseDataLines = async function* (body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        for (;;) {
            const {done, value} = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, {stream: true});
            let boundary = buffer.indexOf('\n\n');
            while (boundary !== -1) {
                const frame = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                for (const line of frame.split('\n')) {
                    if (line.startsWith('data:')) yield line.slice(5).trim();
                }
                boundary = buffer.indexOf('\n\n');
            }
        }
    } finally {
        reader.releaseLock();
    }
};

// ---------------------------------------------------------------------------
// 云端模型
// ---------------------------------------------------------------------------

// 思考内容各家放在不同字段：DeepSeek/GLM/Kimi/Ark 是 reasoning_content，
// OpenRouter 是 reasoning 或 reasoning_details（数组）。
const reasoningOf = delta => {
    if (typeof delta.reasoning_content === 'string') return delta.reasoning_content;
    if (typeof delta.reasoning === 'string') return delta.reasoning;
    if (Array.isArray(delta.reasoning_details)) {
        return delta.reasoning_details
            .map(part => (part && (part.text || part.summary)) || '')
            .join('');
    }
    return '';
};

/**
 * @param {object} config  {providerId, modelId, apiKey, baseUrl, effort, model}
 * @param {object} opts    {idleTimeoutMs} 读超时（两次事件之间），不是整请求超时
 * @returns {{name, cloud, supportsImage, contextWindow, complete}} 与本地脚本模型同形状
 */
export const createCloudModel = (config, {idleTimeoutMs = 120000} = {}) => {
    const provider = getProvider(config.providerId);
    const baseUrl = (config.baseUrl || provider.baseUrl || '').replace(/\/+$/, '');
    const modelId = config.modelId;
    const apiKey = config.apiKey;
    const meta = config.model || provider.models.find(m => m.id === modelId) || {id: modelId};
    const thinking = config.thinking === void 0 ? thinkingOf(config.providerId, modelId) : config.thinking;

    return {
        name: `${provider.name} · ${meta.name || modelId}`,
        contextWindow: meta.contextWindow,
        supportsImage: !!meta.supportsImage,
        cloud: true,

        async complete (messages, tools, {signal, onChunk = () => {}} = {}) {
            if (!baseUrl) throw new Error('没填 base_url');
            if (!apiKey && config.providerId !== 'ollama') throw new Error('没填 API 密钥');

            const requestBody = buildRequestBody({
                model: modelId,
                messages,
                tools,
                effort: config.effort,
                thinking,
                maxTokens: config.maxOutputTokens,
                includeUsage: provider.includeUsage !== false
            });
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? {Authorization: `Bearer ${apiKey}`} : {})
                },
                body: JSON.stringify(requestBody),
                signal
            });
            if (!response.ok) throw new Error(await describeHttpError(response));
            if (!response.body) throw new Error('接口没有返回流式响应体');

            let text = '';
            let reasoning = '';
            // index -> {id, name, args}，args 只累加字符串
            const partial = new Map();
            let finishReason = null;
            let usage = null;
            let timedOut = false;

            let watchdog = null;
            const pulse = () => {
                if (watchdog) clearTimeout(watchdog);
                watchdog = setTimeout(() => {
                    timedOut = true;
                }, idleTimeoutMs);
            };

            try {
                pulse();
                for await (const payload of sseDataLines(response.body)) {
                    pulse();
                    if (payload === '[DONE]') break;
                    if (!payload) continue;
                    let chunk;
                    try {
                        chunk = JSON.parse(payload);
                    } catch (e) {
                        continue; // 半截或者心跳，跳过
                    }
                    if (chunk.usage) usage = chunk.usage;
                    const choice = chunk.choices && chunk.choices[0];
                    if (!choice) continue;
                    if (choice.finish_reason) finishReason = choice.finish_reason;
                    const delta = choice.delta || {};

                    const thought = reasoningOf(delta);
                    if (thought) {
                        reasoning += thought;
                        onChunk({kind: 'reasoning_delta', delta: thought});
                    }
                    if (delta.content) {
                        text += delta.content;
                        onChunk({kind: 'text_delta', delta: delta.content});
                    }
                    for (const call of delta.tool_calls || []) {
                        const index = typeof call.index === 'number' ? call.index : 0;
                        if (!partial.has(index)) partial.set(index, {id: call.id, name: '', args: ''});
                        const slot = partial.get(index);
                        if (call.id) slot.id = call.id;
                        if (call.function && call.function.name) slot.name = call.function.name;
                        // 关键：分片只累加，绝不在这里 parse
                        if (call.function && call.function.arguments) slot.args += call.function.arguments;
                    }
                }
            } finally {
                if (watchdog) clearTimeout(watchdog);
            }
            if (timedOut) throw new Error('模型太久没有响应（读超时）');

            // 收尾才把参数串 parse 成对象；截断或非法的一律丢掉，别拿去执行
            const toolCalls = [];
            for (const slot of partial.values()) {
                if (!slot.name) continue;
                if (finishReason === 'length') continue;
                let input = {};
                if (slot.args) {
                    try {
                        input = JSON.parse(slot.args);
                    } catch (e) {
                        throw new Error(`模型给出的工具参数不是合法 JSON：${slot.args.slice(0, 200)}`);
                    }
                }
                toolCalls.push({id: slot.id || `call_${toolCalls.length}`, name: slot.name, input});
            }

            return {text, reasoning, toolCalls, finishReason, usage};
        }
    };
};
