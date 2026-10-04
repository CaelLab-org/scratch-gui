/**
 * ScratchPort 的浏览器实现：把 VM / Blockly 包成引擎无关的读写接口。
 *
 * 读写两个方向的形态转换都是必须的，因为 VM 内部形态和 sb3 的 project.json 形态不同：
 *   内部形态  inputs: {NAME: {name, block: id|null, shadow: id|null}}，fields: {NAME: {name, value, id}}
 *   sb3 形态  inputs: {NAME: [1|2|3, id|[原语码,值], ...]}，fields: {NAME: [value, id?]}
 *
 * 写入走 scratch-vm 自带的 deserializeBlocks（权威实现），
 * 读取自己转（因为自带的 serializeBlocks 对字面量的输出不是规范 sb3 形态，下游渲染器读不了）。
 */
import sb3 from 'scratch-vm/src/serialization/sb3.js';
import {targetBlocksToText, textToBlocks} from './serialize.js';

// sb3 里的「原始影子」编码：数字/颜色/文本等内联成 [码, 值]，而不是一个积木
const PRIMITIVES = {
    math_number: {code: 4, field: 'NUM'},
    math_positive_number: {code: 5, field: 'NUM'},
    math_whole_number: {code: 6, field: 'NUM'},
    math_integer: {code: 7, field: 'NUM'},
    math_angle: {code: 8, field: 'NUM'},
    colour_picker: {code: 9, field: 'COLOUR'},
    text: {code: 10, field: 'TEXT'},
    note: {code: 11, field: 'NOTE'},
    matrix: {code: 12, field: 'MATRIX'}
};

const INTERNAL_TO_SB3 = {};
for (const [opcode, info] of Object.entries(PRIMITIVES)) INTERNAL_TO_SB3[opcode] = info;

// VM 内部形态的一份 blocks 快照 -> sb3 形态（不改动原对象）
export const internalToSb3 = internalBlocks => {
    const out = {};
    const inlined = new Set();

    const refOf = id => {
        if (id === null || id === void 0) return null;
        const block = internalBlocks[id];
        if (!block) return id;
        const primitive = INTERNAL_TO_SB3[block.opcode];
        if (primitive) {
            inlined.add(id);
            const field = block.fields && block.fields[primitive.field];
            return [primitive.code, field ? field.value : ''];
        }
        return id;
    };

    for (const id of Object.keys(internalBlocks)) {
        const block = internalBlocks[id];
        if (!block || INTERNAL_TO_SB3[block.opcode]) continue; // 原始影子单独处理
        const inputs = {};
        for (const [name, input] of Object.entries(block.inputs || {})) {
            const blockRef = input.block === input.shadow ? refOf(input.block) : refOf(input.block);
            if (input.block === input.shadow) {
                inputs[name] = [1, blockRef];
            } else if (input.shadow === null || input.shadow === void 0) {
                inputs[name] = [2, blockRef];
            } else {
                inputs[name] = [3, blockRef, refOf(input.shadow)];
            }
        }
        const fields = {};
        for (const [name, field] of Object.entries(block.fields || {})) {
            fields[name] = field && Object.prototype.hasOwnProperty.call(field, 'id') ?
                [field.value, field.id] :
                [field.value];
        }
        const out2 = {
            opcode: block.opcode,
            next: block.next === void 0 ? null : block.next,
            parent: block.parent === void 0 ? null : block.parent,
            inputs,
            fields,
            shadow: !!block.shadow,
            topLevel: !!block.topLevel
        };
        if (block.topLevel) {
            out2.x = block.x;
            out2.y = block.y;
        }
        out[id] = out2;
    }
    return out;
};

// 数「看得见」的积木：影子块（数字 / 文本这些内联输入）不算 —— 跟 Scratch 自带
// 「积木数量」插件的口径一致，界面上的 +N/−M 才对得上用户自己数的结果。
export const visibleBlockCount = blocks => Object.values(blocks || {})
    .filter(block => block && !block.shadow).length;

// 核心积木的 opcode 前缀。不在这张表里的前缀就是扩展积木，
// 写入前必须先把扩展加载起来，否则那些积木在 VM 里是「未知积木」，用户看到一堆灰块。
const CORE_PREFIXES = new Set([
    'motion', 'looks', 'sound', 'event', 'control', 'sensing',
    'operator', 'data', 'procedures', 'argument'
]);

// 影子积木（数字/文本/颜色这些内联的）前缀也不在 CORE_PREFIXES 里，但它们**不是扩展**：
// math_number 的前缀是 math、colour_picker 是 colour…… 曾把它们当成没加载的扩展，
// 于是「透明度」这类普通积木被拒，错误里写着「扩展（math）」。
const SHADOW_PREFIXES = new Set(['math', 'colour', 'text', 'note', 'matrix']);
// 转换器没认出来的积木（serialize.js 的兜底 opcode），同样不是扩展
const UNKNOWN_OPCODE = 'unknown_block';

