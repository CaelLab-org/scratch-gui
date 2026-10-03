// store.js 的无头自测：多会话存取 / v1 迁移 / 空会话剔除 / 配额降级
// 用法：node src/playground/ai/store.test.mjs
/* eslint-disable no-console, no-undef */
import {
    newConversationId, loadConversationIndex, loadConversation,
    saveConversation, deleteConversation, DROPPED_NOTE
} from './store.js';

const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

// ---------- localStorage 的最小替身（带可开关的配额故障） ----------
// failing = true 时模拟「配额见顶」：写入会超总量（5000 字符）才抛错，
// 这样丢掉几条旧数据后就写得进 —— 真实的配额场景是挤一挤能塞下，不是永远写不进。
const makeStorage = () => {
    const map = new Map();
    const QUOTA = 400;
    const storage = {
        getItem: k => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => {
            if (storage.failing) {
                let total = String(v).length;
                for (const [kk, vv] of map) {
                    if (kk !== k) total += vv.length;
                }
                if (total > QUOTA) {
                    const err = new Error('quota exceeded');
                    err.name = 'QuotaExceededError';
                    throw err;
                }
            }
            map.set(k, String(v));
        },
        removeItem: k => map.delete(k),
        _map: map
    };
    storage.failing = false;
    return storage;
};
globalThis.localStorage = makeStorage();

// ---------- 基本存取 ----------
const idA = newConversationId();
const sessionA = {
    messages: [{role: 'user', content: '帮我做一个计数器，数到十就停'}],
    toolCalls: [],
    lastPromptTokens: 100,
    lastUsage: null,
    compactCount: 0
};
check('保存一条会话返回 true', saveConversation(idA, sessionA, [{kind: 'user', text: '帮我做一个计数器，数到十就停'}]) === true);
check('读回来是一条消息', loadConversation(idA).session.messages.length === 1);
check('toolCalls 恢复成空数组', Array.isArray(loadConversation(idA).session.toolCalls));
check('标题取第一条用户消息并截断', loadConversationIndex().conversations[0].title.startsWith('帮我做一个计数器'));
const index1 = loadConversationIndex();
check('currentId 指向刚保存的', index1.currentId === idA);
check('列表里带消息数', index1.conversations[0].messageCount === 1);

// ---------- 空会话不入库 ----------
const idEmpty = newConversationId();
check('空会话保存返回 false', saveConversation(idEmpty, {messages: [], toolCalls: []}, []) === false);
check('空会话没进列表', loadConversationIndex().conversations.length === 1);

// ---------- 截图剥离 ----------
const idB = newConversationId();
const itemsWithImage = [
    {kind: 'user', text: '截图看看'},
    {kind: 'tool', id: 't1', name: 'read_stage', status: 'done', content: 'ok', images: ['data:image/png;base64,AAAA']}
];
saveConversation(idB, {messages: [{role: 'user', content: '截图看看'}], toolCalls: []}, itemsWithImage);
const loadedB = loadConversation(idB);
check('截图被剥掉', loadedB.items[1].images.length === 0 && loadedB.items[1].imagesDropped === true);

// ---------- v1 迁移（要在干净库上测：库里已有 v2 数据时迁移分支不会走） ----------
globalThis.localStorage._map.clear();
const OLD_KEY = 'xce_ai_conversation';
globalThis.localStorage._map.set(OLD_KEY, JSON.stringify({
    messages: [{role: 'user', content: '旧版的对话'}],
    lastPromptTokens: 7,
    items: [{kind: 'user', text: '旧版的对话'}],
    updatedAt: 1700000000000
}));
const migrated = loadConversationIndex();
check('v1 迁移出一条会话', migrated.conversations.length === 1);
check('v1 迁移后旧 key 已删', globalThis.localStorage.getItem(OLD_KEY) === null);
const migratedSession = loadConversation(migrated.conversations[0].id);
check('迁移后消息还在', migratedSession.session.messages[0].content === '旧版的对话');
check('迁移后 lastPromptTokens 保留', migratedSession.session.lastPromptTokens === 7);

// ---------- 删除（用迁移来的那条测） ----------
const migratedId = migrated.currentId;
check('删除会话返回 null（删的是唯一一条）', deleteConversation(migratedId) === null);
check('删掉的就读不到了', loadConversation(migratedId) === null);
check('全删光后列表为空', loadConversationIndex().conversations.length === 0);

// ---------- 配额降级：从最旧的非当前会话开始丢 ----------
globalThis.localStorage._map.clear();
const ids = [];
for (let i = 0; i < 5; i++) {
    const id = newConversationId();
    ids.push(id);
    saveConversation(id, {messages: [{role: 'user', content: `对话 ${i}`}], toolCalls: []}, []);
}
// 逐条触碰，保证「最近使用」顺序是 0,1,2,3,4
for (let i = 0; i < 5; i++) {
    saveConversation(ids[i], {messages: [{role: 'user', content: `对话 ${i}`}], toolCalls: []}, []);
}
globalThis.localStorage.failing = true;
const savedUnderQuota = saveConversation(
    ids[4], {messages: [{role: 'user', content: '对话 4'}], toolCalls: []}, []
);
check('配额爆了也返回 true（靠丢最旧的）', savedUnderQuota === true);
check('降级后仍能读回当前会话', loadConversation(ids[4]).session.messages[0].content === '对话 4');
const evicted = loadConversationIndex();
check('降级丢掉了旧会话', evicted.conversations.length < 5, `剩 ${evicted.conversations.length} 条`);
globalThis.localStorage.failing = false;

// ---------- DROPPED_NOTE ----------
check('截图标记文案存在', typeof DROPPED_NOTE === 'string' && DROPPED_NOTE.includes('截图'));

console.log(failures.length ? `\n${failures.length} 项失败` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
