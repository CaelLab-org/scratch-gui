// anthropic.js 的无头自测：消息翻译 + 请求体 + 流式解析 + 协议分派
// 用法：node src/playground/ai/anthropic.test.mjs
/* eslint-disable no-console */
import {
    toAnthropicMessages, toAnthropicTools, buildAnthropicBody, createAnthropicModel
} from './anthropic.js';
import {createCloudModel, thinkingOf} from './providers.js';
import {authHeaders} from './wire.js';

const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

const enc = new TextEncoder();
const mkBody = chunks => ({
    getReader () {
        let i = 0;
        return {
            read: async () => (i < chunks.length ? {done: false, value: enc.encode(chunks[i++])} : {done: true}),
            releaseLock: () => {}
        };
    }
});
const ssEvent = obj => `data: ${JSON.stringify(obj)}\n\n`;

// ---------- 1. 消息翻译 ----------
const translated = toAnthropicMessages([
    {role: 'system', content: '你是助手'},
    {role: 'user', content: '写一段积木'},
    {
        role: 'assistant',
        content: '我写好了',
        reasoning: '先想清楚',
        reasoningSignature: 'sig-1',
        toolCalls: [{id: 'toolu_1', name: 'xce_write_script', input: {sprite: '角色1'}}]
    },
    {
        role: 'tool',
        toolCallId: 'toolu_1',
        name: 'xce_write_script',
        content: '已写入',
        images: [{url: 'data:image/png;base64,AAAA', mimeType: 'image/png'}]
    },
    {role: 'tool', toolCallId: 'toolu_2', name: 'xce_read_state', content: 'x=10', isError: true},
    {role: 'system', content: '还剩 3 次往返'}
]);
check('系统提示词全部并进顶层 system、不进 messages',
    translated.system === '你是助手\n\n还剩 3 次往返' &&
    !translated.messages.some(m => m.role === 'system'),
    JSON.stringify(translated.system));
check('assistant 的工具调用翻成 tool_use 块',
    translated.messages[1].content.some(b => b.type === 'tool_use' && b.id === 'toolu_1' &&
        b.input.sprite === '角色1'));
check('思考块连签名一起回传（少签名会被拒）',
    translated.messages[1].content[0].type === 'thinking' &&
    translated.messages[1].content[0].signature === 'sig-1',
    JSON.stringify(translated.messages[1].content[0]));
check('同一轮的多个工具结果并进同一条 user 消息',
    translated.messages[2].role === 'user' && translated.messages[2].content.length === 2 &&
    translated.messages[2].content[0].tool_use_id === 'toolu_1' &&
    translated.messages[2].content[1].tool_use_id === 'toolu_2',
    JSON.stringify(translated.messages[2]));
check('图片翻成 base64 源（Anthropic 不认 image_url）',
    translated.messages[2].content[0].content[1].source.type === 'base64' &&
    translated.messages[2].content[0].content[1].source.media_type === 'image/png' &&
    translated.messages[2].content[0].content[1].source.data === 'AAAA');
check('出错的结果带 is_error',
    translated.messages[2].content[1].is_error === true);

const noSignature = toAnthropicMessages([
    {role: 'assistant', content: 'hi', reasoning: '想过但没签名'}
]);
check('没签名的思考块不发出去（发了会被拒）',
    noSignature.messages.length === 0, JSON.stringify(noSignature.messages));

const trimmed = toAnthropicMessages([
    {role: 'assistant', content: '上一轮的尾巴'},
    {role: 'user', content: '继续'}
]);
check('首条不是 user 就削掉（Anthropic 硬要求）',
    trimmed.messages.length === 1 && trimmed.messages[0].role === 'user');

// ---------- 2. 工具声明与请求体 ----------
check('工具声明用 input_schema',
    toAnthropicTools([{name: 't', description: 'd', inputSchema: {type: 'object'}}])[0].input_schema.type === 'object');
check('没声明 schema 的工具也补一个',
    toAnthropicTools([{name: 't2', description: 'd'}])[0].input_schema.type === 'object');

const base = buildAnthropicBody({
    model: 'claude-sonnet-4-5',
    messages: [{role: 'user', content: 'hi'}],
    tools: [{name: 't', description: 'd', inputSchema: {type: 'object'}}],
    maxTokens: 8192
});
check('max_tokens 与 stream 必须在',
    base.max_tokens === 8192 && base.stream === true, JSON.stringify(base).slice(0, 120));
