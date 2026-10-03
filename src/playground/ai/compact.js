/**
 * 上下文管理与总结。做法照 ZCode 的 compact：
 *
 *   1. **先轻后重**：先跑 microcompact（把旧的工具返回换成占位符，不动模型），
 *      不够再跑整段 compact（用同一个模型把较早的轮次压成摘要）。
 *   2. **阈值 = 有效窗口 − 缓冲区**，有效窗口还要再扣掉输出预留
 *      （ZCode 用 `contextWindow - min(maxOutputTokens, 21000)`，阈值再减 13000）。
 *   3. **保留最近几轮原文**，只压老的（ZCode 的 `keepRecentToolResults` / 保留末尾组）。
 *   4. **熔断**：连续压了几次还是不够就放弃，别无限循环（ZCode 是 3 次）。
 *   5. 摘要**禁止调工具**，并要求先分析再总结，回收时把分析段剥掉。
 */

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;

/**
 * 粗估 token：中日韩字符按 1 个算，其余按 4 字符 1 个算
 * @param {string} text 任意文本
 * @returns {number} 估算的 token 数
 */
export const estimateTokens = text => {
    const str = String(text === void 0 || text === null ? '' : text);
    let cjk = 0;
    for (const ch of str) {
        if (CJK.test(ch)) cjk++;
    }
    return Math.ceil(cjk + ((str.length - cjk) / 4));
};

/**
 * 估算一组消息的 token
 * @param {Array<object>} messages 消息数组
 * @returns {number} 估算值
 */
// 一张图的粗估。各家视觉计费口径不同（有的按瓦片、有的按分辨率），
// 这里只求「别把它当 0」—— 它只参与压缩阈值判断。
export const IMAGE_TOKEN_ESTIMATE = 1000;

export const estimateMessages = messages => messages.reduce((sum, message) => {
    let total = estimateTokens(message.content) + 4;
    if (message.images && message.images.length) total += message.images.length * IMAGE_TOKEN_ESTIMATE;
    if (message.toolCalls) {
        for (const call of message.toolCalls) {
            total += estimateTokens(call.name) + estimateTokens(JSON.stringify(call.input || {})) + 8;
        }
    }
    return sum + total;
}, 0);

// ZCode 的预留/缓冲常数
export const OUTPUT_RESERVE_CAP = 21000;
export const COMPACT_BUFFER = 13000;
export const MAX_CONSECUTIVE_FAILURES = 3;

export const effectiveWindow = (contextWindow, maxOutputTokens) =>
    contextWindow - Math.min(maxOutputTokens || OUTPUT_RESERVE_CAP, OUTPUT_RESERVE_CAP);

export const compactThreshold = (contextWindow, maxOutputTokens) =>
    Math.max(4000, effectiveWindow(contextWindow, maxOutputTokens) - COMPACT_BUFFER);

/**
 * 量一下当前上下文占了多少
 * @param {object} opts 含 messages / contextWindow / maxOutputTokens / lastPromptTokens
 * @returns {{tokens: number, threshold: number, ratio: number, needed: boolean}} 计量结果
 */
export const measure = ({messages, contextWindow, maxOutputTokens, lastPromptTokens}) => {
    const estimated = estimateMessages(messages);
    // 有真实用量就信真实值（它是上一轮发出去的前缀长度），否则用估算
    const tokens = lastPromptTokens ? Math.max(lastPromptTokens, estimated) : estimated;
    const threshold = compactThreshold(contextWindow || 128000, maxOutputTokens);
    return {tokens, threshold, ratio: contextWindow ? tokens / contextWindow : 0, needed: tokens >= threshold};
};

/**
 * 切轮次：**每条用户消息开一轮**，一直到下一条用户消息为止。
 *
 * 这里跟 ZCode 的 `groupByAssistantStartedRounds` 不同，是故意的：
 * 按 assistant 开场切，会把「assistant 的工具调用」和紧随其后的「工具结果」切到两段里，
 * 压缩后保留下来的尾部就会以一条孤儿 tool 消息开头 —— 那种消息数组发给 provider 会直接报错。
 * 按用户消息切天然把「一轮里的调用+结果」绑在一起。
 * @param {Array<object>} messages 消息数组
 * @returns {Array<Array<object>>} 轮次分组
 */
export const groupByTurns = messages => {
    const groups = [];
    for (const message of messages) {
        if (groups.length === 0 || message.role === 'user') groups.push([]);
        groups[groups.length - 1].push(message);
    }
    return groups;
};

export const CLEARED = '[较早的工具返回已清理]';

/**
 * 轻量压缩：把最近 keepRecent 轮之外的工具返回内容换成占位符。不调模型。
 * @param {object} session 会话
 * @param {object} opts 含 keepRecent
 * @returns {number} 清掉了多少条
 */
export const microcompact = (session, {keepRecent = 5} = {}) => {
    const groups = groupByTurns(session.messages);
    const cutoff = groups.length - keepRecent;
    let cleared = 0;
    for (let i = 0; i < Math.max(0, cutoff); i++) {
        for (const message of groups[i]) {
            if (message.role !== 'tool') continue;
            // 图片是最占地方的东西，清的时候必须一起丢掉
            if (message.images && message.images.length) {
                message.images = [];
                cleared++;
            }
            if (message.content && message.content !== CLEARED) {
                message.content = CLEARED;
                cleared++;
            }
        }
    }
    return cleared;
};