/**
 * 建一个绑定到 vm 的 port
 * @param {object} opts  vm: scratch-vm 实例；getWorkspace: 取 Blockly 主工作区（整理布局用，可空）
 * @returns {object} 实现 ScratchPort 的对象
 */
export const createScratchPort = ({vm, getWorkspace}) => {
    const runtime = () => vm.runtime;
    const stage = () => runtime().getTargetForStage();

    // 只有「真正的角色」算数：**克隆体不算**。克隆体是运行期的临时物（跑一次星空能冒出上百个），
    // 它们混进角色列表后，AI 看到的清单里会有几十上百个同名「角色1」，既刷屏又没法操作
    // （它们没有独立的编辑工作区，写进去的东西按设计本来就留不下来）。
    const realTargets = () => runtime().targets.filter(t => !t.isClone);

    // 名字匹配要宽容：清单里为了区分舞台写成「Stage (the stage)」/「Stage（舞台）」，模型会连着括号一起抄回来。
    const normalizeName = raw => String(raw === void 0 || raw === null ? '' : raw)
        .trim()
        .replace(/[（(]\s*(?:舞台|the stage|stage)\s*[)）]$/i, '')
        .trim();
    const findTarget = rawName => {
        const name = normalizeName(rawName);
        return realTargets().find(t => t.getName && t.getName() === name) || null;
    };

    const splitVars = target => {
        const variables = {};
        const lists = {};
        for (const variable of Object.values(target.variables)) {
            if (!variable) continue;
            if (variable.type === 'list') lists[variable.name] = variable.id;
            else if (variable.type === 'broadcast_msg') continue;
            else variables[variable.name] = variable.id;
        }
        return {variables, lists};
    };

    // 项目里（含舞台）全部同名变量/列表的 id，保证转换器复用它而不是新建
    const allVariableIds = () => {
        const {variables, lists} = splitVars(stage());
        return {variables: {...variables}, lists: {...lists}};
    };

    // 项目里已经加载的扩展 id。只读，不改任何东西。
    const loadedExtensionIds = () => {
        try {
            const manager = vm.extensionManager;
            if (manager && manager._loadedExtensions &&
                typeof manager._loadedExtensions.keys === 'function') {
                return [...manager._loadedExtensions.keys()];
            }
        } catch (e) {
            // 读不到就当没有
        }
        return [];
    };

    const refreshWorkspace = () => {
        if (vm.emitWorkspaceUpdate) vm.emitWorkspaceUpdate();
    };

    // 给系统提示词用的轻量项目概况：只数脚本段数，不渲染积木文本
    const describeProject = () => realTargets().map(t => ({
        name: t.getName(),
        isStage: !!t.isStage,
        scriptCount: t.blocks && t.blocks.getScripts ? t.blocks.getScripts().length : 0
    }));

    // 整理布局：Scratch 原生右键的「整理积木」就是它
    const tidy = () => {
        try {
            const workspace = getWorkspace && getWorkspace();
            if (workspace && workspace.cleanUp) workspace.cleanUp();
        } catch (e) {
            // 排版失败不影响功能
            // eslint-disable-next-line no-console
            console.warn('[ai] 整理布局失败', e);
        }
    };

    // 抓一份脚本快照（顶块 + 子块 + 子栈 + 输入）：删脚本是破坏性操作，
    // 不留一份原样的就再也摆不回来。形态跟 readTarget 用同一个转换器，所以能原样喂回
    // deserializeBlocks（原语输入在内联形态里，不需要单独重建影子块）。
    const captureScript = (spriteName, topBlockId) => {
        const target = findTarget(spriteName);
        if (!target || !target.blocks.getBlock(topBlockId)) return null;
        const all = internalToSb3(target.blocks._blocks);
        const wanted = new Set();
        const walk = id => {
            if (!id || wanted.has(id) || !all[id]) return;
            wanted.add(id);
            const block = all[id];
            walk(block.next);
            for (const input of Object.values(block.inputs || {})) {
                // [1|2|3, block, shadow?]，原语已经被内联成 [code, value] 了
                if (!Array.isArray(input)) continue;
                walk(input[1]);
                walk(input[2]);
            }
        };
        walk(topBlockId);
        const blocks = {};
        for (const id of wanted) blocks[id] = all[id];
        return {blocks, count: visibleBlockCount(blocks)};
    };

    const deleteScript = (spriteName, topBlockId) => {
        const target = findTarget(spriteName);
        if (!target || !target.blocks.getBlock(topBlockId)) return false;
        target.blocks.deleteBlock(topBlockId); // 自带级联：子块、输入、子栈一起删
        refreshWorkspace();
        return true;
    };

    const restoreScript = (spriteName, blocks) => {
        const target = findTarget(spriteName);
        if (!target || !blocks || !Object.keys(blocks).length) return false;
        const vmBlocks = sb3.deserializeBlocks(JSON.parse(JSON.stringify(blocks)));
        for (const id of Object.keys(vmBlocks)) {
            if (target.blocks.getBlock(id)) continue; // 这个 id 已经被占用了就别硬塞
            target.blocks.createBlock(vmBlocks[id]);
        }
        refreshWorkspace();
        return true;
    };

    const port = {
        listSprites: () =>
            realTargets().map(t => ({name: t.getName(), isStage: t.isStage, id: t.id})),

        // ls 用的轻量清单：名字/脚本数/变量名/列表名，绝不渲染积木文本
        listSpritesDetailed: () => realTargets().map(t => {
            const {variables, lists} = splitVars(t);
            return {
                name: t.getName(),
                isStage: !!t.isStage,
                scriptCount: t.blocks && t.blocks.getScripts ? t.blocks.getScripts().length : 0,
                variables: Object.keys(variables),
                lists: Object.keys(lists)
            };
        }),

        describeProject,

        loadedExtensions: loadedExtensionIds,

        readTarget: name => {
            const target = findTarget(name);
            if (!target) return null;
            const {variables, lists} = splitVars(target);
            const sb3Blocks = internalToSb3(target.blocks._blocks);
            const {text, warnings} = targetBlocksToText({blocks: sb3Blocks});
            if (warnings.length) {
                // eslint-disable-next-line no-console
                console.warn('[ai] 读取积木有警告', warnings);
            }
            return {name, text, variables, lists, blockIds: Object.keys(sb3Blocks)};
        },

        writeScript: async (spriteName, text) => {
            const target = findTarget(spriteName);
            if (!target) throw new Error(`No sprite named "${spriteName}"`);
            const {variables, lists} = splitVars(target);
            const stageIds = allVariableIds();

            const converted = textToBlocks(text, {
                variables: {...stageIds.variables, ...variables},
                lists: {...stageIds.lists, ...lists}
            });

            // 项目里还没有的变量/列表：建到舞台上（= 对所有角色可见），跟编辑器默认行为一致
            const createdVariables = [];
            const createdLists = [];
            for (const [name, id] of Object.entries(converted.variables)) {
                if (stageIds.variables[name] || target.lookupVariableById(id)) continue;
                stage().createVariable(id, name, '');
                createdVariables.push(name);
            }
            for (const [name, id] of Object.entries(converted.lists)) {
                if (stageIds.lists[name] || target.lookupVariableById(id)) continue;
                stage().createVariable(id, name, 'list');
                createdLists.push(name);
            }

            // 扩展积木：**不擅自加载扩展**（那是改用户的项目）。
            // 用到了没加载的扩展就直接拒绝写入，把该加载哪个扩展告诉调用方，
            // 由 AI 转告用户去左下角添加。
            const needed = new Set();
            const unknown = [];
            for (const block of Object.values(converted.blocks)) {
                const opcode = String(block.opcode);
                if (opcode === UNKNOWN_OPCODE) {
                    // 转换器没认出来：这是「工具不认识这段写法」，不是扩展问题，单独说清楚
                    unknown.push(opcode);
                    continue;
                }
                const prefix = opcode.split('_')[0];
                if (SHADOW_PREFIXES.has(prefix) || CORE_PREFIXES.has(prefix)) continue;
                needed.add(prefix);
            }
            // 有认不出的积木就整体拒绝：写进去只会变成灰块，还会把用户的脚本弄乱
            if (unknown.length) {
                return {
                    blockIds: [],
                    topBlockIds: [],
                    createdVariables: [],
                    createdLists: [],
                    missingExtensions: [],
                    unrecognized: true,
                    warnings: converted.warnings
                };
            }
            const loaded = loadedExtensionIds();
            const missingExtensions = [...needed].filter(id => !loaded.includes(id));
            if (missingExtensions.length) {
                return {
                    blockIds: [],
                    topBlockIds: [],
                    createdVariables: [],
                    createdLists: [],
                    missingExtensions,
                    warnings: converted.warnings
                };
            }

            // sb3 形态 -> VM 内部形态（权威转换器），再逐个塞进 blocks 容器
            const vmBlocks = sb3.deserializeBlocks(JSON.parse(JSON.stringify(converted.blocks)));
            for (const id of Object.keys(vmBlocks)) {
                target.blocks.createBlock(vmBlocks[id]);
            }
            refreshWorkspace();
            // 让 Blockly 量完尺寸再排版，否则 cleanUp 算出来的高度是错的
            await new Promise(resolve => setTimeout(resolve, 0));
            tidy();

            return {
                blockIds: converted.topLevelIds,
                topBlockIds: converted.topLevelIds,
                blockCount: visibleBlockCount(vmBlocks),
                createdVariables,
                createdLists,
                warnings: converted.warnings
            };
        },

        // 删除前先抓快照：调用方拿它做「撤销这次删除」（见 tools.js 的 delete_script）
        captureScript,

        deleteScript,

        restoreScript,

        // 按工具留下的 undo 句柄把那一次改动收回去（写入 = 删掉刚加的顶块；删除 = 把快照摆回去）。
        // 界面上单张卡的「撤销」和整轮的「回退本轮变更」都走这里。
        undoAction: action => {
            if (!action) return false;
            if (action.kind === 'del') return restoreScript(action.sprite, action.blocks);
            let ok = false;
            for (const topBlockId of action.topBlockIds || []) {
                ok = deleteScript(action.sprite, topBlockId) || ok;
            }
            return ok;
        },

        // 绿旗运行，最多等 timeoutSec 秒；返回 'done' | 'timeout' | 'stopped'
        runProject: (timeoutSec, {signal} = {}) =>
            new Promise(resolve => {
                let settled = false;
                // 先声明再赋值：greenFlag() 有可能同步就触发停止，那时 finish 里不能碰还没赋值的变量
                let timer = null;
                let onStop = null;
                const finish = outcome => {
                    if (settled) return;
                    settled = true;
                    if (timer !== null) clearTimeout(timer);
                    if (onStop) runtime().off('PROJECT_RUN_STOP', onStop);
                    resolve(outcome);
                };
                onStop = () => finish('stopped');
                timer = setTimeout(() => finish('timeout'), timeoutSec * 1000);
                runtime().on('PROJECT_RUN_STOP', onStop);
                if (signal) signal.addEventListener('abort', () => finish('stopped'), {once: true});
                vm.greenFlag();
            }),

        stopProject: () => {
            vm.stopAll();
            return Promise.resolve();
        },

        readState: () => {
            const sprites = [];
            const variables = {};
            const lists = {};
            // 克隆体不列：跑一次星空能留下上百个，读状态会变成一屏同名条目（用户实际踩到过）
            for (const target of realTargets()) {
                if (target.isStage) {
                    for (const variable of Object.values(target.variables)) {
                        if (!variable) continue;
                        if (variable.type === 'list') lists[variable.name] = variable.value;
                        else if (variable.type !== 'broadcast_msg') variables[variable.name] = variable.value;
                    }
                    continue;
                }
                const costumes = target.getCostumes ? target.getCostumes() : [];
                const costume = costumes[target.currentCostume] || {};
                sprites.push({
                    name: target.getName(),
                    x: Math.round(target.x * 100) / 100,
                    y: Math.round(target.y * 100) / 100,
                    direction: Math.round(target.direction),
                    size: Math.round(target.size),
                    visible: target.visible,
                    costume: costume.name || ''
                });
                // 角色私有变量也带上，用「角色.变量」区分
                for (const variable of Object.values(target.variables)) {
                    if (!variable) continue;
                    const key = `${target.getName()}.${variable.name}`;
                    if (variable.type === 'list') lists[key] = variable.value;
                    else if (variable.type !== 'broadcast_msg') variables[key] = variable.value;
                }
            }
            return {sprites, variables, lists};
        },

        // 舞台当前画面。走 renderer.requestSnapshot —— 它是 scratch-render 官方的截图出口：
        // 在**画完这一帧之后**同步调 canvas.toDataURL()，所以不受 preserveDrawingBuffer 影响
        // （直接读 canvas 在 WebGL 下经常只能拿到空白）。
        snapshotStage: ({timeoutMs = 3000} = {}) => new Promise(resolve => {
            const renderer = runtime().renderer;
            if (!renderer || typeof renderer.requestSnapshot !== 'function') {
                resolve(null);
                return;
            }
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                resolve(null);
            }, timeoutMs);
            renderer.requestSnapshot(dataUrl => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(dataUrl || null);
            });
        }),

        stageSize: () => {
            const rt = runtime();
            return {width: rt.stageWidth || 480, height: rt.stageHeight || 360};
        },

        // 当前编辑的角色名（UI 用它做默认值）
        currentSpriteName: () => {
            const target = vm.editingTarget;
            return target ? target.getName() : null;
        }
    };

    return port;
};
