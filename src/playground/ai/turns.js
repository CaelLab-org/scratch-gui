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
 * @param {Array} items  面板的 items 数组（见 store.js）
 * @param {object} opts
 *   now     当前时间戳；只在 active 时用来给「工作中 Ns」计时
 *   active  最后一轮是否还在跑
 * @returns {Array<{key, user, segments, startedAt, endedAt, durationMs, running, hasAnswer}>}
 *   segments 是**保序**的 `{type: 'work' | 'final', items: []}` 段：
 *   work 段渲染成折叠标题行，final 段原样铺开。
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
    }

    // 正在跑的那一轮：耗时跟着当前时间走，否则「工作中」会停在上一轮的数字上
    const last = turns[turns.length - 1];
    if (last && active) {
        last.running = true;
        last.durationMs = last.startedAt ? Math.max(now - last.startedAt, 0) : null;
    }
    return turns;
};
