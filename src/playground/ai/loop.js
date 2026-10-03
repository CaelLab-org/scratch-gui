/**
 * Agent 循环。
 *
 * 抄的是 ZCode / deepseek-harness 里最核心的那条判断：
 *   「模型这轮有没有要调工具？有就执行完再问一次，没有就收工。」
 * dsh 把它写成 step() 返回 null = 欠一次请求，这里等价。
 *
 * 第二条必抄的是中断收尾：用户按停止标志时，所有在飞的工具都要补一条结果，
 * 否则下一次请求的消息历史里会出现「声明了工具调用却没有结果」——provider 直接报错。
 */

// 工具的模型可见声明
export const toolToSchema = tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
});

// 执行一次工具调用。抛出的异常一律包成 isError 结果，不要让循环炸掉
export const executeTool = async (call, tools, ctx) => {
    const tool = tools.find(t => t.name === call.name);
    if (!tool) {
        return {content: `错误：没有名为 ${call.name} 的工具`, isError: true};
    }
    try {
        const input = call.input || {};
        const required = (tool.inputSchema && tool.inputSchema.required) || [];
        const missing = required.filter(key => input[key] === void 0);
        if (missing.length) {
            return {content: `错误：缺少参数 ${missing.join(', ')}`, isError: true};
        }
        if (tool.validate) {
            const problem = tool.validate(input);
            if (problem) return {content: `错误：${problem}`, isError: true};
        }
        const result = await tool.handler(input, ctx);
        if (typeof result === 'string') return {content: result};
        return {
            content: result.content,
            isError: !!result.isError,
            undo: result.undo,
            images: result.images
        };
    } catch (e) {
        return {content: `工具执行失败：${(e && e.message) || e}`, isError: true};
    }
};

/**
 * @param {object} opts
 *   session  会话
 *   model    {name, complete(messages, tools, {signal, onChunk}) -> {text, toolCalls}}
 *   tools    工具数组（见 tools.js）
 *   signal   AbortSignal
 *   onEvent  ({type, ...}) => void，给 UI 用
 *   maxSteps 兜底：单轮最多几次模型往返（默认 12）
 */
export const runTurn = async ({session, model, tools, signal, onEvent = () => {}, maxSteps = 12, system}) => {
    const schemas = tools.map(toolToSchema);
    let steps = 0;
    let finalText = '';

    while (steps++ < maxSteps) {
        if (signal && signal.aborted) break;

        // 系统提示词每轮现拼（角色/项目概况可能已经变了），但不进会话历史
        const messages = system ? [{role: 'system', content: system}, ...session.messages] : session.messages;
        const reply = await model.complete(messages, schemas, {
            signal,
            onChunk: chunk => onEvent({type: 'chunk', ...chunk})
        });
        if (!reply) break;

        // 真实用量：prompt_tokens 就是这一轮发出去的前缀长度，上下文计量以它为准
        // 会话是本次对话独占的，不存在并发写；这条规则在这里是误报
        /* eslint-disable require-atomic-updates */
        if (reply.usage && typeof reply.usage.prompt_tokens === 'number') {
            session.lastPromptTokens = reply.usage.prompt_tokens;
        }
        session.lastUsage = reply.usage || session.lastUsage;
        /* eslint-enable require-atomic-updates */

        const assistantMessage = {role: 'assistant', content: reply.text || ''};
        if (reply.toolCalls && reply.toolCalls.length) assistantMessage.toolCalls = reply.toolCalls;
        // 开思考时，带工具调用的 assistant 消息必须带上思考原文，下一轮要原样回传（否则接口 400）
        if (reply.reasoning) assistantMessage.reasoning = reply.reasoning;
        session.messages.push(assistantMessage);
        onEvent({type: 'assistant', message: assistantMessage, usage: reply.usage});

        const calls = assistantMessage.toolCalls || [];
        if (!calls.length) {
            finalText = assistantMessage.content;
            break;
        }

        for (const call of calls) {
            if (signal && signal.aborted) break;
            const startedAt = Date.now();
            onEvent({type: 'tool-start', call});
            const result = await executeTool(call, tools, {signal, session, supportsImage: !!model.supportsImage});
            const record = {call, result, duration: Date.now() - startedAt};
            session.toolCalls.push(record);
            onEvent({type: 'tool-end', ...record});
            session.messages.push({
                role: 'tool',
                toolCallId: call.id,
                name: call.name,
                content: result.content,
                isError: !!result.isError,
                images: result.images
            });
        }

        // 中断 / 达到步数上限时收口
        if (signal && signal.aborted) break;
    }

    return {text: finalText, steps, aborted: !!(signal && signal.aborted)};
};