/* eslint-disable max-len -- 摘要提示词是散文，硬换行会改掉发给模型的文本 */
const SUMMARY_PROMPT = `You are summarizing an earlier part of a conversation so work can continue in a smaller context window. Do not call any tools.

First write your analysis inside <analysis></analysis> tags: what the user asked for, what you did, what you tried that failed, and what is still open. Then write the summary inside <summary></summary> tags. The summary must carry forward, verbatim where it matters:

1. What the user asked for, including any explicit constraints or preferences.
2. Decisions made and why, so they are not re-litigated.
3. Facts discovered about the project: sprite names, variable and list names, script contents that matter, extension availability.
4. Anything left unfinished, and the next step.

Write it in Chinese, compact, no greeting. Facts and names exactly as they were — never paraphrase a variable name.`;

/**
 * 整段压缩：把 keepRecent 轮之外的全部内容压成一条摘要消息。
 * @param {object} opts 含 session / model / keepRecent / signal / onEvent
 * @returns {Promise<object>} 压缩结果（compacted / reason / removed）
 */
export const compactSession = async ({session, model, keepRecent = 2, signal, onEvent = () => {}}) => {
    const groups = groupByTurns(session.messages);
    if (groups.length <= keepRecent + 1) {
        return {compacted: false, reason: '没几轮可压'};
    }
    let splitAt = Math.max(1, groups.length - keepRecent);
    // 保留下来的第一段不能以孤儿 tool 消息开头（见 groupByTurns 的注释）
    while (splitAt < groups.length && groups[splitAt][0] && groups[splitAt][0].role === 'tool') {
        splitAt++;
    }
    if (splitAt >= groups.length) return {compacted: false, reason: '切点不合适'};

    const oldGroups = groups.slice(0, splitAt);
    const recent = groups.slice(splitAt).flat();
    const oldMessages = oldGroups.flat();

    const transcript = oldMessages.map(message => {
        if (message.role === 'tool') {
            const shot = message.images && message.images.length ?
                `（其中包含 ${message.images.length} 张舞台截图）` : '';
            return `[工具返回] ${String(message.content).slice(0, 600)}${shot}`;
        }
        let line = `[${message.role}] ${String(message.content || '').slice(0, 1200)}`;
        if (message.toolCalls && message.toolCalls.length) {
            line += `\n[它调用了] ${message.toolCalls.map(c => c.name).join(', ')}`;
        }
        return line;
    }).join('\n');

    onEvent({type: 'compacting', removing: oldMessages.length});
    const reply = await model.complete(
        [{
            role: 'user',
            content: `${SUMMARY_PROMPT}\n\n--- 需要总结的对话 ---\n${transcript}`
        }],
        [],
        {signal, onChunk: () => {}}
    );
    const raw = (reply && reply.text) || '';
    // 回收时把分析段剥掉（ZCode 的 formatCompactSummary）
    const summary = (raw.match(/<summary>([\s\S]*?)<\/summary>/) || [null, raw])[1].trim();
    if (!summary) return {compacted: false, reason: '摘要为空'};

    // eslint-disable-next-line require-atomic-updates -- 会话独占，无并发
    session.messages = [
        {
            role: 'user',
            content:
                `（这是一次自动总结。之前的 ${oldGroups.length} 轮对话被压缩成了下面这段摘要，` +
                `原文不再逐字保留 —— 需要当前事实就用工具重新读项目。）\n\n${summary}`
        },
        ...recent
    ];
    session.compactCount = (session.compactCount || 0) + 1;
    return {compacted: true, removed: oldMessages.length};
};

/**
 * 每轮开跑之前调用：先轻量压缩，不够再整段压缩，并带熔断
 * @param {object} opts 含 session / model / contextWindow / maxOutputTokens / signal / onEvent
 * @returns {Promise<object>} 计量结果与做了什么
 */
export const maybeCompact = async ({session, model, contextWindow, maxOutputTokens, signal, onEvent}) => {
    const before = measure({
        messages: session.messages,
        contextWindow,
        maxOutputTokens,
        lastPromptTokens: session.lastPromptTokens
    });
    if (!before.needed) return {measured: before, compacted: false};
    if ((session.consecutiveFailures || 0) >= MAX_CONSECUTIVE_FAILURES) {
        return {measured: before, compacted: false, reason: '连续压缩失败，已熔断'};
    }

    const cleared = microcompact(session);
    const afterMicro = measure({
        messages: session.messages,
        contextWindow,
        maxOutputTokens,
        lastPromptTokens: 0
    });
    if (!afterMicro.needed) {
        session.lastPromptTokens = 0;
        return {measured: afterMicro, compacted: true, micro: true, cleared};
    }

    const result = await compactSession({session, model, signal, onEvent});
    // eslint-disable-next-line require-atomic-updates -- 会话独占，无并发
    session.consecutiveFailures = result.compacted ? 0 : (session.consecutiveFailures || 0) + 1;
    // eslint-disable-next-line require-atomic-updates -- 会话独占，无并发
    session.lastPromptTokens = 0;
    return {
        measured: measure({messages: session.messages, contextWindow, maxOutputTokens, lastPromptTokens: 0}),
        ...result,
        cleared
    };
};
