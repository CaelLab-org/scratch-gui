/*
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / XMUER Coding Engine
 * Licensed under the GNU Affero General Public License, Version 3 (AGPL-3.0-only)
 * https://www.gnu.org/licenses/agpl-3.0.txt
 * Source: https://github.com/CaelLab-org/scratch-gui
 * Project: https://engine.xmuer.online/
 */

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

const {idToOpcode, spec, shadows, menuValues, menuValuesByBlock, menuShadowByArg} = meta;

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

// 一段标签（到第一个子积木为止）拼成的名字。自定义积木的名字和参数名都长这样，
// 名字里带空格时会被解析成好几个标签，所以**全部拼起来**，别只取第一个。
const labelsOf = children => {
    const words = [];
    for (const child of children || []) {
        if (!child.isLabel) break;
        words.push(child.value);
    }
    return words.join(' ').trim();
};

// 下拉框里写的显示文字 -> 该块真正要存的值。
// **必须按块查**：同一段显示文字在不同块里可以是不同的值 —— 核心的「当按下按键」菜单
// 显示 'right arrow' 值也是 'right arrow'，Makey Makey 的同类菜单显示同一段文字、值却是 'RIGHT'。
// 只按显示文字查一张全局表，先扫到的那个扩展就会把核心块顶掉，写出永远不触发的按键积木。
// 全局表只作最后兜底（按块的表没有这条显示文字时才查它）。
const menuValueFor = (opcode, shadowOpcode, display) => {
    const byBlock = (opcode && menuValuesByBlock[opcode]) ||
        (shadowOpcode && menuValuesByBlock[shadowOpcode]);
    if (byBlock && display in byBlock) return byBlock[display];
    return display in menuValues ? menuValues[display] : display;
};

// ---------------------------------------------------------------------------
// 正向：文本 -> sb3 blocks
// ---------------------------------------------------------------------------

// 一段脚本前的标注行，格式是 `:: script <顶块id> (N blocks)`。
// 顶块 id 在项目里本来就存在（sb3 块 id），这里只是把它暴露出来 —— xce_edit_script /
// xce_delete_script 靠它精确定位一段脚本，模型不用再靠「猜文本」指认。
// 注释块同样带标注（`:: note <id>`，读取时列在积木文本后面），写回来时一并剥掉。
const SCRIPT_HEADER = /^\s*::\s*(?:script|note)\s/;

/**
 * 文本 -> sb3 形态的积木
 * @param {string} text scratchblocks 文本
 * @param {object} ctx  {variables: {name: id}, lists: {name: id}} —— 传项目已有的，保证 id 对得上
 * @returns {{blocks: object, topLevelIds: string[], variables: object, lists: object, warnings: string[]}} 转换结果与警告
 */
