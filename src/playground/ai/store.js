/**
 * 会话的本地持久化（多会话版）。
 *
 * 存在 localStorage 里（cookie 只有 4KB，塞不下对话；而且对话不该随每个请求上行）。
 * 磁盘结构：
 *   { version: 2, currentId, conversations: [会话…] }
 *   一条会话 = {id, title, createdAt, updatedAt, messages, items,
 *              lastPromptTokens, lastUsage, compactCount}
 *
 * 「当前对话」由 currentId 指定；每次保存都把这条会话挪到数组末尾（最近使用的在最后），
 * 超过 MAX_CONVERSATIONS 条时丢掉最旧的非当前会话。空会话（一条消息都没有）不入库——
 * 刷新前一个字没说的标签页不该在历史列表里留垃圾。
 * 但「不入库」不等于「不记位置」：点「新对话」或切到别的会话之后就调 setCurrentConversation
 * 把位置落下去，否则刷新会弹回上一条（新对话那条空会话存不进，currentId 还停在旧会话上）。
 *
 * 舞台截图**不入库**：一张 base64 图几十到几百 KB，几轮就能把 5MB 配额顶爆，
 * 而顶爆之后是整个存储都写不进去（不是只丢图）。所以存之前把图换成一句标记，
 * 刷新后工具卡上显示「截图未保留」。
 *
 * 多会话之后配额更容易顶爆，所以写不进时有降级：从最旧的非当前会话开始丢，
 * 丢一条重试一次；全丢光还写不进（说明当前这条自己就超了）就放弃，不影响使用。
 */
const KEY = 'xce_ai_conversations';
const KEY_V1 = 'xce_ai_conversation';
const VERSION = 2;
const MAX_CONVERSATIONS = 30;
const MAX_ITEMS = 200;
const TITLE_LENGTH = 24;

// 给界面用的一句话
export const DROPPED_NOTE = '（截图未保留：刷新后不显示，重新截一张即可）';

const stripImages = list => list.map(entry => {
    if (!entry.images || !entry.images.length) return entry;
    return {...entry, images: [], imagesDropped: true};
});

export const newConversationId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36)
        .slice(2, 8)}`;

// 标题取第一条用户消息，掐头去尾再截断
const titleOf = messages => {
    const first = messages.find(m => m.role === 'user' && m.content);
    if (!first) return '新对话';
    const text = String(first.content).replace(/\s+/g, ' ')
        .trim();
    return text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH)}…` : text;
};

// 读整个存储并迁掉 v1 单会话格式。坏了（解析失败/形状不对）按空库处理。
const readAll = () => {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.version === VERSION && Array.isArray(parsed.conversations)) {
                return {
                    currentId: parsed.currentId || null,
                    conversations: parsed.conversations
                };
            }
        }
        // v1：只有一份「当前对话」，没有列表。包成一条会话搬过来，旧 key 删掉。
        const old = localStorage.getItem(KEY_V1);
        if (old) {
            const parsed = JSON.parse(old);
            if (parsed && Array.isArray(parsed.messages) && parsed.messages.length) {
                const conversation = {
                    id: newConversationId(),
                    title: titleOf(parsed.messages),
                    createdAt: parsed.updatedAt || Date.now(),
                    updatedAt: parsed.updatedAt || Date.now(),
                    messages: parsed.messages,
                    items: Array.isArray(parsed.items) ? parsed.items : [],
                    lastPromptTokens: parsed.lastPromptTokens || 0,
                    lastUsage: parsed.lastUsage || null,
                    compactCount: parsed.compactCount || 0
                };
                const migrated = {
                    version: VERSION,
                    currentId: conversation.id,
                    conversations: [conversation]
                };
                try {
                    localStorage.setItem(KEY, JSON.stringify(migrated));
                    localStorage.removeItem(KEY_V1);
                } catch (e) {
                    // 写不进去就只在内存里迁移（本次会话仍能用）
                }
                return {currentId: conversation.id, conversations: [conversation]};
            }
            // 旧库是空的：直接扔掉旧 key，别让它一直躺在那
            localStorage.removeItem(KEY_V1);
        }
    } catch (e) {
        // 解析失败等一切异常都按空库来，别让一个坏档把面板弄挂
    }
    return {currentId: null, conversations: []};
};

const writeAll = all => {
    localStorage.setItem(KEY, JSON.stringify({version: VERSION, ...all}));
};

