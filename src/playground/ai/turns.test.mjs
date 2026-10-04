// turns.js 的无头自测：分轮、工作段切分、时长写法、本轮变更汇总
// 用法：node src/playground/ai/turns.test.mjs
/* eslint-disable no-console */
import {
    buildTurns, formatWorkDuration, summarizeChanges, summarizeTurnUsage,
    undoActionOf, itemsBeforeTurn, itemsUpToTurn
} from './turns.js';

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

// ---------------------------------------------------------------- 本轮变更汇总
const changeItems = [
    {
        kind: 'tool',
        id: 'w1',
        name: 'xce_write_script',
        sprite: '角色1',
        undo: {kind: 'add', sprite: '角色1', topBlockIds: ['a'], added: 12}
    },
    {
        kind: 'tool',
        id: 'w2',
        name: 'xce_write_script',
        sprite: '角色1',
        undo: {kind: 'add', sprite: '角色1', topBlockIds: ['b'], added: 3}
    },
    {
        kind: 'tool',
        id: 'd1',
        name: 'xce_delete_script',
        sprite: '角色2',
        undo: {kind: 'del', sprite: '角色2', topBlockId: 'x', blocks: {}, removed: 4}
    },
    {kind: 'tool', id: 'r1', name: 'xce_read_project', status: 'done'},
    {kind: 'agent', text: '好了。'}
];
const summary = summarizeChanges(changeItems);
check('按角色合并同一角色的多次写入', summary.length === 2, `${summary.length} 条`);
check('角色1 合计 +15', summary[0].sprite === '角色1' && summary[0].added === 15 &&
    summary[0].removed === 0, JSON.stringify(summary[0]));
check('角色2 记删 4 块', summary[1].sprite === '角色2' && summary[1].removed === 4 &&
    summary[1].added === 0, JSON.stringify(summary[1]));
check('没改积木的轮次没有变更行', summarizeChanges([
    {kind: 'tool', id: 'r2', name: 'xce_read_project', status: 'done'}
]).length === 0);

// 替换脚本 = 同一段上「删旧 + 写新」，两边数字都进「本轮变更」
const editSummary = summarizeChanges([
    {
        kind: 'tool',
        id: 'e1',
        name: 'xce_edit_script',
        sprite: '角色3',
        undo: {kind: 'edit', sprite: '角色3', blocks: {}, topBlockIds: ['n'], added: 3, removed: 2}
    }
]);
check('替换脚本记 +3 / -2', editSummary.length === 1 && editSummary[0].sprite === '角色3' &&
    editSummary[0].added === 3 && editSummary[0].removed === 2, JSON.stringify(editSummary[0]));

// 新建角色 / 加造型也要进「本轮变更」那一行（它们同样是这轮对项目的改动）
const drawingSummary = summarizeChanges([
    {kind: 'tool', id: 's1', name: 'xce_add_sprite', sprite: 'Ball', undo: {kind: 'sprite', sprite: 'Ball'}},
    {kind: 'tool', id: 'c1', name: 'xce_add_costume', sprite: 'Ball', undo: {kind: 'costume', sprite: 'Ball', index: 1}},
    {
        kind: 'tool',
        id: 'w7',
        name: 'xce_write_script',
        sprite: 'Ball',
        undo: {kind: 'add', sprite: 'Ball', topBlockIds: ['a'], added: 6}
    }
]);
check('新建角色 + 加造型 + 写积木合并到一条（同一个角色）',
    drawingSummary.length === 1 && drawingSummary[0].sprite === 'Ball' &&
    drawingSummary[0].sprites === 1 && drawingSummary[0].costumes === 1 && drawingSummary[0].added === 6,
    JSON.stringify(drawingSummary[0]));
check('只新建角色、没写积木的轮次也有变更行（0 块不算没改）',
    summarizeChanges([
        {kind: 'tool', id: 's2', name: 'xce_add_sprite', sprite: 'Ball', undo: {kind: 'sprite', sprite: 'Ball'}}
    ]).length === 1);

// 单张卡撤销过（undo 被清空）的，不该再算进本轮
check('撤销过的卡不计入', summarizeChanges([
    {
        kind: 'tool',
        id: 'w3',
        name: 'xce_write_script',
        sprite: '角色1',
        undo: {kind: 'add', sprite: '角色1', topBlockIds: ['a'], added: 12}
    },
    {kind: 'tool', id: 'w4', name: 'xce_write_script', sprite: '角色1', undo: null}
]).length === 1);

// 旧对话：undo 是裸的顶块 id 数组，数不出块数 —— 宁可这行不出现，也不显示骗人的 +0
check('旧数据读成写入动作', undoActionOf({sprite: '角色1', undo: ['a', 'b']}).kind === 'add');
check('旧数据数不出块数就不汇总', summarizeChanges([
    {kind: 'tool', id: 'w5', name: 'xce_write_script', sprite: '角色1', undo: ['a']}
]).length === 0);