export const textToBlocks = (text, ctx = {}) => {
    // 读回来的文本每段脚本前带一行 `:: script <id>` 标注（注释区带 `:: note <id>`）；
    // 模型照抄整段（含标注行）写回来是常见动作，解析前先把标注行摘掉，别让它变成解析错误。
    const cleaned = String(text).split('\n')
        .filter(line => !SCRIPT_HEADER.test(line))
        .join('\n');
    const variables = {...(ctx.variables || {})};
    const lists = {...(ctx.lists || {})};
    const blocks = {};
    const topLevelIds = [];
    const warnings = [];
    // 调用了、但这段文本和项目里都没有定义的自定义积木。**调用一个没定义的自定义积木在
    // Scratch 里是块死积木**（点了什么都不发生），所以这个清单由调用方拿去做「整体拒绝」。
    const missingDefinitions = [];
    let counter = 0;
    // 块 id 必须**跨调用唯一**。曾经是每次转换从 c0 重新开始编，于是第二次 write_script
    // 生成的 c0/c1... 跟第一次撞车，后写的块把先写的**整段覆盖**掉 ——
    // 表现就是「工具回写入成功，但读回来只有一段，后面写的都不见了」（用户实际踩到过）。
    // 加一段每次调用随机的短 tag：既避开同一次会话内的重复，也避开将来加载回旧项目时的碰撞。
    const idTag = Math.random().toString(36)
        .slice(2, 6);
    const newId = (prefix = 'c') => `${prefix}${idTag}${(counter++).toString(36)}`;

    // 变量 / 列表 id：可读的 v1、l1 优先，但**必须避开项目里已经占用的 id** ——
    // 光按「现有变量个数 + 1」编号，遇到用户自建的 id 恰好叫 v2 时就会撞车，
    // 撞了就是 createVariable 静默不干事（或者更糟：把别人的变量顶掉）。
    const usedVarIds = new Set([...Object.values(variables), ...Object.values(lists)]);
    const freshVarId = prefix => {
        let index = usedVarIds.size + 1;
        let candidate = `${prefix}${index}`;
        while (usedVarIds.has(candidate)) candidate = `${prefix}${++index}`;
        usedVarIds.add(candidate);
        return candidate;
    };
    const varId = name => {
        if (!(name in variables)) variables[name] = freshVarId('v');
        return variables[name];
    };
    const listId = name => {
        if (!(name in lists)) lists[name] = freshVarId('l');
        return lists[name];
    };

    // —— 自定义积木（我的积木）——
    // 名字 -> 定义 {proccode, argumentIds, argumentNames, argumentDefaults, types, warp}。
    // 先收项目里现有的（ctx.procedures，由 port 扫 procedures_prototype 得到），
    // 再把这段文本里 define 的补进来：同一段文本里「先调用后定义」也很常见。
    // 参数 id 必须沿用已有定义的那一套，否则调用块和定义块的参数表对不上，积木直接失效。
    const procedures = {};
    for (const [name, entry] of Object.entries(ctx.procedures || {})) {
        if (entry && entry.proccode) procedures[name] = entry;
    }
    // 项目里本来就有的定义 / 这段文本里已经报过一次的名字：同一个提醒只说一次
    const projectProcedures = new Set(Object.keys(procedures));
    const announcedProcedures = new Set();

    const registerProcedure = (name, argNames) => {
        const existing = procedures[name];
        if (existing && existing.argumentNames.length === argNames.length &&
            existing.argumentNames.every((arg, index) => arg === argNames[index])) {
            // 项目里本来就有这个定义，这段文本又写了一遍：多半是模型在「重写定义」。
            // 重写该走 xce_edit_script（那会删掉旧的），直接写会留下两份同名定义。
            if (!ctx.replacing && !announcedProcedures.has(name) && projectProcedures.has(name)) {
                announcedProcedures.add(name);
                warnings.push(
                    `Custom block "${name}" is already defined on this sprite — this text defines it again, ` +
                    'so the sprite would carry two definitions of the same block. To change an existing ' +
                    'definition, use xce_edit_script on its `:: script` id instead.'
                );
            }
            return existing;
        }
        if (existing) {
            warnings.push(
                `Custom block "${name}" is already defined with inputs ` +
                `(${existing.argumentNames.join(', ') || 'none'}), but this text defines it with ` +
                `(${argNames.join(', ') || 'none'}). Redefining it with new inputs ` +
                'breaks any existing calls to the old one.'
            );
        }
        const declared = ctx.declare && ctx.declare.name === name &&
            Array.isArray(ctx.declare.types) && ctx.declare.types.length === argNames.length ?
            ctx.declare : null;
        const types = declared ? declared.types.slice() : argNames.map(() => '%s');
        const entry = {
            name,
            proccode: [name].concat(types).join(' '),
            argumentIds: argNames.map(() => newId('a')),
            argumentNames: argNames,
            argumentDefaults: argNames.map(() => ''),
            types,
            warp: !!(declared && declared.warp)
        };
        procedures[name] = entry;
        return entry;
    };

    const procedureArgType = name => {
        for (const entry of Object.values(procedures)) {
            const index = entry.argumentNames.indexOf(name);
            if (index !== -1) return entry.types[index] || '%s';
        }
        return '%s';
    };

    const isKnownArg = name => Object.values(procedures)
        .some(entry => entry.argumentNames.includes(name));

    // 读自定义积木的参数（`(高度::custom)`）：布尔参数要落成 argument_reporter_boolean，
    // 否则那块积木在布尔槽里插不进去。
    const emitArgReporter = (name, {parent, topLevel}) => {
        const id = newId();
        blocks[id] = {
            opcode: procedureArgType(name) === '%b' ?
                'argument_reporter_boolean' : 'argument_reporter_string_number',
            next: null,
            parent,
            inputs: {},
            fields: {VALUE: [name, null]},
            shadow: false,
            topLevel
        };
        return id;
    };

    // `define 名字 (参数1) (参数2)` 解析出来是：DEFINITION -> 标签「define」+ 一个原型块，
    // 原型块里依次是「名字标签 + 每个参数一个小积木（里面只有一个标签）」。
    const procDefOf = sbBlock => {
        const proto = (sbBlock.children || []).find(child => child.isBlock);
        const name = labelsOf(proto ? proto.children : []);
        const argNames = ((proto ? proto.children : []) || [])
            .filter(child => child.isBlock)
            .map(arg => labelsOf(arg.children))
            .filter(Boolean);
        return {name, argNames};
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
        // 自定义积木（define / 调用 / 参数读取）要 mutation，在 convertBlock 里单独处理，走不到这里
        if (selector === 'procDef' || selector === 'call' || selector === 'getParam') return null;
        return (block.info && idToOpcode[block.info.id]) || null;
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
        // 变量 / 列表槽位：**以参数表为准**，不只信 scratchblocks 给的槽位类型。
        // 模型常把下拉写成 `[得分]`（少了那个 v），这时解析出来是个普通文本 Input；
        // 若按「非下拉 = 值槽」处理，就会写成 inputs.VARIABLE —— 积木落地后下拉是空的，
        // 变量也从没被创建（用户实际踩到过：积木区多了一堆没定义的变量块）。
        // 广播（BROADCAST_OPTION）也是 field_variable，但它是 broadcast_msg，不算普通变量。
        const fieldType = (spec[opcode] && spec[opcode].fields) ? spec[opcode].fields[slotName] : null;
        const listSlot = phType === '%m.list' || (fieldType === 'field_variable' && slotName === 'LIST');
        const varSlot = !listSlot && slotName !== 'BROADCAST_OPTION' &&
            (phType === '%m.var' || fieldType === 'field_variable' || fieldType === 'field_variable_getter');
        const isMenuSlot = /^%m\./.test(phType) && !varSlot && !listSlot;

        if (varSlot || listSlot) {
            // 槽里写的可能是下拉 `[名字 v]`、裸方括号 `[名字]`、圆括号 `(名字)`，也可能是
            // 一个变量报告块 `(名字)`（非下拉形状）。三种都归一到「字段 + 已登记的变量」。
            const name = child ?
                (child.isInput ? String(child.value === void 0 || child.value === null ? '' : child.value) :
                    (child.isLabel ? String(child.value || '') : (blockName(child) || ''))) :
                '';
            if (!name.trim()) {
                warnings.push(
                    `${opcode}: the ${slotName} slot is empty — a variable or list name is required there.`
                );
                block.inputs[slotName] = [1, [10, '']];
                return;
            }
            block.fields[slotName] = listSlot ? [name, listId(name)] : [name, varId(name)];
            return;
        }

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
                        fields: {[fieldName]: [menuValueFor(opcode, shadowOpcode, display), null]},
                        shadow: true,
                        topLevel: false
                    };
                    block.inputs[slotName] = [1, menuId];
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
                block.fields[slotName] = [menuValueFor(opcode, shadowOpcode, display), null];
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

    // 一个调用块。参数 id 必须与定义那边**一模一样** —— mutation.argumentids 就是两边的合同；
    // 没有定义时按「全是 %s」编一套，反正这次写入会被整体拒绝（见 missingDefinitions）。
    const emitProcedureCall = (name, args, {parent, topLevel}) => {
        const entry = procedures[name];
        if (!entry) missingDefinitions.push(name);
        const types = entry ? entry.types : args.map(() => '%s');
        const argIds = entry ? entry.argumentIds :
            args.map((child, index) => `arg${idTag}${index}`);
        const callId = newId();
        blocks[callId] = {
            opcode: 'procedures_call',
            next: null,
            parent,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel,
            mutation: {
                tagName: 'mutation',
                children: [],
                proccode: entry ? entry.proccode : [name].concat(types).join(' '),
                argumentids: JSON.stringify(argIds),
                warp: entry && entry.warp ? 'true' : 'false'
            }
        };
        args.forEach((child, index) => {
            const argId = argIds[index];
            if (!argId) return;
            fillSlot(blocks[callId], callId, argId, types[index] === '%b' ? '%b' : '%s', child,
                'procedures_call');
        });
        return callId;
    };

    convertBlock = (sbBlock, {topLevel = false, parent = null} = {}) => {
        const selector = sbBlock.info && sbBlock.info.selector;

        // 停止（stop all / stop this script）：参数表里没有它（STOP_OPTION 与 hasnext 是 mutation
        // 带出来的），照通用流程走会得到一块下拉空着的积木 —— 点了什么都不发生。
        if (sbBlock.info && sbBlock.info.id === 'CONTROL_STOP') {
            const slot = (sbBlock.children || []).find(child => child.isInput);
            const display = String(slot && slot.value !== void 0 && slot.value !== null ? slot.value : '').trim();
            const stopOption = menuValueFor('control_stop', null, display || 'all');
            const id = newId();
            blocks[id] = {
                opcode: 'control_stop',
                next: null,
                parent,
                inputs: {},
                fields: {STOP_OPTION: [stopOption, null]},
                shadow: false,
                topLevel,
                mutation: {
                    tagName: 'mutation',
                    children: [],
                    hasnext: stopOption === 'other scripts in sprite' ? 'true' : 'false'
                }
            };
            return id;
        }

        // —— 自定义积木（我的积木）：define / 调用 / 读参数 ——
        // 三种都没有参数表，全靠 mutation 记名字与参数表，所以单独处理。
        if (selector === 'procDef') {
            const {name, argNames} = procDefOf(sbBlock);
            const entry = registerProcedure(name, argNames);
            const defId = newId();
            const protoId = newId();
            blocks[defId] = {
                opcode: 'procedures_definition',
                next: null,
                parent,
                inputs: {custom_block: [1, protoId]},
                fields: {},
                shadow: false,
                topLevel
            };
            blocks[protoId] = {
                opcode: 'procedures_prototype',
                next: null,
                parent: defId,
                inputs: {},
                fields: {},
                shadow: true,
                topLevel: false,
                mutation: {
                    tagName: 'mutation',
                    children: [],
                    proccode: entry.proccode,
                    argumentids: JSON.stringify(entry.argumentIds),
                    argumentnames: JSON.stringify(entry.argumentNames),
                    argumentdefaults: JSON.stringify(entry.argumentDefaults),
                    warp: entry.warp ? 'true' : 'false'
                }
            };
            entry.argumentIds.forEach((argId, index) => {
                const reporterId = newId('p');
                blocks[reporterId] = {
                    opcode: entry.types[index] === '%b' ?
                        'argument_reporter_boolean' : 'argument_reporter_string_number',
                    next: null,
                    parent: protoId,
                    inputs: {},
                    fields: {VALUE: [entry.argumentNames[index], null]},
                    shadow: true,
                    topLevel: false
                };
                blocks[protoId].inputs[argId] = [1, reporterId];
            });
            return defId;
        }

        if (selector === 'call') {
            const children = sbBlock.children || [];
            let start = 0;
            while (start < children.length && children[start].isLabel) start++;
            return emitProcedureCall(labelsOf(children), children.slice(start), {parent, topLevel});
        }

        // 项目里已有、但这段文本没有 define 的自定义积木：scratchblocks 解析器**不认识它**，
        // 只会给一个 category=obsolete、没有 id/selector 的「野积木」。名字对得上已有的定义时
        // 就按调用块处理 —— 否则调用一个项目里明明存在的积木，会被判成「不认识的写法」。
        // 参数读数 `(高度::custom)` 同理：名字对得上某个参数就当参数块用。
        if (!sbBlock.info || (!sbBlock.info.id && !sbBlock.info.selector)) {
            const children = sbBlock.children || [];
            let start = 0;
            while (start < children.length && children[start].isLabel) start++;
            const name = labelsOf(children);
            if (name && procedures[name]) {
                return emitProcedureCall(name, children.slice(start), {parent, topLevel});
            }
            if (name && isKnownArg(name)) {
                return emitArgReporter(name, {parent, topLevel});
            }
        }

        if (selector === 'getParam') {
            return emitArgReporter(labelsOf(sbBlock.children), {parent, topLevel});
        }

        let opcode = opcodeOf(sbBlock);

        // scratchblocks 对 if 和 if-else 用同一个 id，靠子栈数量区分
        if (sbBlock.info && sbBlock.info.id === 'CONTROL_IF' && subScriptsOf(sbBlock).length > 1) {
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
            const label = labelsOf(sbBlock.children) || (sbBlock.info && sbBlock.info.hash) || 'unknown';
            warnings.push(`Unsupported block: "${label}" (skipped)`);
            const id = newId('u');
            blocks[id] = {opcode: 'unknown_block', next: null, parent, inputs: {}, fields: {}, shadow: false, topLevel};
            return id;
        }

        const sbDef = meta.sbBlocks[sbBlock.info && sbBlock.info.id];
        const s = spec[opcode];
        if (!s || !sbDef) {
            warnings.push(`No parameter table: ${sbBlock.info && sbBlock.info.id} (${opcode}) (skipped)`);
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

    const doc = parseScratchblocks(cleaned, {languages: ['en']});
    // 先把这段文本里的定义登记一遍：同一段文本里「先调用、后定义」很常见，
    // 不先登记的话调用那边会查不到参数表，整段就被判成缺定义了
    for (const script of doc.scripts) {
        for (const sbBlock of script.blocks) {
            if (sbBlock.info && sbBlock.info.selector === 'procDef') {
                const {name, argNames} = procDefOf(sbBlock);
                registerProcedure(name, argNames);
            }
        }
    }
    let column = 0;
    for (const script of doc.scripts) {
        if (!script.blocks.length) continue;
        let prevId = null;
        let row = 0;
        for (const sbBlock of script.blocks) {
            // 自定义积木的定义**永远是新堆的顶**：它不可能挂在别的积木下面。
            // 模型写「定义 → 另一段定义 / 另一段脚本」而不加空行时，解析器会把它们串成一条，
            // 不在这儿断开就会变成「定义套在定义的身体里」。
            const isDef = sbBlock.info && sbBlock.info.selector === 'procDef';
            const startsStack = prevId === null || isDef;
            const id = convertBlock(sbBlock, {topLevel: startsStack});
            if (startsStack) {
                blocks[id].x = column * 400;
                blocks[id].y = row * 600;
                row++;
                topLevelIds.push(id);
            } else {
                blocks[prevId].next = id;
                blocks[id].parent = prevId;
            }
            prevId = id;
        }
        column++;
    }

    // 下拉框的值必须真的落在那张菜单里。
    // 写过一次菜单里没有的值，得到的就是一块**永远不触发**的积木，而工具回报「写入成功」——
    // 用户按半天键盘才发现（实际踩到过：按键菜单被译成 'RIGHT'，Scratch 只认 'right arrow'）。
    // 两道避雷：
    //   1. 只查「普通下拉字段」。造型 / 声音 / 目标 / 碰到 / 克隆对象这些是「输入槽 + 影子菜单」，
    //      值里可以写项目里任意一个角色名、造型名，天生不在 fields 里。
    //   2. 带哨兵值的菜单（_mouse_/_edge_/_random_/_stage_/_myself_）同样接受项目名字，一律跳过 ——
    //      这是 Scratch 自己的约定：菜单里出现哨兵，就说明这一栏要由编辑器补上项目里的名字。
    const DROPDOWN_FIELD_TYPES = new Set(['field_dropdown', 'field_numberdropdown']);
    const SENTINEL_VALUE = /^_.*_$/;
    const reported = new Set();
    for (const block of Object.values(blocks)) {
        const s = spec[block.opcode];
        const menu = menuValuesByBlock[block.opcode];
        if (!s || !s.fields || !menu) continue;
        const values = Object.values(menu);
        if (values.some(v => typeof v === 'string' && SENTINEL_VALUE.test(v))) continue;
        const allowed = new Set(values);
        for (const [name, field] of Object.entries(block.fields || {})) {
            if (!DROPDOWN_FIELD_TYPES.has(s.fields[name])) continue;
            const value = field && field[0];
            if (typeof value !== 'string' || allowed.has(value)) continue;
            const key = `${block.opcode}.${name}=${value}`;
            if (reported.has(key)) continue;
            reported.add(key);
            const sample = [...allowed].slice(0, 16);
            warnings.push(
                `Invalid dropdown value: ${block.opcode}.${name} = ${JSON.stringify(value)} — ` +
                `that value is not one of this block's menu options, so the block will silently do nothing. ` +
                `Valid values: ${sample.map(v => JSON.stringify(v)).join(', ')}` +
                `${allowed.size > sample.length ? ` (+${allowed.size - sample.length} more)` : ''}.`
            );
        }
    }

    return {blocks, topLevelIds, variables, lists, warnings, missingDefinitions};
};

/**
 * 一批 sb3 形态的积木里「引用了变量/列表」的地方。
 * 写入落库之前拿它做最后一道检查：**每个引用都必须能在 VM 里找到对应变量**，
 * 找不到就补建 —— 积木引着一个不存在的变量时，下拉是空的、跑起来也什么都不做。
 * 广播（BROADCAST_OPTION）是另一种东西（broadcast_msg），不在这个清单里。
 * @param {object} blocks sb3 形态的积木表
 * @returns {Array<object>} 每一处引用的 {blockId, opcode, slot, name, id, isList}
 */
export const collectVariableRefs = blocks => {
    const refs = [];
    for (const [blockId, block] of Object.entries(blocks || {})) {
        if (!block) continue;
        const fields = (spec[block.opcode] && spec[block.opcode].fields) || null;
        if (!fields) continue;
        for (const [slot, field] of Object.entries(block.fields || {})) {
            const type = fields[slot];
            if (type !== 'field_variable' && type !== 'field_variable_getter') continue;
            if (slot === 'BROADCAST_OPTION') continue;
            const value = Array.isArray(field) ? field[0] : (field && field.value);
            const id = Array.isArray(field) ? field[1] : (field && field.id);
            if (typeof value !== 'string' || !value) continue;
            refs.push({blockId, opcode: block.opcode, slot, name: value, id: id || null, isList: slot === 'LIST'});
        }
    }
    return refs;
};

// ---------------------------------------------------------------------------
// 反向：sb3 blocks -> 文本
// ---------------------------------------------------------------------------

// 数一段脚本的可见块数：顶块沿 next 链 + 输入槽里的报告块（字面量 / 影子菜单不算）
const countScriptBlocks = (topId, blocks) => {
    let count = 0;
    const walk = id => {
        if (!id || typeof id !== 'string' || !blocks[id]) return;
        count += 1;
        const block = blocks[id];
        walk(block.next);
        for (const input of Object.values(block.inputs || {})) {
            // [形态, 块id|字面量, 影子?]，字面量是数组不是字符串 id
            if (Array.isArray(input)) walk(input[1]);
        }
    };
    walk(topId);
    return count;
};

// 一个目标（精灵/舞台）的全部脚本 -> 文本
export const targetBlocksToText = target => {
    const blocks = target.blocks || {};
    const topIds = Object.keys(blocks).filter(id => blocks[id].topLevel);
    const parts = [];
    const warnings = [];
    for (const id of topIds) {
        try {
            const text = psb.toScratchblocks(id, blocks, 'en', {tab: '  '});
            const count = countScriptBlocks(id, blocks);
            parts.push(`:: script ${id} (${count} block${count === 1 ? '' : 's'})\n${text}`);
        } catch (e) {
            warnings.push(`Failed to render ${id}: ${e && e.message}`);
        }
    }
    return {text: parts.join('\n\n'), warnings};
};
