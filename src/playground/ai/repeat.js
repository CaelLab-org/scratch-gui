/**
 * 流式输出里的「卡带」检测。
 *
 * 模型偶尔会陷进死循环：同一段内容在很短的距离里翻来覆去地吐（思考里最常见），
 * 一直吐到把单次输出额度烧光 —— 用户看到的就是「卡住不动 / 刷一屏废话」。
 *
 * 只认**完全相同的连续重复**，判据一律偏保守：把一段正常回答拦腰砍断，比漏放一次打转糟得多。
 * 判据：尾巴上的一段文本（块，block 字符）连着出现 N 次，且重复总量 ≥ minChars。
 *   遍数 N 随块长收缩 —— 小块（4 字符）要 50 遍，大块（≥ 67 字符的整段）只要 3 遍，
 *   也就是「重复总量至少 200 字符」，正对「短段落里疯狂输出同一段话」这个症状。
 * 不认的：纯空白块（缩进、连着的空行）—— 排版里的空行不是打转。
 *
 * 周期性有个好性质：周期 p 的循环同时也是周期 2p、3p… 的循环，所以不必逐个周期去猜，
 * 在 [minBlock, maxBlock] 里取到某一个倍数就能命中。
 */

// 默认判据。测试与调用方可以逐个覆盖。
export const REPEAT_RULES = {
    minBlock: 4, // 比这更短的块（单个字符反复之类）不查：正常文本里太多
    maxBlock: 600, // 段落级打转：整段原样重来
    minChars: 200, // 重复总量（块长 × 遍数）低于这个数不算
    minRepeats: 3, // 大块至少 3 遍
    maxRepeats: 60 // 小块数到 60 遍就够判定了，别再往上数
};

// 单次检测允许的比较量（字符）。防的是「全篇同一个字符」这种病态输入：
// 那时每个块长都能匹配，不设上限会白烧 CPU。撞到上限就放弃这一拍，下一拍再来。
const COMPARE_BUDGET = 200000;

/**
 * 在一块文本里找「末尾那一段在重复」。
 *
 * @param {string} tail 待查的文本（调用方只喂末尾一窗口就够）
 * @param {object} rules 见 REPEAT_RULES
 * @returns {?object} {block, repeats, start}；start 是重复第一次出现的位置（0 基），
 *   调用方据此知道「干净的前缀」有多长。没找到就是 null。
 */
export const findRepeat = (tail, rules = {}) => {
    const {minBlock, maxBlock, minChars, minRepeats, maxRepeats} = {...REPEAT_RULES, ...rules};
    const n = typeof tail === 'string' ? tail.length : 0;
    // 块太长的话，连 minRepeats 遍都放不下，没必要再往上试
    const ceiling = Math.min(maxBlock, Math.floor(n / minRepeats));
    let budget = COMPARE_BUDGET;

    for (let block = minBlock; block <= ceiling; block++) {
        // 需要的遍数：重复总量够 minChars，且不少于 minRepeats、不多于 maxRepeats
        const need = Math.max(minRepeats, Math.min(maxRepeats, Math.ceil(minChars / block)));
        if (block * need > n) continue;
        const last = tail.slice(n - block);
        // 纯空白的块（换行、缩进、空格）不算卡带
        if (!/\S/.test(last)) continue;
        let repeats = 1;
        let i = n - (block * 2);
        while (i >= 0 && repeats < maxRepeats && budget > 0) {
            budget -= block;
            if (tail.slice(i, i + block) !== last) break;
            repeats++;
            i -= block;
        }
        if (budget <= 0) return null;
        if (repeats >= need) return {block, repeats, start: i + block};
    }
    return null;
};

/**
 * 流式检测器：把增量一块块喂进来，命中一次就记下来（不再变）。
 *
 * @param {object} opts
 *   rules          判据，见 REPEAT_RULES
 *   windowChars    只看末尾这么多字符（重复一定发生在尾巴上，没必要留全文）
 *   checkEvery     每攒够这么多字符才查一次（每次检测是 O(窗口)，别每片都跑）
 *   minStreamChars 整段流太短就不查：短文里的复述是正常修辞
 * @returns {object} {push, hit}
 *   push 返回命中的那条 {block, repeats, chars, at}，没命中（或已经命中过）返回 null。
 *   at 是「重复从第几个字符开始」，调用方可以用它把这段瞎话从历史里切掉。
 */
export const createRepeatDetector = ({
    windowChars = 8192,
    checkEvery = 64,
    minStreamChars = 400,
    ...rules
} = {}) => {
    let text = '';
    let seen = 0; // 一共流过多少字符（决定要不要开始查）
    let sinceCheck = 0; // 上次检测之后又流进来多少
    let hit = null;

    const push = delta => {
        // 命中之后不再上报（hit 里留着那条）：界面只该提示一次，别每片都当新发现
        if (hit) return null;
        if (typeof delta !== 'string' || !delta) return null;
        text += delta;
        seen += delta.length;
        sinceCheck += delta.length;
        if (text.length > windowChars) text = text.slice(-windowChars);
        if (seen < minStreamChars || sinceCheck < checkEvery) return null;
        sinceCheck = 0;
        const found = findRepeat(text, rules);
        if (!found) return null;
        hit = {
            block: found.block,
            repeats: found.repeats,
            chars: found.block * found.repeats,
            at: seen - text.length + found.start
        };
        return hit;
    };

    return {
        push,
        get hit () {
            return hit;
        }
    };
};
