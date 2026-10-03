/**
 * 积木与文本的双向转换。
 *
 * 文本用的是 scratchblocks 语法（Scratch 社区通用：论坛、Wiki、Code Club 教材都用它），
 * 所以模型不需要学一套我们自创的 DSL。
 *
 * 正向 text -> blocks 的难点是「槽位名与类型」：
 *   槽位类型来自 scratchblocks 的积木定义（%n 数字 / %s 字符串 / %b 布尔 / %m.var 变量菜单 ...），
 *   槽位名来自 scratch-blocks 的积木定义（自动抽成 tables/blocks-meta.json），
 *   两者按出现顺序一一对应。
 */
import {parse as parseScratchblocks} from 'scratchblocks/syntax/index.js';
import * as psb from 'parse-sb3-blocks';
import meta from './tables/blocks-meta.js';

const {idToOpcode, spec, shadows, menuValues, menuShadowByArg} = meta;

// 上游 parse-sb3-blocks 的 bug：这几个条目 noTranslation、缺 defaultMessage，
// 渲染器第一行就 `s.defaultMessage.includes(...)`，遇到就崩。
// 补上模板即可（同一个对象引用，改这里内部也生效）。
for (const [opcode, template] of Object.entries(meta.messagePatches)) {
    if (psb.allBlocks[opcode] && !psb.allBlocks[opcode].defaultMessage) {
        psb.allBlocks[opcode].defaultMessage = template;
    }
}

const PLACEHOLDER = /^%[a-zA-Z0-9]/;

// scratchblocks 里「纯 Label 组成的报告块」的名字（变量/列表读就是这种形态）
const blockName = block => {
    const words = [];
    for (const child of block.children || []) {
        if (!child.isLabel) return void 0;
        words.push(child.value);
    }
    return words.length ? words.join(' ') : void 0;
};

const resolveMenuValue = display => (display in menuValues ? menuValues[display] : display);

// ---------------------------------------------------------------------------
// 正向：文本 -> sb3 blocks
// ---------------------------------------------------------------------------

/**
 * 文本 -> sb3 形态的积木
 * @param {string} text scratchblocks 文本
 * @param {object} ctx  {variables: {name: id}, lists: {name: id}} —— 传项目已有的，保证 id 对得上
 * @returns {{blocks: object, topLevelIds: string[], variables: object, lists: object, warnings: string[]}} 转换结果与警告
 */
