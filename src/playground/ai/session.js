/**
 * 会话与工具执行结果的数据形状。
 * 只有两个概念：会话里的一条消息，和一次工具调用。
 */

// 新建一条空会话
export const createSession = () => ({
    messages: [],
    // 每次工具调用留档，供 UI 画卡片与撤销
    toolCalls: [],
    // 这条会话当前用哪个模型（{providerId, modelId, effort, label}）。
    // 用户 2026-10-04 要的「会话级模型」：切换会话时按它把模型换回去；每轮发送时刷新一次。
    model: null,
    // 会话累计用量 {requests, prompt, promptCached, cached, completion}，loop.js 累加。
    // promptCached 是「报了缓存字段的那些请求」的输入量 —— 命中率的分母只算它们。
    // null = 一次请求都还没发过
    usageStats: null
});

export const addMessage = (session, message) => {
    session.messages.push(message);
    return message;
};

/**
 * 一条用户消息的 id。**界面上的条目和会话里的消息共用同一个** ——
 * 「改这一轮说了什么」要按它把两边（items 与 messages）同时截断，靠数下标是脆的：
 * 压缩会重写 messages（见 compact.js），下标会漂。
 * @returns {string} 例如 `u-m1k3x9-a7f2q`
 */
export const newUserMessageId = () =>
    `u-${Date.now().toString(36)}-${Math.random().toString(36)
        .slice(2, 7)}`;

/**
 * 给老对话补提问的 id。加「改上一轮发言」之前存下来的条目和消息都没有 id，
 * 而没有 id 就没法把 items 和 messages 切在同一个位置（截断会切歪）。
 *
 * 配对方式：按顺序一一对应 —— 第 i 条用户条目 ↔ 第 i 条用户消息。
 * 两边本来都是「每发一次各追加一条」，所以顺序一定对得上；
 * 唯一的例外是「回退本轮变更」会往消息尾巴插一条合成的提示消息（没有对应条目），
 * 它是排在最后的，不影响前面的配对。
 *
 * @param {Array} items 面板条目
 * @param {Array} messages 会话消息
 * @returns {number} 补了几条
 */
export const backfillUserMessageIds = (items, messages) => {
    const userItems = (items || []).filter(item => item && item.kind === 'user');
    const userMessages = (messages || []).filter(message => message && message.role === 'user');
    let filled = 0;
    for (let i = 0; i < userItems.length; i++) {
        const message = userMessages[i];
        if (!message) break;
        const id = message.id || userItems[i].id || newUserMessageId();
        if (!message.id) {
            message.id = id;
            filled++;
        }
        if (!userItems[i].id) userItems[i].id = id;
    }
    return filled;
};

/**
 * 把历史截断到某条用户消息**之前**（不含它）—— 「改这一轮」用。
 * @param {Array<object>} messages 消息数组
 * @param {string} id 那条用户消息的 id
 * @returns {Array<object>|null} 截断后的副本；id 已经不在了（那段被压缩成摘要了）返回 null
 */
export const messagesBefore = (messages, id) => {
    const index = messages.findIndex(message => message.role === 'user' && message.id === id);
    return index === -1 ? null : messages.slice(0, index);
};

/**
 * 从开头截到「下一条用户消息之前」—— 「分叉到这一轮为止」用：这一轮归上一轮所有。
 * @param {Array<object>} messages 消息数组
 * @param {string} nextUserId 下一条用户消息的 id；没有下一条（最后一轮）传 null
 * @returns {Array<object>|null} 截断后的副本；找不到那条消息返回 null
 */
export const messagesUpTo = (messages, nextUserId) => {
    if (!nextUserId) return messages.slice();
    const index = messages.findIndex(message => message.role === 'user' && message.id === nextUserId);
    return index === -1 ? null : messages.slice(0, index);
};

// 中断收尾：给所有没有结果的工具调用补一条结果，否则下一轮请求的消息历史是非法的
export const settlePendingToolCalls = (session, reason = 'Tool interrupted before it finished') => {
    const answered = new Set(
        session.messages.filter(m => m.role === 'tool').map(m => m.toolCallId)
    );
    const settled = [];
    for (const message of session.messages) {
        if (message.role !== 'assistant' || !message.toolCalls) continue;
        for (const call of message.toolCalls) {
            if (answered.has(call.id)) continue;
            const result = {
                role: 'tool',
                toolCallId: call.id,
                name: call.name,
                content: reason,
                isError: true
            };
            session.messages.push(result);
            answered.add(call.id);
            settled.push(result);
        }
    }
    return settled;
};

// 模型看到的消息（去掉内部字段）
export const toModelMessages = session => session.messages.map(message => {
    const copy = {...message};
    delete copy.id;
    delete copy.name;
    delete copy.isError;
    return copy;
});
