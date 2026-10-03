// compact.js 的无头自测：计量 / 分段 / 轻量压缩 / 整段总结 / 熔断
// 用法：node src/playground/ai/compact.test.mjs
/* eslint-disable no-console */
import {
    estimateTokens, groupByTurns, measure, microcompact, compactSession, maybeCompact,
    compactThreshold, MAX_CONSECUTIVE_FAILURES, CLEARED
} from './compact.js';

const failures = [];
const check = (label, condition, detail) => {
    console.log(`${condition ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`);
    if (!condition) failures.push(label);
};

// ---------- 计量 ----------
check('中文按字算：10 个汉字约 10 token', estimateTokens('一二三四五六七八九十') === 10,
    String(estimateTokens('一二三四五六七八九十')));
check('英文按 4 字符 1 token', estimateTokens('abcdefgh') === 2, String(estimateTokens('abcdefgh')));
check('空串是 0', estimateTokens('') === 0 && estimateTokens(null) === 0);

// ---------- 分段 ----------
const messages = [
    {role: 'user', content: 'u1'},
    {role: 'assistant', content: 'a1'},
    {role: 'tool', content: 't1'},
    {role: 'user', content: 'u2'},
    {role: 'assistant', content: 'a2'}
];
const groups = groupByTurns(messages);
check('按用户消息开新一轮', groups.length === 2 &&
    groups[0].length === 3 && groups[1].length === 2,
    groups.map(g => g.length).join('/'));
check('每轮都不以孤儿 tool 开头', groups.every(g => g[0].role !== 'tool'));

// ---------- 阈值 ----------
const window = 128000;
const threshold = compactThreshold(window);
check('阈值 = 有效窗口 − 缓冲', threshold === window - 21000 - 13000, String(threshold));
check('没到阈值不用压', measure({messages: [{role: 'user', content: '短'}], contextWindow: window}).needed === false);
const bigText = 'x'.repeat(threshold * 4 + 100);
check('超过阈值要压', measure({messages: [{role: 'user', content: bigText}], contextWindow: window}).needed === true);
check('有真实用量时以真实值为准',
    measure({messages: [{role: 'user', content: '短'}], contextWindow: window, lastPromptTokens: threshold + 1}).needed === true);

// ---------- 轻量压缩 ----------
const manyTurns = [];
for (let i = 0; i < 10; i++) {
    manyTurns.push({role: 'assistant', content: `a${i}`});
    manyTurns.push({role: 'tool', content: `工具返回内容 ${i}`});
    manyTurns.push({role: 'user', content: `u${i}`});
}
const sessionA = {messages: JSON.parse(JSON.stringify(manyTurns))};
const keepRecent = 3;
// 期望值按实际分组算：保留最近 keepRecent 轮里那些工具返回
const allGroups = groupByTurns(manyTurns);
const expectIntact = allGroups.slice(-keepRecent).flat().filter(m => m.role === 'tool').length;
const totalTools = sessionA.messages.filter(m => m.role === 'tool').length;
const cleared = microcompact(sessionA, {keepRecent});
const leftIntact = sessionA.messages.filter(m => m.role === 'tool' && m.content !== CLEARED).length;
check('轻量压缩只清旧的工具返回', cleared === totalTools - expectIntact,
    `共 ${totalTools} 条，清了 ${cleared} 条，剩 ${leftIntact} 条`);
check('留下的就是最近 keepRecent 轮里的', leftIntact === expectIntact,
    `实际 ${leftIntact} 期望 ${expectIntact}`);
check('清掉的内容换成占位符',
    sessionA.messages.filter(m => m.role === 'tool' && m.content === CLEARED).length === cleared);

// ---------- 整段总结 ----------
const fakeSummary = '这是摘要：用户在做一个计数器，变量名是 count，还差暂停功能没做。';
let summaryCalls = 0;
const fakeModel = {
    name: 'fake',
    complete: async (sentMessages, tools) => {
        summaryCalls++;
        // 总结请求必须是一次性的 user 消息、且不带工具
        if (sentMessages.length !== 1 || sentMessages[0].role !== 'user') throw new Error('总结请求形状不对');
        if (tools && tools.length) throw new Error('总结不该带工具');
        return {text: `<analysis>这里是分析，回收时应该被剥掉</analysis>\n<summary>${fakeSummary}</summary>`, toolCalls: []};
    }
};

const sessionB = {messages: JSON.parse(JSON.stringify(manyTurns))};
const keepB = 2;
const expectRecent = groupByTurns(manyTurns).slice(-keepB).flat().length;
const result = await compactSession({session: sessionB, model: fakeModel, keepRecent: keepB});
check('整段总结成功', result.compacted === true && summaryCalls === 1);
check('摘要消息在第一句且剥掉了 analysis',
    sessionB.messages[0].role === 'user' &&
    sessionB.messages[0].content.includes(fakeSummary) &&
    !sessionB.messages[0].content.includes('这里是分析'),
    JSON.stringify(sessionB.messages[0].content.slice(0, 60)));
check('最近 2 轮原文原样保留', sessionB.messages.length === 1 + expectRecent,
    `剩 ${sessionB.messages.length} 条，期望 ${1 + expectRecent}`);
check('保留下来的尾部不以 tool 开头', sessionB.messages[1].role !== 'tool', sessionB.messages[1].role);
check('总结计数 +1', sessionB.compactCount === 1);

// ---------- 熔断 ----------
const sessionC = {messages: JSON.parse(JSON.stringify(manyTurns)), consecutiveFailures: MAX_CONSECUTIVE_FAILURES};
const brokenModel = {name: 'broken', complete: async () => ({text: '没有 summary 标签', toolCalls: []})};
const outcome = await maybeCompact({
    session: {...sessionC, messages: [{role: 'user', content: bigText}]},
    model: brokenModel,
    contextWindow: window
});
check('连续失败到上限后熔断',
    outcome.compacted === false && outcome.reason === '连续压缩失败，已熔断',
    JSON.stringify(outcome.reason));

console.log(`\n${failures.length ? `❌ ${failures.length} 项未通过：${failures.join('、')}` : '✅ 全部通过'}`);
process.exit(failures.length ? 1 : 0);
