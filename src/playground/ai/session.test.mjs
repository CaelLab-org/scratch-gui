// session.js 的无头自测：用户消息 id、按 id 截断（「改这一轮」与「分叉」两个切点）
// 用法：node src/playground/ai/session.test.mjs
/* eslint-disable no-console */
import {
    newUserMessageId, messagesBefore, messagesUpTo, toModelMessages, settlePendingToolCalls,
    backfillUserMessageIds
} from './session.js';

let failed = 0;
const check = (name, ok, extra = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${extra ? `  ${extra}` : ''}`);
    if (!ok) failed++;
};

// ---------------------------------------------------------------- 提问的 id
const idA = newUserMessageId();
const idB = newUserMessageId();
check('id 带 u- 前缀', idA.startsWith('u-'), idA);
check('两次生成不重复', idA !== idB);

// ---------------------------------------------------------------- 两个切点
const messages = [
    {role: 'user', content: '第一句', id: 'u1'},
    {role: 'assistant', content: '第一答'},
    {role: 'tool', toolCallId: 'c1', content: '结果'},
    {role: 'user', content: '第二句', id: 'u2'},
    {role: 'assistant', content: '第二答'}
];

// 改这一轮：连这条提问一起丢掉
const before = messagesBefore(messages, 'u2');
check('改这一轮切在提问之前', before.length === 3 && before[2].toolCallId === 'c1',
    `${before.length} 条`);
check('截断的是副本，原数组不动', messages.length === 5);
check('改第一句 → 一条不剩', messagesBefore(messages, 'u1').length === 0);

// 分叉：留到「下一句提问之前」为止，也就是这一轮干完的内容
const upTo1 = messagesUpTo(messages, 'u2');
check('分叉到第一轮为止', upTo1.length === 3, `${upTo1.length} 条`);
check('没有下一句就是全部', messagesUpTo(messages, null).length === 5);
check('分叉也是副本', messagesUpTo(messages, null) !== messages);

// 找不到 id（那段已经被压缩成摘要了）返回 null —— 上层据此拒绝改，别硬猜
check('id 不在了返回 null', messagesBefore(messages, 'u9') === null &&
    messagesUpTo(messages, 'u9') === null);

// 压缩后的数组里只剩最近两轮：最后那条提问仍在，能改
const compacted = [
    {role: 'user', content: '(自动摘要…)'},
    {role: 'user', content: '倒数第二句', id: 'u8'},
    {role: 'assistant', content: '答'},
    {role: 'user', content: '最后一句', id: 'u9'}
];
check('压缩过的历史里最后一条还能改', messagesBefore(compacted, 'u9').length === 3);

// ---------------------------------------------------------------- 内部字段不进请求
const withIds = toModelMessages({messages: [
    {role: 'user', content: '说', id: 'u1'},
    {role: 'tool', content: 'r', toolCallId: 'c1', name: 'xce_note', isError: false}
]});
check('id / name / isError 都不发给模型',
    withIds[0].id === void 0 && withIds[1].name === void 0 && withIds[1].isError === void 0 &&
    withIds[1].toolCallId === 'c1');
check('内容本身保留', withIds[0].content === '说');

// ---------------------------------------------------------------- 中断收尾
const broken = {
    messages: [
        {role: 'user', content: '干', id: 'u1'},
        {role: 'assistant', content: '', toolCalls: [{id: 'c1', name: 'xce_write_script', input: {}}]},
        {role: 'tool', toolCallId: 'c1', content: 'ok'}
    ]
};
const settled = settlePendingToolCalls(broken);
check('已经答过的工具调用不再补', settled.length === 0 && broken.messages.length === 3);
broken.messages.push({role: 'assistant', content: '', toolCalls: [{id: 'c2', name: 'xce_run_project', input: {}}]});
const settled2 = settlePendingToolCalls(broken, '中断了');
check('没答的补一条错误结果', settled2.length === 1 && settled2[0].toolCallId === 'c2' &&
    settled2[0].isError === true && settled2[0].content === '中断了');

// ---------------------------------------------------------------- 老对话补 id
// 加「改上一轮发言」之前存的对话：条目和消息都没 id，恢复时要按顺序配上同一对
const oldItems = [
    {kind: 'user', text: '第一句'},
    {kind: 'agent', text: '第一答'},
    {kind: 'user', text: '第二句'},
    {kind: 'agent', text: '第二答'}
];
const oldMessages = [
    {role: 'user', content: '第一句'},
    {role: 'assistant', content: '第一答'},
    {role: 'user', content: '第二句'},
    {role: 'assistant', content: '第二答'}
];
const filledCount = backfillUserMessageIds(oldItems, oldMessages);
check('老对话补了两条 id', filledCount === 2);
check('条目与消息共用同一个 id',
    oldItems[0].id === oldMessages[0].id && oldItems[2].id === oldMessages[2].id &&
    oldItems[0].id !== oldItems[2].id);
check('补完之后就能按 id 截断了', messagesBefore(oldMessages, oldItems[2].id).length === 2);
check('已经有 id 的不动', backfillUserMessageIds(
    [{kind: 'user', text: 'x', id: 'keep-me'}],
    [{role: 'user', content: 'x', id: 'keep-me'}]
) === 0);
// 「回退本轮变更」会往消息尾巴插一条合成提示（没有对应条目）—— 前面几对不能因此错位
const withSynthetic = [
    {role: 'user', content: '第一句'},
    {role: 'assistant', content: '答'},
    {role: 'user', content: '[The user reverted the changes…]'}
];
const itemsForSynthetic = [{kind: 'user', text: '第一句'}, {kind: 'agent', text: '答'}];
backfillUserMessageIds(itemsForSynthetic, withSynthetic);
check('合成的提示消息不会让前面的配对错位',
    itemsForSynthetic[0].id === withSynthetic[0].id && withSynthetic[2].id === void 0);

if (failed) {
    console.log(`\n❌ ${failed} 项没过`);
    process.exit(1);
}
console.log('\n✅ session 消息截断与收尾全部通过');
