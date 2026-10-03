// providers.js 的无头自测：请求体构造 + SSE 分帧 + 工具参数分片累积
// 用法：node src/playground/ai/providers.test.mjs
/* eslint-disable no-console */
import {
    toWireMessages, buildRequestBody, sseDataLines, createCloudModel,
    fetchProviderModels, thinkingOf
} from './providers.js';

const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

// ---------- 1. 线上消息构造 ----------
const wire = toWireMessages([
    {role: 'user', content: '写一段积木'},
    {role: 'assistant', content: '', toolCalls: [{id: 'c1', name: 'xce_write_script', input: {sprite: '角色1', text: 'move'}}]},
    {role: 'tool', toolCallId: 'c1', name: 'xce_write_script', content: '已写入'}
]);
check('assistant 的工具调用序列化成 tool_calls',
    wire[1].tool_calls && wire[1].tool_calls[0].function.name === 'xce_write_script' &&
    JSON.parse(wire[1].tool_calls[0].function.arguments).sprite === '角色1',
    JSON.stringify(wire[1].tool_calls && wire[1].tool_calls[0].function.arguments));
check('工具结果用 tool_call_id 配对',
    wire[2].role === 'tool' && wire[2].tool_call_id === 'c1');
check('assistant 空文本传 null 而不是空串', wire[1].content === null);

const body = buildRequestBody({
    model: 'deepseek-flash',
    messages: [{role: 'user', content: 'hi'}],
    tools: [{name: 'xce_read_project', description: '读', input_schema: {type: 'object'}}]
});
check('请求体带 stream 与工具声明',
    body.stream === true && body.tools[0].type === 'function' && body.tools[0].function.name === 'xce_read_project');
check('请求体开了 usage 回报', body.stream_options && body.stream_options.include_usage === true);

// ---------- 2. SSE 分帧：半截尾巴不能当事件 ----------
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

const frames = [];
for await (const payload of sseDataLines(mkBody([
    'data: {"a":1}\n\n',
    'data: {"b":',          // 半截，应该被留下不发出
    '2}\n\n',
    'data: [DONE]\n\n'
]))) frames.push(payload);
check('SSE 分帧：跨 chunk 的帧能拼起来、半截不发',
    JSON.stringify(frames) === JSON.stringify(['{"a":1}', '{"b":2}', '[DONE]']),
    JSON.stringify(frames));

const tailFrames = [];
for await (const payload of sseDataLines(mkBody(['data: {"partial":1}']))) tailFrames.push(payload);
check('SSE 分帧：没有结束标记的尾巴不当事件', tailFrames.length === 0, JSON.stringify(tailFrames));

// ---------- 3. 工具参数分片累积（最容易出错的地方）----------
const sseChunks = [
    'data: {"choices":[{"delta":{"content":"我来写"}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"xce_write_script"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"sprite\\":"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"角色1\\",\\"text\\":\\"move (10) steps\\"}"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"total_tokens":42}}\n\n',
    'data: [DONE]\n\n'
];

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    body: mkBody(sseChunks)
});