check('没给思考档位就不带 thinking', base.thinking === void 0);

const adaptive = buildAnthropicBody({
    model: 'm',
    messages: [{role: 'user', content: 'hi'}],
    maxTokens: 8192,
    thinking: thinkingOf('anthropic', 'claude-sonnet-4-5'),
    effort: 'high'
});
check('思考（默认）→ adaptive，不占 max_tokens',
    adaptive.thinking.type === 'adaptive' && adaptive.max_tokens === 8192 && !adaptive.output_config,
    JSON.stringify(adaptive.thinking));
const maxed = buildAnthropicBody({
    model: 'm',
    messages: [{role: 'user', content: 'hi'}],
    maxTokens: 8192,
    thinking: thinkingOf('anthropic', 'claude-sonnet-4-5'),
    effort: 'max'
});
check('最高档在 adaptive 上再叠 output_config.effort',
    maxed.thinking.type === 'adaptive' && maxed.output_config.effort === 'high',
    JSON.stringify(maxed.output_config));
const off = buildAnthropicBody({
    model: 'm',
    messages: [{role: 'user', content: 'hi'}],
    maxTokens: 8192,
    thinking: thinkingOf('anthropic', 'claude-sonnet-4-5'),
    effort: 'off'
});
check('不思考 → thinking.disabled', off.thinking.type === 'disabled');

// 老写法（enabled + budget_tokens）：预算必须严格小于 max_tokens，装不下就把上限顶上去
const legacyThinking = {field: 'thinking', levels: [
    {value: 'high', label: '高', wire: {type: 'enabled', budget_tokens: 32000}}
]};
const clamped = buildAnthropicBody({
    model: 'm',
    messages: [{role: 'user', content: 'hi'}],
    maxTokens: 2000,
    thinking: legacyThinking,
    effort: 'high'
});
check('预算夹到 1024 并把 max_tokens 顶到 2048（否则 400）',
    clamped.thinking.budget_tokens === 1024 && clamped.max_tokens === 2048,
    JSON.stringify({thinking: clamped.thinking, max_tokens: clamped.max_tokens}));
const fitted = buildAnthropicBody({
    model: 'm',
    messages: [{role: 'user', content: 'hi'}],
    maxTokens: 8192,
    thinking: legacyThinking,
    effort: 'high'
});
check('预算装得下就用它、但留出 1024 给正文',
    fitted.thinking.budget_tokens === 7168 && fitted.max_tokens === 8192, JSON.stringify(fitted.thinking));

// ---------- 3. 鉴权头 ----------
const headers = authHeaders('anthropic', 'sk-ant');
check('Anthropic 要 x-api-key + 版本头 + 浏览器直连头',
    headers['x-api-key'] === 'sk-ant' && headers['anthropic-version'] === '2023-06-01' &&
    headers['anthropic-dangerous-direct-browser-access'] === 'true',
    JSON.stringify(headers));

// ---------- 4. 流式解析 ----------
const originalFetch = globalThis.fetch;
const chunks = [
    ssEvent({
        type: 'message_start',
        message: {usage: {input_tokens: 100, cache_read_input_tokens: 20}}
    }),
    ssEvent({type: 'content_block_start', index: 0, content_block: {type: 'thinking', thinking: ''}}),
    ssEvent({type: 'content_block_delta', index: 0, delta: {type: 'thinking_delta', thinking: '先想'}}),
    ssEvent({type: 'content_block_delta', index: 0, delta: {type: 'signature_delta', signature: 'sig-'}}),
    ssEvent({type: 'content_block_delta', index: 0, delta: {type: 'signature_delta', signature: '1'}}),
    ssEvent({type: 'content_block_stop', index: 0}),
    ssEvent({type: 'content_block_start', index: 1, content_block: {type: 'text', text: ''}}),
    ssEvent({type: 'content_block_delta', index: 1, delta: {type: 'text_delta', text: '我来写'}}),
    ssEvent({
        type: 'content_block_start',
        index: 2,
        content_block: {type: 'tool_use', id: 'toolu_1', name: 'xce_write_script'}
    }),
    ssEvent({type: 'content_block_delta', index: 2, delta: {type: 'input_json_delta', partial_json: '{"sprite":'}}),
    ssEvent({
        type: 'content_block_delta',
        index: 2,
        delta: {type: 'input_json_delta', partial_json: '"角色1"}'}
    }),
    ssEvent({type: 'message_delta', delta: {stop_reason: 'tool_use'}, usage: {output_tokens: 55}}),
    ssEvent({type: 'message_stop'})
];

