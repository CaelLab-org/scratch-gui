/**
 * 对话 items 的分轮与「工作段」整理。
 *
 * 学 ZCode 的「已工作 Nm Ns」：一轮里，AI 干活的痕迹（思考、工具行、带工具调用的旁白）
 * 收进一条可展开的标题行，最后的收尾答复留在标题外面 —— 面板只有 310px 宽，
 * 干活的过程不该把答复顶出屏幕。
 *
 * 边界和耗时都由界面自己算，不需要模型输出任何标记：
 *   边界 = 两条用户消息之间；耗时 = 这一轮首尾 item 的时间差。
 */

// 时长写法：`1m 42s` / `42s`（秒向最近取整、至少 1 秒）。
// 学 ZCode 的 `workDurationParts`：只写非零的单位、最多两段，所以 1 小时以上不写秒。
export const formatWorkDuration = ms => {
    if (typeof ms !== 'number' || !isFinite(ms)) return '';
    const total = Math.max(1, Math.round(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
    if (minutes) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
    return `${seconds}s`;
};

// 「干活」还是「答复」：工具行、以及**带工具调用**的那一步（它的正文是旁白，不是答复）。
// 流式中的那一步还没拿到 toolCalls，先按答复放在外面 —— 等确定了再收进去。
// 宁可「内容被收走」，不要「内容先被藏起来又冒出来」：后者发生在用户正读的时候。
const isWorkItem = item => item.kind === 'tool' || (item.kind === 'agent' && !!item.hasTools);

/**
 * 把一个工具留下的 undo 句柄读成规范化动作：
 *   {kind: 'add', sprite, topBlockIds, added}   这次往某个角色里写了几块
 *   {kind: 'del', sprite, topBlockId, blocks, removed}  这次删掉了某个角色的哪段
 * 旧对话里 undo 是裸的顶块 id 数组（那时只能撤销写入）—— 补成 add，只是数不出块数（added 为 null）。
 * @param {object} item 一条条目（工具行）
 * @returns {object|null} 没有句柄（没改过积木的工具）就返回 null
 */
export const undoActionOf = item => {
    const undo = item && item.undo;
    if (!undo) return null;
    if (Array.isArray(undo)) return {kind: 'add', sprite: item.sprite, topBlockIds: undo, added: null};
    return undo;
};

/**
 * 一轮的变更汇总：按角色把「加了几块 / 删了几块积木、多了几个角色 / 造型」加起来，
 * 给界面上的「本轮变更」那一行用。
 *
 * 只统计**还留着手柄**的动作：单张卡撤销过的、整轮回退过的（undo 已清空）都不该再算进去，
 * 所以这一行会跟着撤销实时缩水，而不是永远记着「这轮本来改了多少」。
 * 数不出块数的（旧数据）整条丢掉 —— 宁可这一行不出现，也不显示一个骗人的 +0。
 * @param {Array} items 本轮的条目（含工具行）
 * @returns {Array<{sprite, added, removed, sprites, costumes}>} 按角色一条，什么都没改的不出现
 */
export const summarizeChanges = items => {
    const bySprite = new Map();
    for (const action of items.map(undoActionOf)) {
        if (!action || !action.sprite) continue;
        const entry = bySprite.get(action.sprite) ||
            {sprite: action.sprite, added: 0, removed: 0, sprites: 0, costumes: 0, known: true};
        if (action.kind === 'sprite') {
            // 新建角色：这条手柄的数就是「多了一个角色」，名字就是新角色的名字
            entry.sprites += 1;
        } else if (action.kind === 'costume') {
            entry.costumes += 1;
        } else if (action.kind === 'del') {
            if (typeof action.removed === 'number') entry.removed += action.removed;
            else entry.known = false;
        } else if (typeof action.added === 'number') {
            entry.added += action.added;
        } else {
            entry.known = false;
        }
        bySprite.set(action.sprite, entry);
    }
    return [...bySprite.values()]
        .filter(entry => entry.known &&
            (entry.added || entry.removed || entry.sprites || entry.costumes))
        .map(({sprite, added, removed, sprites, costumes}) => ({sprite, added, removed, sprites, costumes}));
};

/**
 * @param {Array} items  面板的 items 数组（见 store.js）
 * @param {object} opts
 *   now     当前时间戳；只在 active 时用来给「工作中 Ns」计时
 *   active  最后一轮是否还在跑
 * @returns {Array<{key, user, segments, startedAt, endedAt, durationMs, running, hasAnswer, changes}>}
 *   segments 是**保序**的 `{type: 'work' | 'final', items: []}` 段：
 *   work 段渲染成折叠标题行，final 段原样铺开。
 *   changes 是这一轮的积木变更汇总（见 summarizeChanges），没改动就是空数组。
 */
export const buildTurns = (items, {now = 0, active = false} = {}) => {
    const turns = [];
    let turn = null;
    const start = () => {
        turn = {
            key: turns.length,
            user: null,
            segments: [],
            startedAt: null,
            endedAt: null,
            durationMs: null,
            running: false
        };
        turns.push(turn);
    };

    for (const item of items) {
        if (item.kind === 'user') {
            start();
            turn.user = item;
            if (typeof item.at === 'number') turn.startedAt = item.at;
            continue;
        }
        // 旧数据（v1 迁过来的）开头可能没有用户消息，也得有个地方装
        if (!turn) start();
        const type = isWorkItem(item) ? 'work' : 'final';
        const tail = turn.segments[turn.segments.length - 1];
        if (tail && tail.type === type) tail.items.push(item);
        else turn.segments.push({type, items: [item]});
        if (typeof item.at === 'number') turn.endedAt = item.at;
    }

    for (const entry of turns) {
        if (entry.startedAt && entry.endedAt) {
            entry.durationMs = Math.max(entry.endedAt - entry.startedAt, 0);
        }
        // 有收尾答复 = 这轮真的说完了，标题行该安静下来（收起）
        entry.hasAnswer = entry.segments.some(segment =>
            segment.type === 'final' && segment.items.some(it => it.kind === 'agent' && it.text));
        entry.changes = summarizeChanges(entry.segments.reduce((all, segment) => all.concat(segment.items), []));
    }

    // 正在跑的那一轮：耗时跟着当前时间走，否则「工作中」会停在上一轮的数字上
    const last = turns[turns.length - 1];
    if (last && active) {
        last.running = true;
        last.durationMs = last.startedAt ? Math.max(now - last.startedAt, 0) : null;
    }
    return turns;
};
