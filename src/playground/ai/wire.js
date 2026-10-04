/**
 * 两条线格式（OpenAI 兼容 / Anthropic）共用的底层。
 *
 * 放这儿而不是留在 providers.js 里，是因为两边都要用这几样：各自抄一份的话，
 * 「SSE 半截尾巴不算事件」这种容易写错的地方迟早会被改歪一份。
 * 这一层不 import 任何东西，所以谁都可以引它，不会有循环。
 */

/**
 * 从响应里尽量挖出一句人能看懂的错误。
 * 两家的错误体形状都认：OpenAI 是 `{error:{message}}`，Anthropic 是 `{type:'error', error:{message}}`。
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

/**
 * 工具的参数 schema，给线格式用。
 * 没声明 schema 的工具也要**显式给一个空 object schema** —— 严格校验的网关缺 `parameters` 会整条
 * 请求 400（OpenAI 那边字段叫 parameters，Anthropic 叫 input_schema，值是同一个）。
 * @param {object} tool 工具
 * @returns {object} JSON Schema
 */
export const toolParameters = tool => tool.inputSchema || {type: 'object', properties: {}};

// Anthropic 的浏览器直连必须带这个头，否则它的 CORS 预检不给你过（桌面版带着也无害）
export const ANTHROPIC_BROWSER_HEADER = 'anthropic-dangerous-direct-browser-access';
export const ANTHROPIC_VERSION = '2023-06-01';

/**
 * 端点是不是在自家机器上（Ollama / vLLM / LM Studio 这类本地服务本来就不要密钥）
 * @param {string} url base_url
 * @returns {boolean} 是本地端点
 */
export const isLocalBaseUrl = url => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(String(url || ''));

/**
 * 一条线格式要的鉴权头。对话请求和拉模型清单共用这一份，免得两处写歪。
 * @param {string} wire 'openai' | 'anthropic'
 * @param {string} apiKey 密钥（可能为空：本地服务不需要）
 * @returns {object} 请求头
 */
export const authHeaders = (wire, apiKey) => {
    if (wire === 'anthropic') {
        return {
            'anthropic-version': ANTHROPIC_VERSION,
            [ANTHROPIC_BROWSER_HEADER]: 'true',
            ...(apiKey ? {'x-api-key': apiKey} : {})
        };
    }
    return apiKey ? {Authorization: `Bearer ${apiKey}`} : {};
};

/**
 * 把 SSE 字节流切成 data 负载。按 dsh 的做法：**不把没有结束标记的尾巴当成事件**。
 * Anthropic 的每个事件也带 `data: {…"type":"content_block_delta"…}`，所以同一套分帧两边都能用。
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
