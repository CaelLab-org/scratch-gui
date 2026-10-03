// turns.js 的无头自测：分轮、工作段切分、时长写法
// 用法：node src/playground/ai/turns.test.mjs
/* eslint-disable no-console */
import {buildTurns, formatWorkDuration} from './turns.js';

let failed = 0;
const check = (name, ok, extra = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${extra ? `  ${extra}` : ''}`);
    if (!ok) failed++;
};

// ---------------------------------------------------------------- 时长写法
check('按秒', formatWorkDuration(4200) === '4s', formatWorkDuration(4200));
check('分 + 秒', formatWorkDuration(102000) === '1m 42s', formatWorkDuration(102000));
check('整分不写秒', formatWorkDuration(120000) === '2m', formatWorkDuration(120000));
check('小时只写两段', formatWorkDuration(3900000) === '1h 5m', formatWorkDuration(3900000));
check('不足 1 秒也算 1 秒', formatWorkDuration(120) === '1s', formatWorkDuration(120));
check('没时间就空着', formatWorkDuration(null) === '' && formatWorkDuration() === '');

// ---------------------------------------------------------------- 分轮与分段
const T0 = 1_700_000_000_000;
const items = [
    {kind: 'user', text: '做个计数器', at: T0},
    {kind: 'agent', reasoning: '先看看有哪些角色', text: '我先看一下项目。', hasTools: true, at: T0 + 1000},
    {kind: 'tool', id: 'a', name: 'xce_list_sprites', status: 'done', at: T0 + 1200},
    {kind: 'agent', text: '现在写积木。', hasTools: true, at: T0 + 3000},
    {kind: 'tool', id: 'b', name: 'xce_write_script', status: 'done', at: T0 + 3500},
    {kind: 'agent', text: '搞定了，变量 x 已就位。', at: T0 + 9000},
    {kind: 'user', text: '再改一下', at: T0 + 60000},
    {kind: 'agent', text: '改好了。', at: T0 + 61000}
];

const turns = buildTurns(items, {now: T0 + 999999, active: false});
check('切成两轮', turns.length === 2, `共 ${turns.length} 轮`);
check('第一轮挂到自己的用户消息', turns[0].user.text === '做个计数器');

const first = turns[0];
check('第一轮分成 [工作, 答复]', first.segments.length === 2 &&
    first.segments[0].type === 'work' && first.segments[1].type === 'final',
`${first.segments.map(s => s.type).join(',')}`);
check('工作段收了 4 条（旁白+工具+旁白+工具）', first.segments[0].items.length === 4,
    `${first.segments[0].items.length} 条`);
check('答复段只有收尾那一条', first.segments[1].items.length === 1 &&
    first.segments[1].items[0].text === '搞定了，变量 x 已就位。');
check('耗时 = 首尾时间差', first.durationMs === 9000, `${first.durationMs}ms`);
check('算得出「有答复」', first.hasAnswer === true);
check('不跑的那轮不算 running', first.running === false);

check('第二轮耗时', turns[1].durationMs === 1000, `${turns[1].durationMs}ms`);

// 流式中的那一步还没确定有没有工具调用 —— 先当答复放在外面，不能被收进去
const streaming = buildTurns([
    {kind: 'user', text: '在吗', at: T0},
    {kind: 'agent', text: '正在想', streaming: true, at: T0 + 500}
], {now: T0 + 3000, active: true});
check('流式中的一步不算工作', streaming[0].segments[0].type === 'final');
check('运行中按时钟计时', streaming[0].running === true && streaming[0].durationMs === 3000,
    `${streaming[0].durationMs}ms`);
// 展开与否的判据是 running || !hasAnswer —— 跑的时候就展开（要看得见在干嘛），
// 所以 running 时 hasAnswer 是什么都不影响观感
check('运行中仍算得出有答复', streaming[0].hasAnswer === true);

// 干完活却没总结（模型没吐答复）：工作行得露在外面，不能整轮藏起来
const noAnswer = buildTurns([
    {kind: 'user', text: '干', at: T0},
    {kind: 'agent', text: '写一个', hasTools: true, at: T0 + 100},
    {kind: 'tool', id: 'c', name: 'xce_write_script', status: 'done', at: T0 + 200}
]);
check('没答复时不标 hasAnswer', noAnswer[0].hasAnswer === false);

// 系统提示插在工作行前面时，顺序不能被拆散（分段是保序的）
const mixed = buildTurns([
    {kind: 'user', text: '来', at: T0},
    {kind: 'notice', text: '上下文偏长，已清理较早的工具返回。'},
    {kind: 'agent', text: '写一下', hasTools: true, at: T0 + 100},
    {kind: 'tool', id: 'd', name: 'xce_write_script', status: 'done', at: T0 + 200},
    {kind: 'agent', text: '好了。', at: T0 + 900}
]);
check('提示行留在最前', mixed[0].segments.map(s => s.type).join(',') === 'final,work,final',
    mixed[0].segments.map(s => s.type).join(','));

// 旧数据：没有 at（v1 迁过来的），不该崩、也不该编一个耗时出来
const legacy = buildTurns([
    {kind: 'user', text: '老对话'},
    {kind: 'agent', text: '老答复'}
]);
check('旧数据不崩且没有耗时', legacy.length === 1 && legacy[0].durationMs === null &&
    legacy[0].hasAnswer === true);

check('空数组', buildTurns([]).length === 0);

if (failed) {
    console.log(`\n❌ ${failed} 项没过`);
    process.exit(1);
}
console.log('\n✅ turns 分轮与工作段全部通过');