const deltas = [];
try {
    const model = createCloudModel({
        providerId: 'deepseek',
        modelId: 'deepseek-flash',
        apiKey: 'sk-test',
        baseUrl: 'https://api.deepseek.com'
    });
    const result = await model.complete(
        [{role: 'user', content: '写'}],
        [],
        {onChunk: c => deltas.push(c)}
    );
    check('流式文本累加正确', result.text === '我来写', result.text);
    check('工具调用收尾才 parse 成对象',
        result.toolCalls.length === 1 &&
        result.toolCalls[0].name === 'xce_write_script' &&
        result.toolCalls[0].input.sprite === '角色1' &&
        result.toolCalls[0].input.text === 'move (10) steps',
        JSON.stringify(result.toolCalls));
    check('finish_reason 与 usage 透传', result.finishReason === 'tool_calls' && result.usage.total_tokens === 42);
    check('增量事件按 text_delta 上报', deltas.filter(d => d.kind === 'text_delta').length === 1);
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 4. 参数不合法时不能拿去执行 ----------
globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    body: mkBody([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c","function":{"name":"xce_write_script","arguments":"{oops"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n'
    ])
});
try {
    let threw = null;
    try {
        await createCloudModel({providerId: 'deepseek', modelId: 'm', apiKey: 'k', baseUrl: 'https://x'})
            .complete([{role: 'user', content: 'q'}], [], {});
    } catch (e) {
        threw = e.message;
    }
    check('半截 JSON 参数直接报错，不静默执行', !!threw && threw.includes('不是合法 JSON'), threw);
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 5. HTTP 错误要能读懂 ----------
globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({error: {message: 'Authentication Fails'}})
});
try {
    let threw = null;
    try {
        await createCloudModel({providerId: 'deepseek', modelId: 'm', apiKey: 'bad', baseUrl: 'https://x'})
            .complete([{role: 'user', content: 'q'}], [], {});
    } catch (e) {
        threw = e.message;
    }
    check('401 被翻译成人话', !!threw && threw.includes('密钥无效') && threw.includes('Authentication Fails'), threw);
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 6. 思考模式：带工具调用时必须把 reasoning_content 回传 ----------
// 实盘踩过：DeepSeek 开思考 + 工具调用，assistant 消息不带 reasoning_content，
// 下一步直接 400「The reasoning_content in the thinking mode must be passed back to the API」。
const withReasoning = toWireMessages([
    {
        role: 'assistant',
        content: '',
        reasoning: '先读项目',
        toolCalls: [{id: 'c1', name: 'xce_read_project', input: {}}]
    },
    {role: 'assistant', content: '读完了'}
]);
check('带工具调用的 assistant 回传 reasoning_content', withReasoning[0].reasoning_content === '先读项目');
check('普通回复不回传思考内容（省上下文）', withReasoning[1].reasoning_content === void 0);

// 多轮之后只回传**最后一条**工具调用的思考，更早的剥掉（实测接口 200 接受；堆着会越滚越大）
const twoTurns = toWireMessages([
    {role: 'user', content: '一'},
    {role: 'assistant', content: '', reasoning: '老思考', toolCalls: [{id: 'c1', name: 'a', input: {}}]},
    {role: 'tool', toolCallId: 'c1', content: 'r1'},
    {role: 'assistant', content: '', reasoning: '新思考', toolCalls: [{id: 'c2', name: 'a', input: {}}]},
    {role: 'tool', toolCallId: 'c2', content: 'r2'},
    {role: 'user', content: '二'}
]);
check('思考只随最后一条工具调用回传',
    twoTurns[1].reasoning_content === void 0 && twoTurns[3].reasoning_content === '新思考');

// ---------- 7. 图片走 tool 消息的 content 数组 ----------
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const withImage = toWireMessages([
    {role: 'tool', toolCallId: 'c1', name: 'xce_read_stage', content: '舞台截图', images: [{url: PNG}]},
    {role: 'tool', toolCallId: 'c2', name: 'xce_read_state', content: 'n=5'}
]);
check('工具结果带图时 content 变成数组',
    Array.isArray(withImage[0].content) && withImage[0].content[0].type === 'text' &&
    withImage[0].content[1].type === 'image_url' &&
    withImage[0].content[1].image_url.url === PNG,
    JSON.stringify(withImage[0].content));
check('不带图的工具结果仍然是纯字符串', typeof withImage[1].content === 'string');

// ---------- 8. 思考档位的字段形态（字符串 / 布尔 / 对象三种写法）----------
const dsThinking = thinkingOf('deepseek', 'deepseek-flash');
const dsBody = buildRequestBody({
    model: 'deepseek-flash', messages: [], tools: [], effort: 'high', thinking: dsThinking
});
check('DeepSeek 走 reasoning_effort 字符串', dsBody.reasoning_effort === 'high', String(dsBody.reasoning_effort));

const glmThinking = thinkingOf('glm', 'glm-4.6');
const glmBody = buildRequestBody({
    model: 'glm-4.6', messages: [], tools: [], effort: 'on', thinking: glmThinking
});
check('GLM 走 thinking 对象',
    glmBody.thinking && glmBody.thinking.type === 'enabled', JSON.stringify(glmBody.thinking));

const qwenThinking = thinkingOf('dashscope', 'qwen3.7-plus');
const qwenBody = buildRequestBody({
    model: 'qwen3.7-plus', messages: [], tools: [], effort: 'off', thinking: qwenThinking
});
check('通义走 enable_thinking 布尔', qwenBody.enable_thinking === false, String(qwenBody.enable_thinking));

const strayBody = buildRequestBody({
    model: 'deepseek-flash', messages: [], tools: [], effort: 'not-a-level', thinking: dsThinking
});
check('档位不在声明里就不发这个字段', strayBody.reasoning_effort === void 0);

// ---------- 9. 思考内容分片也走同一条流 ----------
globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    body: mkBody([
        'data: {"choices":[{"delta":{"reasoning_content":"先看看"}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":"再动手"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好了"}}]}\n\n',
        'data: [DONE]\n\n'
    ])
});
try {
    const seen = [];
    const out = await createCloudModel({providerId: 'deepseek', modelId: 'deepseek-flash', apiKey: 'k', baseUrl: 'https://x'})
        .complete([{role: 'user', content: 'q'}], [], {onChunk: c => seen.push(c)});
    check('思考内容累加并单列', out.reasoning === '先看看再动手', out.reasoning);
    check('思考与正文分开上报',
        seen.filter(c => c.kind === 'reasoning_delta').length === 2 &&
        seen.filter(c => c.kind === 'text_delta').length === 1,
        JSON.stringify(seen.map(c => c.kind)));
} finally {
    globalThis.fetch = originalFetch;
}

