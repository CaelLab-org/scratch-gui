/**
 * Anthropic Messages API（`POST {baseUrl}/messages`）适配器。
 *
 * 跟 OpenAI 那条线的差别不是「字段换个名」那么简单，几条都得单独处理：
 *   1. 系统提示词是**顶层 `system` 参数**，不在 messages 里 —— 我们的历史里可能有多条 system
 *      （开头那条 + 快用完往返时挂在末尾的那条），全部拼进去；
 *   2. 工具声明用 `input_schema`，而且**工具结果不是独立的 tool 角色**，是 user 消息里的
 *      `tool_result` 块；同一轮里的多个结果必须并进**同一条** user 消息，否则 400；
 *   3. 图片不接受 `image_url` 那种写法，要么 base64 源、要么 URL 源 —— 我们的舞台截图正好是
 *      canvas 出来的 data URL，得拆成 media_type + base64；
 *   4. 扩展思考要 `thinking: {type:'enabled', budget_tokens}`，**预算必须严格小于 max_tokens**；
 *      而且开思考之后，带 `tool_use` 的 assistant 消息必须把上一轮的 thinking 块**连 signature
 *      原样回传**，否则续写直接 400。签名在流式里是 `signature_delta` 事件，得跟着思考一起留。
 *
 * 分层照 dsh 的 `llm-deepseek/src/{serialize,sse,translate}.ts`：构造请求体、翻译消息、解 SSE 分开写，
 * 前两个是纯函数（无头可测），只有最后一段碰网络。
 */

import {authHeaders, describeHttpError, isLocalBaseUrl, sseDataLines, toolParameters} from './wire.js';

// 上下文计量按「发出去多少」算，缓存命中的输入也算进前缀里，否则上下文会越算越小。
// cache_read 单独攒进 cached_tokens（命中率用）；cache_creation 是往缓存里写的量，算新输入不算命中
const usageOf = (usage, patch) => {
    if (!patch) return usage;
    const prompt = (patch.input_tokens || 0) + (patch.cache_read_input_tokens || 0) +
        (patch.cache_creation_input_tokens || 0);
    const out = {
        prompt_tokens: (usage ? usage.prompt_tokens : 0) + prompt,
        completion_tokens: patch.output_tokens || (usage ? usage.completion_tokens : 0),
        cached_tokens: ((usage && usage.cached_tokens) || 0) + (patch.cache_read_input_tokens || 0)
    };
    out.total_tokens = out.prompt_tokens + out.completion_tokens;
    return out;
};

/**
 * 图片 -> Anthropic 的图片块。data URL（舞台截图）拆成 base64 源，http(s) 走 URL 源。
 * @param {object} image {url, mimeType}
 * @returns {object} 图片块
 */
const imageBlock = image => {
    const url = String((image && image.url) || '');
    if (url.startsWith('data:')) {
        const comma = url.indexOf(',');
        const head = comma === -1 ? '' : url.slice(0, comma);
        const mediaType = (head.match(/data:([^;]+)/) || [])[1] || (image && image.mimeType) || 'image/png';
        return {
            type: 'image',
            source: {type: 'base64', media_type: mediaType, data: comma === -1 ? '' : url.slice(comma + 1)}
        };
    }
    return {type: 'image', source: {type: 'url', url}};
};

// 工具结果的内容：没有图片就给字符串，有图片给块数组（Anthropic 两种都收）
const toolResultContent = message => {
    const images = message.images || [];
    const text = String(message.content === void 0 ? '' : message.content);
    if (!images.length) return text;
    return [{type: 'text', text}, ...images.map(imageBlock)];
};

/**
 * 内部消息 -> Anthropic 线上消息。
 * @param {Array<object>} messages 内部消息（含 system / 工具调用 / 思考）
 * @returns {{system: string, messages: Array<object>}} system 单独拎出来
 */
