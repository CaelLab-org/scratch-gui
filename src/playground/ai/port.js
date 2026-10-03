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

// 核心积木的 opcode 前缀。不在这张表里的前缀就是扩展积木，
// 写入前必须先把扩展加载起来，否则那些积木在 VM 里是「未知积木」，用户看到一堆灰块。
const CORE_PREFIXES = new Set([
    'motion', 'looks', 'sound', 'event', 'control', 'sensing',
    'operator', 'data', 'procedures', 'argument'
]);

/**
 * 建一个绑定到 vm 的 port
 * @param {object} opts  vm: scratch-vm 实例；getWorkspace: 取 Blockly 主工作区（整理布局用，可空）
 * @returns {object} 实现 ScratchPort 的对象
 */
export const createScratchPort = ({vm, getWorkspace}) => {
    const runtime = () => vm.runtime;
    const findTarget = name => runtime().targets.find(t => t.getName && t.getName() === name);
    const stage = () => runtime().getTargetForStage();

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
    const describeProject = () => runtime().targets.map(t => ({
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

    const port = {
        listSprites: () =>
            runtime().targets.map(t => ({name: t.getName(), isStage: t.isStage, id: t.id})),

        // ls 用的轻量清单：名字/脚本数/变量名/列表名，绝不渲染积木文本
        listSpritesDetailed: () => runtime().targets.map(t => {
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
            if (!target) throw new Error(`找不到角色「${spriteName}」`);
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
            for (const block of Object.values(converted.blocks)) {
                const prefix = String(block.opcode).split('_')[0];
                if (!CORE_PREFIXES.has(prefix)) needed.add(prefix);
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
                createdVariables,
                createdLists,
                warnings: converted.warnings
            };
        },

        deleteScript: (spriteName, topBlockId) => {
            const target = findTarget(spriteName);
            if (!target || !target.blocks.getBlock(topBlockId)) return false;
            target.blocks.deleteBlock(topBlockId); // 自带级联：子块、输入、子栈一起删
            refreshWorkspace();
            return true;
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
            for (const target of runtime().targets) {
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
