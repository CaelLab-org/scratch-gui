/**
 * 会话与工具执行结果的数据形状。
 * 只有两个概念：会话里的一条消息，和一次工具调用。
 */

// 新建一条空会话
export const createSession = () => ({
    messages: [],
    // 每次工具调用留档，供 UI 画卡片与撤销
    toolCalls: []
});

export const addMessage = (session, message) => {
    session.messages.push(message);
    return message;
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