export const toAnthropicMessages = messages => {
    const systemParts = [];
    const out = [];
    // 同一轮的多个工具结果要并进同一条 user 消息：记住上一条是不是刚开的「工具结果消息」
    let toolResultMessage = null;

    for (const message of messages) {
        if (message.role === 'system') {
            if (message.content) systemParts.push(String(message.content));
            continue;
        }

        if (message.role === 'tool') {
            const block = {
                type: 'tool_result',
                tool_use_id: message.toolCallId,
                content: toolResultContent(message)
            };
            if (message.isError) block.is_error = true;
            if (toolResultMessage) {
                toolResultMessage.content.push(block);
            } else {
                toolResultMessage = {role: 'user', content: [block]};
                out.push(toolResultMessage);
            }
            continue;
        }

        toolResultMessage = null;

        if (message.role === 'assistant') {
            const content = [];
            // 思考块必须原样回传（带签名）：开思考时带 tool_use 的续写少它一条就 400。
            // 没有签名说明这轮不是 Anthropic 给的（或没开思考），那就不能发 —— 发了会被拒。
            if (message.reasoning && message.reasoningSignature) {
                content.push({
                    type: 'thinking',
                    thinking: message.reasoning,
                    signature: message.reasoningSignature
                });
            }
            if (message.content) content.push({type: 'text', text: String(message.content)});
            for (const call of message.toolCalls || []) {
                content.push({type: 'tool_use', id: call.id, name: call.name, input: call.input || {}});
            }
            // 空消息（没正文也没工具）Anthropic 不收，跳过
            if (!content.length) continue;
            out.push({role: 'assistant', content});
            continue;
        }

        const content = [];
        if (message.content) content.push({type: 'text', text: String(message.content)});
        for (const image of message.images || []) content.push(imageBlock(image));
        if (content.length) out.push({role: 'user', content});
    }

    // 首条必须是 user（否则 400）。历史被压缩过时可能留下开头的 assistant，往前削掉
    while (out.length && out[0].role !== 'user') out.shift();

    return {system: systemParts.join('\n\n'), messages: out};
};

/**
 * 工具声明 -> Anthropic 的形状（只有 schema 字段名不同）
 * @param {Array<object>} tools 工具数组
 * @returns {Array<object>} 线上工具声明
 */
export const toAnthropicTools = tools => tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: toolParameters(tool)
}));

/**
 * 构造请求体（纯函数）
 * @param {object} opts {model, messages, tools, maxTokens, thinking, effort}
 * @returns {object} 请求体
 */
export const buildAnthropicBody = ({model, messages, tools, maxTokens, thinking, effort}) => {
    const {system, messages: wire} = toAnthropicMessages(messages);
    const limit = maxTokens > 0 ? Math.floor(maxTokens) : 8192;
    const body = {model, max_tokens: limit, stream: true, messages: wire};
    if (system) body.system = system;
    if (tools && tools.length) body.tools = toAnthropicTools(tools);

    const level = thinking && effort ? thinking.levels.find(item => item.value === effort) : null;
    const patch = level && level.wire && typeof level.wire === 'object' ? level.wire : null;
    if (patch && patch.type === 'disabled') {
        body.thinking = {type: 'disabled'};
    } else if (patch && patch.type === 'enabled') {
        // 老写法（enabled + budget_tokens）：预算必须严格小于 max_tokens。装不下就把上限顶上去 ——
        // 思考本来就要占地方，用户把单次输出调小是想省钱，不该变成「一开思考就 400」
        let budget = Math.min(Number(patch.budget_tokens) || 1024, limit - 1024);
        if (budget < 1024) {
            budget = 1024;
            body.max_tokens = Math.max(limit, budget + 1024);
        }
        body.thinking = {type: 'enabled', budget_tokens: budget};
    } else if (patch) {
        // 新写法：adaptive 自己定预算，不占 max_tokens；要更用力就再叠一个 effort（走 output_config）
        body.thinking = {type: patch.type};
        if (patch.effort) body.output_config = {effort: patch.effort};
    }
    return body;
};

/**
 * Anthropic 模型的 {name, contextWindow, supportsImage, complete}。
 * 与 createCloudModel 的返回形状一致，循环那边一行都不用改。
 * @param {object} config {providerId, modelId, baseUrl, apiKey, model, thinking, effort, maxOutputTokens}
 * @param {object} opts {idleTimeoutMs, providerName, path}
 * @returns {object} 模型
 */