// 写入 + 配额降级：先直接写；写不进就从最旧的非当前会话开始累积丢弃，丢一条重试一次
const writeAllWithEviction = all => {
    try {
        writeAll(all);
        return true;
    } catch (e) {
        // 进降级
    }
    let remaining = all.conversations;
    const candidates = all.conversations.filter(c => c.id !== all.currentId);
    for (const victim of candidates) {
        remaining = remaining.filter(c => c.id !== victim.id);
        try {
            writeAll({...all, conversations: remaining});
            return true;
        } catch (e) {
            // 还是写不进，继续丢下一条
        }
    }
    return false;
};

// 列表用的轻投影（标题 + 时间 + 是否空）。localStorage 只能整体读，这里读全量再掐。
export const loadConversationIndex = () => {
    const all = readAll();
    return {
        currentId: all.currentId,
        conversations: all.conversations
            .filter(c => c.messages && c.messages.length)
            .map(c => ({
                id: c.id,
                title: c.title || titleOf(c.messages),
                updatedAt: c.updatedAt || 0,
                messageCount: c.messages.length
            }))
    };
};

// 把一条会话还原成面板用的形状（session 以 session.js 为准，toolCalls 不落盘）
export const loadConversation = id => {
    if (!id) return null;
    const all = readAll();
    const conversation = all.conversations.find(c => c.id === id);
    if (!conversation || !conversation.messages) return null;
    return {
        session: {
            messages: conversation.messages,
            toolCalls: [],
            lastPromptTokens: conversation.lastPromptTokens || 0,
            lastUsage: conversation.lastUsage || null,
            compactCount: conversation.compactCount || 0
        },
        items: Array.isArray(conversation.items) ? conversation.items : []
    };
};

// 保存一条会话并设为当前。空会话（没消息）从库里剔除。
// items 保留最近 MAX_ITEMS 条；messages 原样存（压缩由 compact.js 负责，这里不裁）。
export const saveConversation = (id, session, items) => {
    if (!id) return false;
    const all = readAll();
    const rest = all.conversations.filter(c => c.id !== id);
    const empty = !session.messages.length;
    if (empty) {
        // 空会话不入库；库里若还有这个 id 的残留（比如刚才发过又撤光了）也一并清掉
        try {
            writeAllWithEviction({...all, conversations: rest});
        } catch (e) {
            // 忽略
        }
        return false;
    }
    const now = Date.now();
    const existing = rest.find(c => c.id === id);
    const conversation = {
        ...(existing || {id, createdAt: now}),
        title: titleOf(session.messages),
        updatedAt: now,
        messages: session.messages,
        items: stripImages(items.slice(-MAX_ITEMS)),
        lastPromptTokens: session.lastPromptTokens || 0,
        lastUsage: session.lastUsage || null,
        compactCount: session.compactCount || 0
    };
    // 总量裁剪：最近使用的在末尾，当前会话一定在最后 —— 从头上掉的都是最旧的非当前会话
    let conversations = [...rest, conversation];
    if (conversations.length > MAX_CONVERSATIONS) {
        conversations = conversations.slice(conversations.length - MAX_CONVERSATIONS);
    }
    return writeAllWithEviction({
        currentId: id,
        conversations
    });
};

// 只把「当前对话」的位置挪一下（不动会话内容）。传 null = 当前是一条还没落库的新对话。
// 切换 / 新建之后必须落一次，否则刷新时会按旧的 currentId 弹回上一条。
export const setCurrentConversation = id => {
    const all = readAll();
    const next = id || null;
    if (all.currentId === next) return true;
    try {
        writeAll({...all, currentId: next});
        return true;
    } catch (e) {
        // 写不进就只在本次会话里生效（内存里照样切了）
        return false;
    }
};

// 删一条。删的是当前会话时，currentId 落到剩下最近的一条（没有就 null）。
export const deleteConversation = id => {
    const all = readAll();
    const conversations = all.conversations.filter(c => c.id !== id);
    if (conversations.length === all.conversations.length) return null;
    const currentId = all.currentId === id ?
        (conversations.length ? conversations[conversations.length - 1].id : null) :
        all.currentId;
    try {
        writeAllWithEviction({currentId, conversations});
    } catch (e) {
        // 删除还写不进去说明配额真的爆了；至少内存里已经删了
    }
    return currentId;
};