// OpenRouter 的思考在 reasoning_details（数组）里
globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    body: mkBody([
        'data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.text","text":"想一半"}]}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"答"}}]}\n\n',
        'data: [DONE]\n\n'
    ])
});
try {
    const out = await createCloudModel({providerId: 'openrouter', modelId: 'x/y', apiKey: 'k', baseUrl: 'https://x'})
        .complete([{role: 'user', content: 'q'}], [], {});
    check('OpenRouter 的 reasoning_details 也认', out.reasoning === '想一半', out.reasoning);
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 10. 从接口拉模型清单并归一化（用 DeepSeek /models 的真实返回）----------
const realModels = {
    object: 'list',
    data: [
        {
            id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash', context_window: 1048576,
            max_output_tokens: 393216, input_modalities: ['text', 'image'],
            effort: {supported_levels: ['low', 'high', 'max'], default_level: 'high'}
        },
        {id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', context_window: 1048576, input_modalities: ['text']}
    ]
};
globalThis.fetch = async () => ({ok: true, status: 200, json: async () => realModels});
try {
    const list = await fetchProviderModels({providerId: 'deepseek', baseUrl: 'https://api.deepseek.com', apiKey: 'k'});
    check('拉取到的模型清单按 id 排序且字段认全',
        list.length === 2 && list[0].id === 'deepseek-flash' &&
        list[0].supportsImage === true && list[0].contextWindow === 1048576 &&
        list[0].defaultLevel === 'high' && list[1].supportsImage === false,
        JSON.stringify(list));
} finally {
    globalThis.fetch = originalFetch;
}

// ---------- 11. 打转被叫停时的「掐断」：停止读流 + 取消响应体 ----------
// 循环发现模型在复读时会从 onChunk 返回 {stop: true}；只停止读不够 —— 连接不取消，
// 服务端还在那一头继续生成、继续计费。
const stopFrames = ['片0', '片1', '片2', '片3', '片4']
    .map(piece => `data: {"choices":[{"delta":{"content":"${piece}"}}]}\n\n`);
let stopReads = 0;
let canceled = false;
globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    body: {
        getReader () {
            let i = 0;
            return {
                read: async () => {
                    stopReads++;
                    return i < stopFrames.length ?
                        {done: false, value: enc.encode(stopFrames[i++])} :
                        {done: true};
                },
                releaseLock: () => {}
            };
        },
        cancel: async () => {
            canceled = true;
        }
    }
});
try {
    let chunks = 0;
    const out = await createCloudModel({providerId: 'deepseek', modelId: 'm', apiKey: 'k', baseUrl: 'https://x'})
        .complete([{role: 'user', content: 'q'}], [], {
            onChunk: () => {
                chunks++;
                return chunks === 2 ? {stop: true} : null;
            }
        });
    check('叫停后不再往下读流', out.stopped === true && stopReads < stopFrames.length,
        `读了 ${stopReads} 片 / 共 ${stopFrames.length} 片`);
    check('取消响应体（服务端才知道该停）', canceled === true);
    check('叫停前收到的正文照样带回来', out.text === '片0片1', out.text);
} finally {
    globalThis.fetch = originalFetch;
}

// 掐断时工具参数必然是半截的，连带完整的那个也不能拿去执行
globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    body: mkBody([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"xce_list_sprites","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"接着说"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"还在说"}}]}\n\n',
        'data: [DONE]\n\n'
    ])
});
try {
    let chunks = 0;
    const out = await createCloudModel({providerId: 'deepseek', modelId: 'm', apiKey: 'k', baseUrl: 'https://x'})
        .complete([{role: 'user', content: 'q'}], [], {
            onChunk: () => {
                chunks++;
                return chunks === 2 ? {stop: true} : null;
            }
        });
    check('掐断时工具调用一律不执行', out.stopped === true && out.toolCalls.length === 0,
        JSON.stringify(out.toolCalls));
} finally {
    globalThis.fetch = originalFetch;
}

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过'}`);
process.exit(failures.length ? 1 : 0);