// 挂在轮上：第二轮只有写入，第一轮的改动不会串到第二轮
const grouped = buildTurns([
    {kind: 'user', text: '先写', at: T0},
    {
        kind: 'tool',
        id: 'w6',
        name: 'xce_write_script',
        sprite: '角色1',
        at: T0 + 100,
        undo: {kind: 'add', sprite: '角色1', topBlockIds: ['a'], added: 5}
    },
    {kind: 'agent', text: '写好了。', at: T0 + 200},
    {kind: 'user', text: '读一下', at: T0 + 300},
    {kind: 'tool', id: 'r3', name: 'xce_read_project', status: 'done', at: T0 + 400}
]);
check('变更挂在自己的轮上', grouped[0].changes.length === 1 && grouped[0].changes[0].added === 5 &&
    grouped[1].changes.length === 0, `${grouped[0].changes.length}/${grouped[1].changes.length}`);

// ---------------------------------------------------------------- 改这一轮 / 分叉的切点
check('每轮记下自己在 items 里的区间',
    turns[0].userIndex === 0 && turns[0].endIndex === 6 &&
    turns[1].userIndex === 6 && turns[1].endIndex === 8,
    `${turns[0].userIndex}-${turns[0].endIndex} / ${turns[1].userIndex}-${turns[1].endIndex}`);

// 改这一轮：这一轮的提问**连同**它后面的回复一起丢掉（AI 的回复、工具行都跟着走）
check('改第一轮 → 一条不剩', itemsBeforeTurn(items, turns[0]).length === 0);
check('改第二轮 → 只剩第一轮那 6 条', itemsBeforeTurn(items, turns[1]).length === 6);

// 分叉：保留这一轮**干完为止**的内容，下一轮提问之后不要
check('从第一轮分叉 → 留 6 条', itemsUpToTurn(items, turns[0]).length === 6);
check('从第二轮分叉 → 全部留下', itemsUpToTurn(items, turns[1]).length === items.length);
check('切点算出来的内容是对的',
    itemsUpToTurn(items, turns[0])[5].text === '搞定了，变量 x 已就位。');

// 刚发出提问、模型一个字还没回：这一轮就是那一条提问，两种切法都不该越界
const justAsked = buildTurns([{kind: 'user', text: '在吗', at: T0, id: 'u1'}], {now: T0, active: true});
check('问答都还没开始的轮也能算区间',
    justAsked[0].userIndex === 0 && justAsked[0].endIndex === 1 &&
    itemsBeforeTurn([{kind: 'user', text: '在吗', id: 'u1'}], justAsked[0]).length === 0);
// 旧数据开头没有用户消息：第一轮 userIndex 是 null，切点要落在这轮结束处
const legacyItems = [{kind: 'agent', text: '老对话'}, {kind: 'user', text: '新问题', id: 'u2'}];
const legacyTurn = buildTurns(legacyItems);
check('旧数据那轮也能切', legacyTurn[0].userIndex === null && legacyTurn[0].endIndex === 1 &&
    itemsUpToTurn(legacyItems, legacyTurn[0]).length === 1);

// 注释也是这一轮的改动（xce_note 的 undo 句柄）
const noteSummary = summarizeChanges([
    {
        kind: 'tool',
        id: 'n1',
        name: 'xce_note',
        sprite: '角色1',
        undo: {kind: 'note', sprite: '角色1', commentId: 'note-1'}
    }
]);
check('写注释进变更行', noteSummary.length === 1 && noteSummary[0].notes === 1,
    JSON.stringify(noteSummary[0]));

// ---------------------------------------------------------------- 回合用量汇总
check('没有 usage 的条目汇总成 null',
    summarizeTurnUsage([{kind: 'agent', text: 'x'}, {kind: 'user', text: 'y'}]) === null);
const usageTurns = buildTurns([
    {kind: 'user', text: '干活', at: T0, id: 'u9'},
    // 中间的工具调用步 + 收尾答复：两个请求的 usage 都要加起来
    {
        kind: 'agent',
        text: '',
        hasTools: true,
        at: T0 + 1000,
        usage: {promptTokens: 1000, completionTokens: 50, cachedTokens: 800, durationMs: 1200}
    },
    {kind: 'tool', id: 't9', name: 'xce_list_sprites', status: 'done', at: T0 + 1100},
    {
        kind: 'agent',
        text: '好了',
        at: T0 + 2000,
        usage: {promptTokens: 1400, completionTokens: 106, cachedTokens: 900, durationMs: 800}
    }
]);
const usage1 = usageTurns[0].usage;
check('一轮的 usage 跨请求累加',
    usage1.requests === 2 && usage1.prompt === 2400 && usage1.completion === 156 &&
    usage1.cached === 1700 && usage1.durationMs === 2000 && usage1.cachedKnown === true,
    JSON.stringify(usage1));
const unknownCached = summarizeTurnUsage([
    {
        kind: 'agent',
        text: 'x',
        usage: {promptTokens: 500, completionTokens: 10, cachedTokens: null, durationMs: 100}
    }
]);
check('缓存字段没报就按「未知」处理，别当 0 算命中率',
    unknownCached.prompt === 500 && unknownCached.cached === 0 && unknownCached.cachedKnown === false,
    JSON.stringify(unknownCached));

if (failed) {
    console.log(`\n❌ ${failed} 项没过`);
    process.exit(1);
}
console.log('\n✅ turns 分轮与工作段全部通过');