let sent = null;
globalThis.fetch = async (url, init) => {
    sent = {url, body: JSON.parse(init.body), headers: init.headers};
    return {ok: true, status: 200, body: mkBody(chunks)};
};
try {
    const model = createCloudModel({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-5',
        apiKey: 'sk-ant',
        model: {name: 'Claude Sonnet 4.5'},
        thinking: thinkingOf('anthropic', 'claude-sonnet-4-5'),
        effort: 'high',
        maxOutputTokens: 4096
    });
    check('模型名带上供应商（界面显示用）',
        model.name === 'Anthropic Claude · Claude Sonnet 4.5', model.name);
    const deltas = [];
    const result = await model.complete(
        [{role: 'system', content: 'S'}, {role: 'user', content: '写'}],
        [{name: 'xce_write_script', description: 'd', inputSchema: {type: 'object', required: ['sprite']}}],
        {onChunk: c => deltas.push(c)}
    );
    check('请求打到 /v1/messages', sent.url === 'https://api.anthropic.com/v1/messages', sent.url);
    check('请求头带 x-api-key 与版本', sent.headers['x-api-key'] === 'sk-ant' &&
        sent.headers['anthropic-version'] === '2023-06-01');
    check('请求体：system 在顶层、工具用 input_schema',
        sent.body.system === 'S' && sent.body.tools[0].input_schema.type === 'object' &&
        sent.body.messages[0].role === 'user',
        JSON.stringify(sent.body).slice(0, 140));
    check('文本流式累加', result.text === '我来写', result.text);
    check('思考与签名分别累加（签名是分片来的）',
        result.reasoning === '先想' && result.reasoningSignature === 'sig-1',
        `${result.reasoning}/${result.reasoningSignature}`);
    check('工具参数分片拼起来后 parse',
        result.toolCalls.length === 1 && result.toolCalls[0].name === 'xce_write_script' &&
        result.toolCalls[0].input.sprite === '角色1',
        JSON.stringify(result.toolCalls));
    check('stop_reason 与 usage 归一化（缓存命中的输入也算进前缀）',
        result.finishReason === 'tool_use' && result.usage.prompt_tokens === 120 &&
        result.usage.completion_tokens === 55 && result.usage.total_tokens === 175,
        JSON.stringify(result.usage));
    check('增量事件照旧上报给界面',
        deltas.filter(d => d.kind === 'text_delta').length === 1 &&
        deltas.filter(d => d.kind === 'reasoning_delta').length === 1);
} finally {
    globalThis.fetch = originalFetch;
}

// 被 max_tokens 掐断时，半截的工具参数不能拿去执行
globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    body: mkBody([
        ssEvent({type: 'content_block_start', index: 0, content_block: {type: 'tool_use', id: 't1', name: 'x'}}),
        ssEvent({type: 'content_block_delta', index: 0, delta: {type: 'input_json_delta', partial_json: '{oops'}}),
        ssEvent({type: 'message_delta', delta: {stop_reason: 'max_tokens'}})
    ])
});
try {
    const result = await createAnthropicModel({modelId: 'm', apiKey: 'k', baseUrl: 'https://api.anthropic.com/v1'})
        .complete([{role: 'user', content: 'q'}], [], {});
    check('截断的工具调用不执行、也不 parse 半截 JSON',
        result.toolCalls.length === 0 && result.finishReason === 'max_tokens');
} finally {
    globalThis.fetch = originalFetch;
}

// 流里冒出来的 error 事件要当错误抛出去
globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    body: mkBody([ssEvent({type: 'error', error: {type: 'overloaded_error', message: 'Overloaded'}})])
});
try {
    let threw = null;
    try {
        await createAnthropicModel({modelId: 'm', apiKey: 'k', baseUrl: 'https://api.anthropic.com/v1'})
            .complete([{role: 'user', content: 'q'}], [], {});
    } catch (e) {
        threw = e.message;
    }
    check('流里的 error 事件抛成异常', threw === 'Overloaded', String(threw));
} finally {
    globalThis.fetch = originalFetch;
}

console.log(failures.length ? `\n❌ ${failures.length} 项失败：${failures.join('; ')}` : '\n✅ 全部通过');
process.exit(failures.length ? 1 : 0);