export const createAnthropicModel = (
    config,
    {idleTimeoutMs = 120000, providerName = 'Anthropic', path = void 0} = {}
) => {
    const baseUrl = (config.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const endpoint = path || '/messages';
    const modelId = config.modelId;
    const apiKey = config.apiKey;
    const meta = config.model || {id: modelId};

    return {
        name: `${providerName} · ${meta.name || modelId}`,
        contextWindow: meta.contextWindow,
        supportsImage: !!meta.supportsImage,
        cloud: true,

        async complete (messages, tools, {signal, onChunk = () => {}} = {}) {
            if (!apiKey && !isLocalBaseUrl(baseUrl)) throw new Error('没填 API 密钥');
            // 掐表给 tok/s 用：从发请求到流读完（算上网络，是「体验速度」不是纯解码速度）
            const startedAt = Date.now();
            const requestBody = buildAnthropicBody({
                model: modelId,
                messages,
                tools,
                maxTokens: config.maxOutputTokens,
                thinking: config.thinking,
                effort: config.effort
            });
            const response = await fetch(`${baseUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders('anthropic', apiKey)
                },
                body: JSON.stringify(requestBody),
                signal
            });
            if (!response.ok) throw new Error(await describeHttpError(response));
            if (!response.body) throw new Error('接口没有返回流式响应体');

            let text = '';
            let reasoning = '';
            let signature = '';
            let usage = null;
            let finishReason = null;
            let stopped = false;
            let timedOut = false;
            // content block 下标 -> 工具调用（Anthropic 的参数是 input_json_delta 分片来的）
            const partial = new Map();

            let watchdog = null;
            const pulse = () => {
                if (watchdog) clearTimeout(watchdog);
                watchdog = setTimeout(() => {
                    timedOut = true;
                }, idleTimeoutMs);
            };

            const isStop = result => result && result.stop === true;

            try {
                pulse();
                read:
                for await (const payload of sseDataLines(response.body)) {
                    pulse();
                    if (!payload) continue;
                    let event;
                    try {
                        event = JSON.parse(payload);
                    } catch (e) {
                        continue; // 半截或心跳
                    }
                    if (event.type === 'error') {
                        throw new Error((event.error && event.error.message) || '接口返回了一个错误事件');
                    }
                    if (event.type === 'message_start') {
                        usage = usageOf(usage, event.message && event.message.usage);
                        continue;
                    }
                    if (event.type === 'content_block_start') {
                        const block = event.content_block || {};
                        // 工具名和 id 只在开头来一次，参数全靠后面的分片累加
                        if (block.type === 'tool_use') {
                            partial.set(event.index, {id: block.id, name: block.name || '', args: ''});
                        }
                        continue;
                    }
                    if (event.type === 'message_delta') {
                        if (event.delta && event.delta.stop_reason) finishReason = event.delta.stop_reason;
                        usage = usageOf(usage, event.usage);
                        continue;
                    }
                    if (event.type !== 'content_block_delta') continue; // ping / stop 之类不理会

                    const delta = event.delta || {};
                    if (delta.type === 'text_delta' && delta.text) {
                        text += delta.text;
                        if (isStop(onChunk({kind: 'text_delta', delta: delta.text}))) {
                            stopped = true;
                            break read;
                        }
                    } else if (delta.type === 'thinking_delta' && delta.thinking) {
                        reasoning += delta.thinking;
                        if (isStop(onChunk({kind: 'reasoning_delta', delta: delta.thinking}))) {
                            stopped = true;
                            break read;
                        }
                    } else if (delta.type === 'signature_delta' && delta.signature) {
                        // 思考块的签名：回传时必须带，分片累加
                        signature += delta.signature;
                    } else if (delta.type === 'input_json_delta' && delta.partial_json) {
                        const slot = partial.get(event.index);
                        if (slot) slot.args += delta.partial_json;
                    }
                }
            } finally {
                if (watchdog) clearTimeout(watchdog);
            }
            // 掐断要把连接也放掉，否则服务端那头还在继续生成
            if (stopped) {
                try {
                    await response.body.cancel();
                } catch (e) {
                    // 已经流完了就没什么可取消的
                }
            }
            if (timedOut) throw new Error('模型太久没有响应（读超时）');

            // 收尾才把参数串 parse 成对象；截断或非法的一律丢掉，别拿去执行
            const toolCalls = [];
            for (const slot of partial.values()) {
                if (!slot.name) continue;
                if (finishReason === 'max_tokens' || stopped) continue;
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

            return {
                text,
                reasoning,
                reasoningSignature: signature || void 0,
                toolCalls,
                finishReason,
                usage,
                stopped,
                durationMs: Date.now() - startedAt
            };
        }
    };
};
