// store.js 的无头自测：多会话存取 / v1 迁移 / 空会话剔除 / 配额降级
// 用法：node src/playground/ai/store.test.mjs
/* eslint-disable no-console, no-undef */
import {
    newConversationId, loadConversationIndex, loadConversation,
    saveConversation, saveFork, deleteConversation, setCurrentConversation, DROPPED_NOTE,
    exportConversation, exportAllConversations, planChatImport, applyChatImport
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

// ---------- 切换位置要落盘（点「新对话」后刷新不该弹回上一条） ----------
check('切到新对话后 currentId 清空', setCurrentConversation(null) === true && loadConversationIndex().currentId === null);
check('清空位置不碰已有会话', loadConversationIndex().conversations.length === 1);
// 空会话的自动落盘（防抖 / 关页面）走的是「不入库」分支，不能顺手把位置改回去
const idEmpty2 = newConversationId();
saveConversation(idEmpty2, {messages: [], toolCalls: []}, []);
check('空会话落盘不会改回位置', loadConversationIndex().currentId === null);
check('再切回旧会话能记住', setCurrentConversation(idA) === true && loadConversationIndex().currentId === idA);

// ---------- 截图剥离 ----------
const idB = newConversationId();
const itemsWithImage = [
    {kind: 'user', text: '截图看看'},
    {
        kind: 'tool',
        id: 't1',
        name: 'xce_read_stage',
        status: 'done',
        content: 'ok',
        images: ['data:image/png;base64,AAAA']
    }
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

// ---------- 分叉：复制成一条新会话，原会话一个字不动 ----------
globalThis.localStorage._map.clear();
const idParent = newConversationId();
const parentMessages = [
    {role: 'user', content: '做个计数器', id: 'u1'},
    {role: 'assistant', content: '做好了。'},
    {role: 'user', content: '再加个音效', id: 'u2'},
    {role: 'assistant', content: '加了。'}
];
const parentItems = [
    {kind: 'user', text: '做个计数器', id: 'u1'},
    {kind: 'agent', text: '做好了。'},
    {kind: 'user', text: '再加个音效', id: 'u2'},
    {kind: 'agent', text: '加了。'}
];
saveConversation(idParent, {messages: parentMessages, toolCalls: []}, parentItems);
const parentTitle = loadConversationIndex().conversations[0].title;
const idFork = newConversationId();
const forkMessages = parentMessages.slice(0, 2);
const forkItems = parentItems.slice(0, 2);
check('分叉写成功', saveFork(idFork, {messages: forkMessages, toolCalls: []}, forkItems,
    {id: idParent, title: parentTitle}) === true);
const forkIndex = loadConversationIndex();
check('分叉后当前会话是新的那条', forkIndex.currentId === idFork);
check('两条都在列表里', forkIndex.conversations.length === 2, `${forkIndex.conversations.length} 条`);
const forkEntry = forkIndex.conversations.find(c => c.id === idFork);
check('分叉的标题带后缀', forkEntry.title === `${parentTitle} · 分叉`, forkEntry.title);
check('记下了来处', forkEntry.forkOf && forkEntry.forkOf.id === idParent &&
    forkEntry.forkOf.title === parentTitle, JSON.stringify(forkEntry.forkOf));
check('分叉只带走切点之前的历史', loadConversation(idFork).session.messages.length === 2 &&
    loadConversation(idFork).items.length === 2);
check('原会话完整保留', loadConversation(idParent).session.messages.length === 4);
check('没带 parent 就不建（防止误当普通保存）',
    saveFork(newConversationId(), {messages: forkMessages, toolCalls: []}, forkItems, null) === false);
// 分叉之后再存这条会话，来处不能丢（存在 existing 上带过来）
saveConversation(idFork, {messages: forkMessages, toolCalls: []}, forkItems);
check('再保存后来处还在', loadConversationIndex().conversations
    .find(c => c.id === idFork).forkOf.id === idParent);

// ---------- 对话记录导出 / 导入（.chat.xce 的数据侧） ----------
// 库里此刻有两条：idParent、idFork
const localCount = loadConversationIndex().conversations.length;
check('单条导出原样取出', exportConversation(idParent).messages.length === 4 &&
    exportConversation(idParent).items.length === 4);
check('导出不存在的返回 null', exportConversation('nope') === null);
check('整库导出条数对上', exportAllConversations().length === localCount,
    `${exportAllConversations().length} / ${localCount}`);

// 三种冲突策略各测各的：每种都先重置成一个干净的两条库（每次 id 都是新的）
let seedA = '';
let seedB = '';
let localCount2 = 0;
const resetStore = () => {
    globalThis.localStorage._map.clear();
    seedA = newConversationId();
    seedB = newConversationId();
    saveConversation(seedA, {messages: parentMessages, toolCalls: []}, parentItems);
    saveConversation(seedB, {messages: forkMessages, toolCalls: []}, forkItems);
    localCount2 = 2;
};
// 一份「从另一台机器带回来」的文件：两条撞车的（其中一条在文件里被改过）+ 一条全新的
const foreignFile = () => {
    const foreignParent = exportConversation(seedA);
    foreignParent.messages = [{role: 'user', content: '另一台机器上改过的版本'}];
    foreignParent.updatedAt = 1999999999999;
    return [
        foreignParent,
        exportConversation(seedB),
        {id: 'foreign-1', title: '文件里独有的', messages: [{role: 'user', content: 'hi'}], items: []}
    ];
};

resetStore();
const plan = planChatImport(foreignFile());
check('预检把全新的和撞车的分开了', plan.fresh === 1 && plan.conflicts.length === 2,
    JSON.stringify(plan));
check('预检会列出撞车两边的改动时间',
    plan.conflicts.some(c => c.id === seedA && c.incomingAt === 1999999999999 && c.localAt > 0));
check('坏条目在预检就被滤掉', planChatImport([null, {id: 'x'}, {id: 'y', messages: []}]).fresh === 0 &&
    planChatImport([null, {id: 'x'}, {id: 'y', messages: []}]).conflicts.length === 0);

// 本地的为准：撞车的丢掉，全新的补进来，本地一个字不动
resetStore();
const keptResult = applyChatImport(foreignFile(), 'local');
check('local：全新补进、撞车保留本地',
    keptResult.added === 1 && keptResult.kept === 2 && keptResult.updated === 0 && keptResult.copies === 0,
    JSON.stringify(keptResult));
check('local：本地内容没被碰', loadConversation(seedA).session.messages[0].content === '做个计数器');
check('local：库里多了恰好一条', loadConversationIndex().conversations.length === localCount2 + 1);

// 文件里的为准：撞车的整条换成文件的，全新的照补
resetStore();
const fileResult = applyChatImport(foreignFile(), 'file');
check('file：撞车的按文件覆盖', fileResult.added === 1 && fileResult.updated === 2,
    JSON.stringify(fileResult));
check('file：本地那条被换成了文件的版本',
    loadConversation(seedA).session.messages[0].content === '另一台机器上改过的版本');

// 两条都留：撞车的换新 id 存成另一条，原来的不动
resetStore();
const bothResult = applyChatImport(foreignFile(), 'both');
check('both：撞车的各留一份', bothResult.added === 1 && bothResult.copies === 2,
    JSON.stringify(bothResult));
check('both：本地那条还是自己', loadConversation(seedA).session.messages[0].content === '做个计数器');
check('both：文件那份在新 id 下能读到', (() => {
    // 索引是轻投影（没有 messages），先用 messageCount 圈出来再读全文
    const entry = loadConversationIndex().conversations.find(c => c.id !== seedA &&
        c.messageCount === 1);
    return entry && loadConversation(entry.id).session.messages[0].content ===
        '另一台机器上改过的版本';
})());
check('both：总条数 = 本地 + 全新 + 撞车份数',
    loadConversationIndex().conversations.length === localCount2 + 3,
    `${loadConversationIndex().conversations.length} / 期望 ${localCount2 + 3}`);

check('写不进（配额爆）时返回 null 而不是半写', (() => {
    resetStore();
    // 塞个占位大 key 把配额占死（绕过 setItem 直接到 map，不触发 quota 判断），
    // 这样无论降级丢多少条都写不进，结果一定是 null
    globalThis.localStorage._map.set('filler', 'x'.repeat(10000));
    globalThis.localStorage.failing = true;
    const result = applyChatImport(
        [{id: 'foreign-2', messages: [{role: 'user', content: 'hi'}], items: []}], 'file');
    globalThis.localStorage.failing = false;
    globalThis.localStorage._map.delete('filler');
    return result === null;
})());
check('空文件导入是个零动作', (() => {
    const result = applyChatImport([], 'both');
    return result.added === 0 && result.copies === 0;
})());

console.log(failures.length ? `\n${failures.length} 项失败` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
