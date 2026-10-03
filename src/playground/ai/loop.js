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

// 工具结果的硬限制（用户定的）：超过就截断，并在底部注明。
// 支持分页的工具（paged: true，如 xce_read_project）在截断提示里教模型怎么翻页。
export const MAX_TOOL_CHARS = 20 * 1024;

const truncateContent = (content, tool) => {
    if (typeof content !== 'string' || content.length <= MAX_TOOL_CHARS) return content;
    const hint = tool && tool.paged ?
        ' Call again with lineStart / lineEnd to get a specific line range' +
        ' (a paged result is capped at 20KB too).' : '';
    return `${content.slice(0, MAX_TOOL_CHARS)}\n\n[Truncated: too long (over 20KB).${hint}]`;
};

/**
 * 「跳过」令牌：给等待类工具（tool.skippable，如 xce_time）用。
 * 同一份令牌发给两边 —— 工具拿着它 race（见 tools.js 的 waitSeconds），界面上点「跳过」调 skip()。
 * 于是用户不必等自然到点：工具立刻拿到结果继续，模型也从结果里看出这段等待被砍短了。
 * @returns {object} 令牌：promise（工具 race 的对象）、skipped、skip()
 */
export const createSkipToken = () => {
    let skipped = false;
    let fire = null;
    const promise = new Promise(resolve => {
        fire = resolve;
    });
    return {
        promise,
        get skipped () {
            return skipped;
        },
        skip () {
            if (skipped) return false;
            skipped = true;
            fire();
            return true;
        }
    };
};

// 执行一次工具调用。抛出的异常一律包成 isError 结果，不要让循环炸掉
export const executeTool = async (call, tools, ctx) => {
    const tool = tools.find(t => t.name === call.name);
    if (!tool) {
        return {content: `Error: there is no tool named ${call.name}`, isError: true};
    }
    try {
        const input = call.input || {};
        const required = (tool.inputSchema && tool.inputSchema.required) || [];
        const missing = required.filter(key => input[key] === void 0);
        if (missing.length) {
            // 把参数名单列出来 —— 模型第一次调用常见「参数名编错」（比如把 text 写成 script），
            // 给它正确的名单就能自己纠正，不用用户插手
            const propNames = Object.keys((tool.inputSchema && tool.inputSchema.properties) || {});
            return {
                content: `Error: missing parameter(s) ${missing.join(', ')}. The parameters of ${tool.name} ` +
                    `are: ${propNames.join(', ')}. Check the parameter names against that list and call again.`,
                isError: true
            };
        }
        if (tool.validate) {
            const problem = tool.validate(input);
            if (problem) return {content: `Error: ${problem}`, isError: true};
        }
        const result = await tool.handler(input, ctx);
        if (typeof result === 'string') return {content: truncateContent(result, tool)};
        return {
            content: truncateContent(result.content, tool),
            isError: !!result.isError,
            undo: result.undo,
            images: result.images
        };
    } catch (e) {
        return {content: `Tool execution failed: ${(e && e.message) || e}`, isError: true};
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
    // 循环为什么结束：正常收尾=null；'steps'=到步数上限；'length'=输出被 max_tokens 掐断；
    // 'empty'=模型没返回内容（连接中途断掉之类）。UI 据此给用户明确的提示，而不是「跑着跑着就没了」。
    let reason = null;
    let finished = false;

    while (steps++ < maxSteps) {
        if (signal && signal.aborted) break;

        // 系统提示词每轮现拼（角色/项目概况可能已经变了），但不进会话历史
        const messages = system ? [{role: 'system', content: system}, ...session.messages] : session.messages;
        const reply = await model.complete(messages, schemas, {
            signal,
            onChunk: chunk => onEvent({type: 'chunk', ...chunk})
        });
        if (!reply) {
            reason = 'empty';
            break;
        }

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
        // 思考原文只在会话里留一轮：toWireMessages 只回传最后一条（更早的剥掉，用户要求别堆进历史）
        if (reply.reasoning) assistantMessage.reasoning = reply.reasoning;
        session.messages.push(assistantMessage);
        onEvent({type: 'assistant', message: assistantMessage, usage: reply.usage});

        const calls = assistantMessage.toolCalls || [];
        if (!calls.length) {
            if (!assistantMessage.content) {
                // 既没有正文也没有工具调用 —— 输出到上限被掐断，或连接中途断了。
                // 原来这里会静默结束（表现为「跑着跑着突然停了」），必须说清楚。
                reason = reply.finishReason === 'length' ? 'length' : 'empty';
                break;
            }
            finalText = assistantMessage.content;
            finished = true;
            break;
        }

        for (const call of calls) {
            if (signal && signal.aborted) break;
            const startedAt = Date.now();
            // 只有声明了 skippable 的工具（等待类）才发令牌：界面据此决定要不要画「跳过」
            const tool = tools.find(t => t.name === call.name);
            const skip = tool && tool.skippable ? createSkipToken() : null;
            onEvent({type: 'tool-start', call, skip});
            const result = await executeTool(call, tools, {
                signal, session, supportsImage: !!model.supportsImage, skip
            });
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

    if (!finished && !reason && !(signal && signal.aborted)) {
        reason = 'steps';
    }

    return {text: finalText, steps, reason, aborted: !!(signal && signal.aborted)};
};