export const textToBlocks = (text, ctx = {}) => {
    const variables = {...(ctx.variables || {})};
    const lists = {...(ctx.lists || {})};
    const blocks = {};
    const topLevelIds = [];
    const warnings = [];
    let counter = 0;
    // 块 id 必须**跨调用唯一**。曾经是每次转换从 c0 重新开始编，于是第二次 write_script
    // 生成的 c0/c1... 跟第一次撞车，后写的块把先写的**整段覆盖**掉 ——
    // 表现就是「工具回写入成功，但读回来只有一段，后面写的都不见了」（用户实际踩到过）。
    // 加一段每次调用随机的短 tag：既避开同一次会话内的重复，也避开将来加载回旧项目时的碰撞。
    const idTag = Math.random().toString(36)
        .slice(2, 6);
    const newId = (prefix = 'c') => `${prefix}${idTag}${(counter++).toString(36)}`;

    const varId = name => {
        if (!(name in variables)) variables[name] = `v${Object.keys(variables).length + 1}`;
        return variables[name];
    };
    const listId = name => {
        if (!(name in lists)) lists[name] = `l${Object.keys(lists).length + 1}`;
        return lists[name];
    };

    const emitVarReporter = (name, parentId) => {
        const isList = name in lists;
        const id = newId();
        blocks[id] = {
            opcode: isList ? 'data_listcontents' : 'data_variable',
            next: null,
            parent: parentId,
            inputs: {},
            fields: isList ? {LIST: [name, listId(name)]} : {VARIABLE: [name, varId(name)]},
            shadow: false,
            topLevel: false
        };
        return id;
    };

    const opcodeOf = block => {
        const selector = block.info && block.info.selector;
        if (selector === 'readVariable') return 'data_variable';
        if (selector === 'contentsOfList:') return 'data_listcontents';
        // 自定义积木（define / call / 参数读取）需要 mutation，暂不支持
        if (selector === 'procDef' || selector === 'call' || selector === 'getParam') return null;
        return idToOpcode[block.info.id] || null;
    };

    // 影子积木**按槽位名**取：表里是 {槽位名: 影子类型}。
    // 曾经按出现顺序取第一个，于是 looks_changeeffectby 的 CHANGE(math_number) 影子
    // 被错配给 EFFECT 槽，效果字段变成「挂了个 math_number」的坏块（用户实际踩到过）。
    const shadowFor = (opcode, slotName) => {
        const bySlot = shadows[opcode];
        if (!bySlot || Array.isArray(bySlot)) return null;
        return bySlot[slotName] || null;
    };

    // 扩展积木的菜单是按「参数名」登记的（跟核心积木的槽位名是同一套）
    const menuShadowForArg = (opcode, slotName) => {
        const byArg = menuShadowByArg[opcode];
        return (byArg && byArg[slotName]) || null;
    };

    const menuFieldName = opcode => {
        const s = spec[opcode];
        if (!s) return null;
        const keys = Object.keys(s.fields);
        return keys.length ? keys[0] : null;
    };

    const subScriptsOf = block => (block.children || []).filter(c => c.isScript);

    // fillSlot 和 convertBlock 互相递归（槽里有积木时要往下转），所以先声明后赋值
    // eslint-disable-next-line prefer-const
    let convertBlock;

    const fillSlot = (block, blockId, slotName, phType, child, opcode) => {
        const isVarSlot = phType === '%m.var';
        const isListSlot = phType === '%m.list';
        const isMenuSlot = /^%m\./.test(phType) && !isVarSlot && !isListSlot;

        if (child && child.isInput) {
            if (child.shape === 'dropdown') {
                const display = String(child.value === void 0 || child.value === null ? '' : child.value);
                // 判断顺序很重要：表里有菜单影子积木就以表为准 —— 有些扩展块在 scratchblocks 里
                // 给的不是 %m.* 类型（比如 translate 的语言、music 的乐器），
                // 若先信类型会把 [English v] 误当成变量报告块。
                const shadowOpcode = menuShadowForArg(opcode, slotName) ||
                    (isMenuSlot ? shadowFor(opcode, slotName) : null);
                if (shadowOpcode) {
                    const menuId = newId('m');
                    const fieldName = menuFieldName(shadowOpcode) || slotName;
                    blocks[menuId] = {
                        opcode: shadowOpcode,
                        next: null,
                        parent: blockId,
                        inputs: {},
                        fields: {[fieldName]: [resolveMenuValue(display), null]},
                        shadow: true,
                        topLevel: false
                    };
                    block.inputs[slotName] = [1, menuId];
                    return;
                }
                if (isVarSlot) {
                    block.fields[slotName] = [display, varId(display)];
                    return;
                }
                if (isListSlot) {
                    block.fields[slotName] = [display, listId(display)];
                    return;
                }
                if (!isMenuSlot) {
                    // 非菜单槽里出现「下拉形状」只可能来自被渲染成 [x v] 的变量/列表报告块
                    // （合法的 %n/%s 槽写作 (...) / [...]，不带箭头）
                    const innerId = emitVarReporter(display, blockId);
                    block.inputs[slotName] = phType === '%b' ? [2, innerId] : [3, innerId, [10, '']];
                    return;
                }
                // 是菜单槽但表里没有影子积木：退化成普通字段
                block.fields[slotName] = [resolveMenuValue(display), null];
                return;
            }
            if (child.shape === 'number') {
                block.inputs[slotName] = [1, [4, String(child.value === void 0 ? '' : child.value)]];
                return;
            }
            if (child.shape === 'color') {
                block.inputs[slotName] = [1, [9, String(child.value || '#000000')]];
                return;
            }
            block.inputs[slotName] = [1, [10, String(child.value === void 0 ? '' : child.value)]];
            return;
        }

        if (child && child.info) {
            const innerId = convertBlock(child, {parent: blockId});
            // 布尔槽用 [2, id]；值槽用 [3, id, 默认影子]（第三个元素不能省）
            block.inputs[slotName] = phType === '%b' ? [2, innerId] : [3, innerId, [10, '']];
            return;
        }

        // 空槽：给个默认阴影，免得 sb3 校验不过
        block.inputs[slotName] = phType === '%b' ? [2, null] : [1, [10, '']];
    };

    convertBlock = (sbBlock, {topLevel = false, parent = null} = {}) => {
        let opcode = opcodeOf(sbBlock);

        // scratchblocks 对 if 和 if-else 用同一个 id，靠子栈数量区分
        if (sbBlock.info.id === 'CONTROL_IF' && subScriptsOf(sbBlock).length > 1) {
            opcode = 'control_if_else';
        }

        // 变量 / 列表报告块：info.id 是 undefined（scratchblocks 只给了 selector），
        // 也没有参数表可查，必须单独处理
        if (opcode === 'data_variable' || opcode === 'data_listcontents') {
            const name = blockName(sbBlock) || '';
            const id = newId();
            const isList = opcode === 'data_listcontents';
            blocks[id] = {
                opcode,
                next: null,
                parent,
                inputs: {},
                fields: isList ? {LIST: [name, listId(name)]} : {VARIABLE: [name, varId(name)]},
                shadow: false,
                topLevel
            };
            return id;
        }

        if (!opcode) {
            warnings.push(`Unsupported block: ${sbBlock.info.id || sbBlock.info.selector || 'unknown'} (skipped)`);
            const id = newId('u');
            blocks[id] = {opcode: 'unknown_block', next: null, parent, inputs: {}, fields: {}, shadow: false, topLevel};
            return id;
        }

        const sbDef = meta.sbBlocks[sbBlock.info.id];
        const s = spec[opcode];
        if (!s || !sbDef) {
            warnings.push(`No parameter table: ${sbBlock.info.id} (${opcode}) (skipped)`);
            const id = newId('u');
            blocks[id] = {opcode, next: null, parent, inputs: {}, fields: {}, shadow: false, topLevel};
            return id;
        }

        const id = newId();
        const block = {opcode, next: null, parent, inputs: {}, fields: {}, shadow: false, topLevel};
        blocks[id] = block;

        const slotNames = s.order || [...Object.keys(s.inputs), ...Object.keys(s.fields)];
        const placeholders = sbDef.parts.filter(p => PLACEHOLDER.test(p));
        // 槽位子节点：Input（字面量/菜单），或直接挂在 children 上的 Block（布尔/报告块）
        const slotChildren = (sbBlock.children || []).filter(c => c.isInput || c.isBlock);

        if (slotChildren.length !== placeholders.length) {
            warnings.push(
                `${sbBlock.info.id}: slot count mismatch ` +
                `(parsed ${slotChildren.length}, defined ${placeholders.length})`
            );
        }

        for (let i = 0; i < placeholders.length; i++) {
            const slotName = slotNames[i];
            if (!slotName) {
                warnings.push(`${sbBlock.info.id}: slot ${i + 1} has no parameter name`);
                continue;
            }
            fillSlot(block, id, slotName, sbDef.slotTypes[i], slotChildren[i], opcode);
        }

        // 子栈
        const subScripts = subScriptsOf(sbBlock);
        (s.substacks || []).forEach((stackName, idx) => {
            const sub = subScripts[idx];
            if (!sub || !sub.blocks.length) return;
            let prev = null;
            let first = null;
            for (const inner of sub.blocks) {
                const innerId = convertBlock(inner, {parent: prev || id});
                if (prev) {
                    blocks[prev].next = innerId;
                    blocks[innerId].parent = prev;
                } else {
                    first = innerId;
                }
                prev = innerId;
            }
            block.inputs[stackName] = [2, first];
        });

        return id;
    };

    const doc = parseScratchblocks(text, {languages: ['en']});
    let column = 0;
    for (const script of doc.scripts) {
        if (!script.blocks.length) continue;
        let prevId = null;
        let firstId = null;
        for (const sbBlock of script.blocks) {
            const id = convertBlock(sbBlock, {topLevel: prevId === null});
            if (prevId) {
                blocks[prevId].next = id;
                blocks[id].parent = prevId;
            } else {
                blocks[id].x = column * 400;
                blocks[id].y = 0;
                firstId = id;
            }
            prevId = id;
        }
        topLevelIds.push(firstId);
        column++;
    }

    return {blocks, topLevelIds, variables, lists, warnings};
};

// ---------------------------------------------------------------------------
// 反向：sb3 blocks -> 文本
// ---------------------------------------------------------------------------

// 一个目标（精灵/舞台）的全部脚本 -> 文本
export const targetBlocksToText = target => {
    const blocks = target.blocks || {};
    const topIds = Object.keys(blocks).filter(id => blocks[id].topLevel);
    const parts = [];
    const warnings = [];
    for (const id of topIds) {
        try {
            parts.push(psb.toScratchblocks(id, blocks, 'en', {tab: '  '}));
        } catch (e) {
            warnings.push(`Failed to render ${id}: ${e && e.message}`);
        }
    }
    return {text: parts.join('\n\n'), warnings};
};
